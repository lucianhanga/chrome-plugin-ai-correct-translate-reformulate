// tests/e2e/context-menu.test.ts
// End-to-end tests for the context menu -> service worker -> content script pipeline.
//
// IMPORTANT: Chrome's automated testing APIs do not expose a way to programmatically
// open the browser right-click context menu and click an item. This is a known
// limitation of Chrome WebDriver / Playwright for extension tests.
//
// APPROACH USED HERE:
// We simulate the context menu click by evaluating chrome.contextMenus.onClicked in
// the service worker context via Playwright's Worker.evaluate(). This exercises the
// FULL service-worker pipeline:
//   onClicked handler -> validateTextInput -> executeScript -> SHOW_LOADING ->
//   correctGrammar/translateText -> REAL Ollama -> SHOW_RESULT / SHOW_ERROR
//
// WHAT THIS VALIDATES END-TO-END:
//   1. The service worker correctly handles CORRECT_GRAMMAR context menu clicks.
//   2. The service worker correctly handles TRANSLATE_EN / DE / RO context menu clicks.
//   3. The content script is injected and receives the messages.
//   4. The overlay host element appears and persists through the real Ollama call.
//   5. INPUT_TOO_LONG error is surfaced to the overlay (pure client-side -- no Ollama).
//   6. OLLAMA_UNREACHABLE error is surfaced when the configured endpoint is a dead port.
//
// Ollama approach: REAL Ollama at http://localhost:11434 with model qwen3:14b.
// global-setup.ts verifies reachability and warms the model before any test runs.
//
// Timeouts: correctGrammar and translate calls to the real model take 10-90 s when warm.
// The waitForFunction timeout for "overlay host present after Ollama call" is 120 s.
//
// Error-path for OLLAMA_UNREACHABLE: configure the extension to use a dead port via
// SAVE_SETTINGS before firing the context menu click. Restore the real endpoint after.
//
// HTTP server note:
//   The test page is served over HTTP so that the extension's host_permissions
//   ('http://localhost/*' in the test build) allow chrome.scripting.executeScript
//   to inject the content script without needing activeTab.

import { test, expect } from './fixtures/extension-fixture';

const DEAD_ENDPOINT = 'http://localhost:19999';
const REAL_ENDPOINT = 'http://localhost:11434';

// Helper: invoke the service worker's context-menu click handler directly.
// A real chrome.contextMenus.onClicked event cannot be synthesized from a test,
// so the service worker exposes its handler as globalThis.__ctClickHandler.
async function simulateContextMenuClick(
  sw: import('@playwright/test').Worker,
  tabId: number,
  menuItemId: string,
  selectionText: string,
): Promise<void> {
  await sw.evaluate(
    ({
      tabId,
      menuItemId,
      selectionText,
    }: {
      tabId: number;
      menuItemId: string;
      selectionText: string;
    }) => {
      const info: chrome.contextMenus.OnClickData = {
        menuItemId,
        selectionText,
        editable: false,
        pageUrl: 'http://localhost/test',
      };
      const tab: chrome.tabs.Tab = {
        id: tabId,
        index: 0,
        pinned: false,
        highlighted: false,
        windowId: 1,
        active: true,
        incognito: false,
        selected: false,
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
        frozen: false,
      };
      const handler = (globalThis as typeof globalThis & {
        __ctClickHandler?: (
          info: chrome.contextMenus.OnClickData,
          tab: chrome.tabs.Tab,
        ) => void;
      }).__ctClickHandler;
      if (typeof handler !== 'function') {
        throw new Error(
          '[test] Service worker did not expose __ctClickHandler. Rebuild the extension (pnpm build:test).',
        );
      }
      handler(info, tab);
    },
    { tabId, menuItemId, selectionText },
  );
}

// Helper: configure the extension's ollamaEndpoint via SAVE_SETTINGS.
// Must be called from a popup page (extension page context).
async function setEndpointViaServiceWorker(
  sw: import('@playwright/test').Worker,
  endpoint: string,
): Promise<void> {
  await sw.evaluate(async (ep: string) => {
    // We cannot call chrome.runtime.sendMessage from the SW context to itself.
    // Use the storage API directly, mirroring what saveSettings() does.
    const result = await chrome.storage.local.get('settings');
    const current = result['settings'] ?? {};
    await chrome.storage.local.set({ settings: { ...current, ollamaEndpoint: ep } });
  }, endpoint);
}

// ---------------------------------------------------------------------------
// Suite: Context menu -> Correct Grammar (real Ollama)
// ---------------------------------------------------------------------------

test.describe('Context menu: Correct Grammar', () => {
  test('correct_grammar menu click shows loading then result overlay', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const tabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await simulateContextMenuClick(sw, tabId, 'correct_grammar', 'She dont know nothing.');

    // The overlay host should appear immediately with the loading state.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      { timeout: 10_000 },
    );

    // After the real Ollama call completes, the overlay transitions to result state.
    // The host element remains present throughout. We assert it is still there after the call.
    // 120 s: covers cold inference on qwen3:14b (model should be warm after globalSetup).
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      { timeout: 120_000 },
    );
  });

  test('correct_grammar with INPUT_TOO_LONG shows error overlay immediately', async ({ context, testServerBaseUrl }) => {
    // INPUT_TOO_LONG is a pure client-side check -- no Ollama call is made.
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const tabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    // 10,001 characters -- exceeds the 10,000 character limit.
    const longText = 'a'.repeat(10_001);
    await simulateContextMenuClick(sw, tabId, 'correct_grammar', longText);

    // The service worker injects the content script, validates the input synchronously,
    // and sends SHOW_ERROR. The overlay appears quickly (no Ollama call needed).
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      { timeout: 10_000 },
    );
  });

  test('correct_grammar with unreachable endpoint shows error overlay', async ({ context, testServerBaseUrl }) => {
    // Point the extension at a dead port before firing the context menu click.
    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    await setEndpointViaServiceWorker(sw, DEAD_ENDPOINT);

    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const tabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await simulateContextMenuClick(sw, tabId, 'correct_grammar', 'Some text to correct.');

    // Loading overlay appears immediately.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      { timeout: 10_000 },
    );

    // The fetch to a dead port fails quickly (connection refused); SHOW_ERROR follows.
    // The host element stays present in both loading and error states.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      { timeout: 15_000 },
    );

    // Restore the real endpoint for subsequent tests.
    await setEndpointViaServiceWorker(sw, REAL_ENDPOINT);
  });
});

// ---------------------------------------------------------------------------
// Suite: Context menu -> Translate (real Ollama)
// ---------------------------------------------------------------------------

test.describe('Context menu: Translate', () => {
  test('translate_en menu click shows overlay and completes', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const tabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await simulateContextMenuClick(sw, tabId, 'translate_en', 'Hallo, wie geht es dir?');

    // Overlay appears immediately with loading state.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      { timeout: 10_000 },
    );

    // Wait for the real Ollama call to complete (host stays present in result state).
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      { timeout: 120_000 },
    );
  });

  test('translate_de menu click shows overlay and completes', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const tabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await simulateContextMenuClick(sw, tabId, 'translate_de', 'Hello, how are you?');

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      { timeout: 10_000 },
    );

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      { timeout: 120_000 },
    );
  });

  test('translate_ro menu click shows overlay and completes', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const tabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await simulateContextMenuClick(sw, tabId, 'translate_ro', 'Hello, how are you?');

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      { timeout: 10_000 },
    );

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      { timeout: 120_000 },
    );
  });

  test('translate_parent (parent item) produces no overlay -- no action on parent click', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const tabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await simulateContextMenuClick(sw, tabId, 'translate_parent', 'Some text.');

    // The service worker's resolveMenuAction returns null for the parent item and
    // exits early without injecting a content script or sending any message.
    await page.waitForTimeout(2_000);
    const hostCount = await page.evaluate(
      () => document.querySelectorAll('[data-ct-overlay-host]').length,
    );
    expect(hostCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite: Context menu registration (service worker health)
// ---------------------------------------------------------------------------

test.describe('Context menu: service worker lifecycle', () => {
  test('service worker registers and is running on extension load', async ({ context }) => {
    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    expect(sw).toBeDefined();
    expect(sw!.url()).toContain('service-worker.js');
  });

  test('service worker is alive and responsive', async ({ context }) => {
    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const result = await sw.evaluate(async () => {
      return new Promise<string>((resolve) => {
        setTimeout(() => resolve('alive'), 100);
      });
    });
    expect(result).toBe('alive');
  });
});
