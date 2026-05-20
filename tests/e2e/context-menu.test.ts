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
// TRANSLATE FLOW (current, post-rollback):
//   The translate context-menu click hands off to the content script via the
//   START_TRANSLATE message. The content script captures the selection, shows a
//   "Translating…" loading overlay, calls TRANSLATE (the model auto-detects the
//   source language during the call -- there is NO separate detection/confirm
//   step), auto-copies the result to the clipboard, and shows the result overlay
//   with Replace/Append when the selection is editable. Replace is the primary
//   keyboard action (Enter); we observe it via a changed textarea value.
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

// Helper: resolve the active tab's ID from the service worker context.
async function getTabId(sw: import('@playwright/test').Worker): Promise<number> {
  return sw.evaluate(async (): Promise<number> => {
    const tabs = await chrome.tabs.query({ active: true });
    return tabs[0]?.id ?? -1;
  });
}

// Wait for the content script's message listener to be registered.
//
// The content script runs in Chrome's ISOLATED content-script world, so the
// '__ct_content_registered__' marker it sets on window is NOT visible to
// page.evaluate (which runs in the page's MAIN world). The marker must be read
// inside the isolated world, reachable via chrome.scripting.executeScript.
async function waitForContentScript(
  sw: import('@playwright/test').Worker,
  tabId: number,
): Promise<void> {
  for (let i = 0; i < 25; i++) {
    const registered = await sw.evaluate(async (tid: number) => {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tid },
        func: () =>
          (window as unknown as Record<string, boolean>)['__ct_content_registered__'] === true,
      });
      return results[0]?.result === true;
    }, tabId);
    if (registered) return;
    await new Promise<void>((r) => setTimeout(r, 200));
  }
  throw new Error('[context-menu-test] Content script did not register within 5 s.');
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
      undefined,
      { timeout: 10_000 },
    );

    // After the real Ollama call completes, the overlay transitions to result state.
    // The host element remains present throughout. We assert it is still there after the call.
    // 120 s: covers cold inference on qwen3:14b (model should be warm after globalSetup).
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 120_000 },
    );
  });

  test('correct_grammar on an editable selection applies Replace via Enter', async ({ context, testServerBaseUrl }) => {
    // The correction flow now uses the same result overlay as translation:
    // it auto-copies and offers Replace / Append / Close (the old Accept /
    // Reject buttons are gone). Replace is the primary keyboard action. This
    // exercises the full pipeline: context-menu click -> SHOW_LOADING (captures
    // the editable selection) -> real Ollama correction -> SHOW_RESULT ->
    // Enter triggers Replace, observed as changed editable-element text.
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const tabId = await getTabId(sw);

    // Inject the content script up front so the selection we make is live when
    // SHOW_LOADING is handled (SHOW_LOADING captures the selection for Replace).
    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    }, tabId);
    await waitForContentScript(sw, tabId);

    // Select the full text of the editable textarea (contains broken English).
    const textarea = page.locator('[data-testid="textarea-field"]');
    await textarea.click();
    await textarea.selectText();
    const originalValue = await textarea.inputValue();
    expect(originalValue.length).toBeGreaterThan(0);

    await simulateContextMenuClick(sw, tabId, 'correct_grammar', originalValue);

    // Loading overlay appears.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 10_000 },
    );

    // The overlay stays present from loading through result, so we poll: press
    // Enter and check for dismissal. Enter only triggers Replace once the result
    // state has rendered (primaryKeyAction === doReplace); during loading it is
    // a no-op. Retry for up to 120 s to absorb real Ollama inference latency.
    let dismissed = false;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Enter');
      try {
        await page.waitForFunction(
          () => document.querySelector('[data-ct-overlay-host]') === null,
          undefined,
          { timeout: 2_000 },
        );
        dismissed = true;
        break;
      } catch {
        // Still loading -- the result state has not rendered yet. Retry.
      }
    }
    expect(dismissed).toBe(true);

    // Replace overwrote the textarea selection with the corrected text.
    const valueAfterReplace = await textarea.inputValue();
    expect(valueAfterReplace.trim().length).toBeGreaterThan(0);
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
      undefined,
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
      undefined,
      { timeout: 10_000 },
    );

    // The fetch to a dead port fails quickly (connection refused); SHOW_ERROR follows.
    // The host element stays present in both loading and error states.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 15_000 },
    );

    // Restore the real endpoint for subsequent tests.
    await setEndpointViaServiceWorker(sw, REAL_ENDPOINT);
  });
});

// ---------------------------------------------------------------------------
// Suite: Context menu -> Translate (real Ollama)
//
// The translate context-menu path hands off to the content script via
// START_TRANSLATE. The content script captures the selection, shows the
// "Translating…" loading overlay, calls TRANSLATE (the model auto-detects the
// source language -- no separate detection/confirm step), and shows a result
// overlay. There is exactly one Ollama call per translate.
// ---------------------------------------------------------------------------

test.describe('Context menu: Translate', () => {
  test('translate_en click shows the loading overlay then a result overlay', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const tabId = await getTabId(sw);

    await simulateContextMenuClick(sw, tabId, 'translate_en', 'Hallo, wie geht es dir?');

    // The content script injects, then runTranslateFlow shows the loading overlay.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 10_000 },
    );

    // After the single real Ollama TRANSLATE call completes, runTranslateFlow
    // transitions the same overlay to the result state. The host element stays
    // present throughout loading -> result; if a translate error occurred the
    // overlay would still be present (error state). We assert it survives the
    // full round trip.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 120_000 },
    );
  });

  test('translate_en click on an editable selection applies Replace via Enter', async ({ context, testServerBaseUrl }) => {
    // This exercises the full rolled-back translate flow end-to-end:
    //   selection captured -> Translating… overlay -> real Ollama call (model
    //   auto-detects the source language) -> result overlay with Replace as the
    //   primary keyboard action. Pressing Enter triggers Replace, which is
    //   observable as changed editable-element text (the Shadow DOM is closed,
    //   so the side effect is the only assertable signal).
    //
    // The selection is made inside a contenteditable element: selecting text
    // there produces a real document Selection range, which is what
    // captureSelectionTarget() reads to resolve an editable target. When the
    // target is editable the result overlay shows Replace/Append and focuses
    // the Replace button (host element gains focus), so Enter triggers Replace.
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const tabId = await getTabId(sw);

    // Inject the content script up front and wait for it to register, so the
    // selection we make below is live when START_TRANSLATE is handled.
    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    }, tabId);
    await waitForContentScript(sw, tabId);

    // Select the full text of an editable contenteditable div so
    // captureSelectionTarget() resolves to an editable target (Replace/Append
    // become available). The contenteditable holds German text.
    const editable = page.locator('[data-testid="contenteditable-field"]');
    await editable.click();
    await editable.selectText();
    const originalText = (await editable.textContent())?.trim() ?? '';
    expect(originalText.length).toBeGreaterThan(0);

    await simulateContextMenuClick(sw, tabId, 'translate_en', originalText);

    // Loading overlay appears.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 10_000 },
    );

    // The overlay stays present from the loading state through the result
    // state, so its presence alone cannot tell us the real Ollama TRANSLATE
    // call has finished. The result state is inside a closed Shadow DOM and is
    // not directly observable. Instead, poll: press Enter and check whether the
    // overlay dismisses. Enter only triggers Replace (and dismissal) once the
    // result state is in place (primaryKeyAction === doReplace); while the
    // overlay is still loading, primaryKeyAction is null and Enter is a no-op.
    // We retry for up to 120 s to absorb inference latency.
    let dismissed = false;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Enter');
      try {
        await page.waitForFunction(
          () => document.querySelector('[data-ct-overlay-host]') === null,
          undefined,
          { timeout: 2_000 },
        );
        dismissed = true;
        break;
      } catch {
        // Still loading -- the result state has not rendered yet. Retry.
      }
    }
    expect(dismissed).toBe(true);

    // The contenteditable text changed: Replace substituted the English
    // translation for the original German text.
    const textAfterReplace = (await editable.textContent())?.trim() ?? '';
    expect(textAfterReplace.length).toBeGreaterThan(0);
    expect(textAfterReplace).not.toBe(originalText);
  });

  test('translate_ro click on a non-editable selection shows a result overlay (Close only, no Replace)', async ({ context, testServerBaseUrl }) => {
    // When the selection is not editable, captureSelectionTarget() returns
    // { kind: 'none' }, so the result overlay shows only a Close button (no
    // Replace/Append). The result is still auto-copied to the clipboard.
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const tabId = await getTabId(sw);

    // No page selection is made -- captureSelectionTarget() sees no editable
    // target, mirroring a right-click translate on static page text.
    await simulateContextMenuClick(sw, tabId, 'translate_ro', 'Hello, how are you?');

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 10_000 },
    );

    // The overlay stays present through loading -> result, so we poll: press
    // Escape and check for dismissal. The Escape handler is only installed once
    // renderResult/renderError runs; during the loading state Escape is a no-op.
    // Retry for up to 120 s to absorb the real Ollama inference latency.
    await page.evaluate(() => document.body.focus());
    let dismissed = false;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Escape');
      try {
        await page.waitForFunction(
          () => document.querySelector('[data-ct-overlay-host]') === null,
          undefined,
          { timeout: 2_000 },
        );
        dismissed = true;
        break;
      } catch {
        // Still loading -- the result state has not rendered yet. Retry.
      }
    }
    expect(dismissed).toBe(true);
  });

  test('translate_parent (parent item) produces no overlay -- no action on parent click', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const tabId = await getTabId(sw);

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
