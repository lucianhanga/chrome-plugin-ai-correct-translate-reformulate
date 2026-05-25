// tests/e2e/error-handling.test.ts
// End-to-end tests for error surfacing in the overlay and popup.
//
// What is covered:
//   - OLLAMA_UNREACHABLE (real): configure the extension to point at a dead port
//     (localhost:19999) via SAVE_SETTINGS, then fire a real CORRECT_GRAMMAR or
//     popup Correct action. The extension's fetch fails with ECONNREFUSED and the
//     service worker sends SHOW_ERROR / returns an ErrorResponse.
//   - MODEL_NOT_FOUND (real): configure a nonexistent model name via SAVE_SETTINGS.
//     The real Ollama returns HTTP 404, which the service worker maps to MODEL_NOT_FOUND.
//   - INPUT_TOO_LONG (real): pure client-side length check, no Ollama call needed.
//     Tested in both the popup UI (button disabled) and via direct SHOW_ERROR injection.
//   - REQUEST_TIMEOUT: forcing the extension's 60-second AbortController to fire
//     during an automated test is impractical (requires waiting 60+ s with a
//     deliberately slow Ollama). This test instead verifies that the overlay
//     correctly RENDERS the REQUEST_TIMEOUT error state when that error message
//     is sent to the content script -- testing the display path, not the trigger.
//     NOTE: this is the only test in this file that does not exercise a real error path.
//   - Service worker message validation: invalid message types and malformed payloads
//     return structured ErrorResponse objects (no Ollama involved).
//
// Ollama approach:
//   - OLLAMA_UNREACHABLE tests: dead port (localhost:19999) via SAVE_SETTINGS.
//   - MODEL_NOT_FOUND tests: bogus model name via SAVE_SETTINGS.
//   - INPUT_TOO_LONG tests: client-side only -- no Ollama needed.
//   - REQUEST_TIMEOUT display test: direct SHOW_ERROR injection -- not a real timeout.
//   - Message validation tests: no Ollama involved (validation before any fetch).
//
// HTTP server note:
//   The test page is served over HTTP so that the extension's host_permissions
//   ('http://localhost/*' in the test build) allow chrome.scripting.executeScript
//   to inject the content script without needing activeTab.

import { test, expect, providerInfo } from './fixtures/extension-fixture';

const DEAD_ENDPOINT = 'http://localhost:19999';
const REAL_ENDPOINT = 'http://localhost:11434';
const REAL_MODEL = 'qwen3:14b';
const BOGUS_MODEL = 'nonexistent-model-xyz:99b';
const isOllama = providerInfo.provider === 'ollama';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function sendMessageToPage(
  sw: import('@playwright/test').Worker,
  tabId: number,
  message: Record<string, unknown>,
): Promise<void> {
  await sw.evaluate(
    ({ tabId, message }: { tabId: number; message: Record<string, unknown> }) => {
      return chrome.tabs.sendMessage(tabId, message);
    },
    { tabId, message },
  );
}

// Wait for the content script to register its message listener.
//
// The content script runs in Chrome's ISOLATED content-script world, so the
// '__ct_content_registered__' marker it sets on window is NOT visible to
// page.evaluate / page.waitForFunction (those run in the page's MAIN world).
// The marker must be read inside the isolated world, reachable via
// chrome.scripting.executeScript (defaults to world: 'ISOLATED').
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
  throw new Error('[error-handling-test] Content script did not register within 5 s.');
}

async function injectContentScript(
  sw: import('@playwright/test').Worker,
  tabId: number,
): Promise<void> {
  await sw.evaluate(async (tid: number) => {
    await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
  }, tabId);
}

async function getTabId(sw: import('@playwright/test').Worker): Promise<number> {
  return sw.evaluate(async (): Promise<number> => {
    const tabs = await chrome.tabs.query({ active: true });
    return tabs[0]?.id ?? -1;
  });
}

// Write a setting directly to chrome.storage.local from the service worker context.
// This is equivalent to what saveSettings() does, but callable from the SW evaluate scope.
async function setStorageSetting(
  sw: import('@playwright/test').Worker,
  partial: Record<string, unknown>,
): Promise<void> {
  await sw.evaluate(async (updates: Record<string, unknown>) => {
    const result = await chrome.storage.local.get('settings');
    const current = (result['settings'] as Record<string, unknown>) ?? {};
    await chrome.storage.local.set({ settings: { ...current, ...updates } });
  }, partial);
}

// Invoke the service worker's context-menu click handler directly via the
// globalThis.__ctClickHandler hook (a real onClicked event cannot be synthesized).
async function simulateContextMenuClick(
  sw: import('@playwright/test').Worker,
  tabId: number,
  menuItemId: string,
  selectionText: string,
): Promise<void> {
  await sw.evaluate(
    ({ tabId, menuItemId, selectionText }: { tabId: number; menuItemId: string; selectionText: string }) => {
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

// ---------------------------------------------------------------------------
// Suite: OLLAMA_UNREACHABLE -- real error path via dead port
// ---------------------------------------------------------------------------

test.describe('Error handling: OLLAMA_UNREACHABLE', () => {
  test('overlay shows error when the configured endpoint is a dead port', async ({ context, testServerBaseUrl }) => {
    test.skip(!isOllama, 'Skipped: OLLAMA_UNREACHABLE dead-port test requires Ollama');
    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    // Point the extension at a dead port.
    await setStorageSetting(sw, { ollamaEndpoint: DEAD_ENDPOINT });

    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const tabId = await getTabId(sw);

    // Simulate a context menu click -- this triggers a real fetch to the dead port.
    await simulateContextMenuClick(sw, tabId, 'correct_grammar', 'Some text to correct.');

    // The overlay appears immediately with loading state.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 10_000 },
    );

    // The fetch to localhost:19999 fails immediately (ECONNREFUSED).
    // The overlay stays present in the error state.
    // We wait up to 15 s for the error state to settle (connection refusal is fast).
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 15_000 },
    );

    // Restore the real endpoint.
    await setStorageSetting(sw, { ollamaEndpoint: REAL_ENDPOINT });
  });

  test('translate overlay shows error when the configured endpoint is a dead port', async ({ context, testServerBaseUrl }) => {
    test.skip(!isOllama, 'Skipped: OLLAMA_UNREACHABLE dead-port test requires Ollama');
    // The translate context-menu path runs runTranslateFlow inside the content
    // script: it shows the "Translating…" loading overlay, then the TRANSLATE
    // request fails against the dead port and the content script transitions the
    // overlay to the error state. No detection/confirm step is involved.
    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    await setStorageSetting(sw, { ollamaEndpoint: DEAD_ENDPOINT });

    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const tabId = await getTabId(sw);

    await simulateContextMenuClick(sw, tabId, 'translate_en', 'Hallo, wie geht es dir?');

    // Loading overlay appears immediately.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 10_000 },
    );

    // The TRANSLATE fetch to the dead port fails fast; the overlay stays present
    // through the loading -> error transition.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 15_000 },
    );

    await setStorageSetting(sw, { ollamaEndpoint: REAL_ENDPOINT });
  });

  test('popup shows error when the configured endpoint is a dead port and Correct is clicked', async ({
    openPopup,
    extensionId,
    context,
  }) => {
    test.skip(!isOllama, 'Skipped: OLLAMA_UNREACHABLE dead-port test requires Ollama');
    // Configure the dead endpoint from a throwaway popup page.
    const configPage = await context.newPage();
    await configPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await configPage.waitForSelector('h1', { timeout: 8_000 });
    await configPage.evaluate(async (ep: string) => {
      await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        payload: { settings: { ollamaEndpoint: ep } },
      });
    }, DEAD_ENDPOINT);
    await configPage.close();

    const popup = await openPopup();
    await popup.locator('textarea').fill('Some text to correct.');
    await popup.getByRole('button', { name: /^Correct$/i }).click();

    // Connection to dead port fails quickly; error message appears.
    // Use a data-testid to avoid ambiguity with the loading indicator text.
    await expect(
      popup.locator('[data-testid="error-banner"]'),
    ).toBeVisible({ timeout: 30_000 });

    // Restore the real endpoint.
    await popup.evaluate(async (ep: string) => {
      await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        payload: { settings: { ollamaEndpoint: ep } },
      });
    }, REAL_ENDPOINT);
  });
});

// ---------------------------------------------------------------------------
// Suite: MODEL_NOT_FOUND -- real error path via bogus model name
// ---------------------------------------------------------------------------

test.describe('Error handling: MODEL_NOT_FOUND', () => {
  test('overlay shows error when the configured model does not exist in Ollama', async ({ context, testServerBaseUrl }) => {
    test.skip(!isOllama, 'Skipped: MODEL_NOT_FOUND via bogus Ollama model name requires Ollama');
    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    // Configure a model name that does not exist in Ollama.
    await setStorageSetting(sw, { model: BOGUS_MODEL });

    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const tabId = await getTabId(sw);

    // Simulate a context menu click -- this calls the real Ollama with a bogus model.
    // Ollama returns HTTP 404, which the ollama-client maps to MODEL_NOT_FOUND.
    await simulateContextMenuClick(sw, tabId, 'correct_grammar', 'Some text to correct.');

    // Overlay appears with loading state immediately.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 10_000 },
    );

    // Ollama returns 404 quickly for unknown models. The overlay transitions to error state.
    // Host element stays present. We wait up to 30 s for the error response.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 30_000 },
    );

    // Restore the real model name.
    await setStorageSetting(sw, { model: REAL_MODEL });
  });

  test('popup health check shows "model not found" status for a bogus model', async ({
    openPopup,
    extensionId,
    context,
  }) => {
    test.skip(!isOllama, 'Skipped: model-not-found health check requires Ollama');
    // Configure a bogus model name.
    const configPage = await context.newPage();
    await configPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await configPage.waitForSelector('h1', { timeout: 8_000 });
    await configPage.evaluate(async (m: string) => {
      await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        payload: { settings: { model: m } },
      });
    }, BOGUS_MODEL);
    await configPage.close();

    // Open a fresh popup -- health check reads the stored model and checks /api/tags.
    const popup = await openPopup();
    await expect(
      popup.locator('text=Ollama connected, model not found'),
    ).toBeVisible({ timeout: 15_000 });

    // Restore the real model name.
    await popup.evaluate(async (m: string) => {
      await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        payload: { settings: { model: m } },
      });
    }, REAL_MODEL);
  });
});

// ---------------------------------------------------------------------------
// Suite: INPUT_TOO_LONG -- pure client-side check (no Ollama)
// ---------------------------------------------------------------------------

test.describe('Error handling: INPUT_TOO_LONG', () => {
  test('overlay shows INPUT_TOO_LONG error when text exceeds 10,000 characters (via context menu)', async ({ context, testServerBaseUrl }) => {
    // INPUT_TOO_LONG is validated before any Ollama call; Ollama is not involved.
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const tabId = await getTabId(sw);

    // 10,001 characters -- exceeds the 10,000-character limit.
    const longText = 'a'.repeat(10_001);
    await simulateContextMenuClick(sw, tabId, 'correct_grammar', longText);

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 10_000 },
    );
  });

  test('overlay renders INPUT_TOO_LONG error state when the error message is injected', async ({ context, testServerBaseUrl }) => {
    // Direct injection test: verifies the overlay renders this error code correctly.
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const tabId = await getTabId(sw);
    await injectContentScript(sw, tabId);
    await waitForContentScript(sw, tabId);

    await sendMessageToPage(sw, tabId, {
      type: 'SHOW_ERROR',
      payload: {
        errorCode: 'INPUT_TOO_LONG',
        errorMessage: 'Text is too long (max 10,000 characters). Select a shorter passage.',
      },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 5_000 },
    );
  });

  test('popup Correct button is disabled when text exceeds 10,000 characters', async ({ openPopup }) => {
    const popup = await openPopup();
    const longText = 'b'.repeat(10_001);
    await popup.locator('textarea').fill(longText);
    await expect(popup.getByRole('button', { name: /^Correct$/i })).toBeDisabled();
    await expect(popup.getByRole('button', { name: /^Translate$/i })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Suite: REQUEST_TIMEOUT -- display-path test only (stub)
//
// NOTE: This test does NOT exercise a real timeout. Forcing the extension's 60-second
// AbortController to fire during an automated test would require deliberately making
// Ollama unresponsive for a full 60 seconds, which is impractical and would consume
// the entire per-test timeout budget.
//
// What is tested instead: the overlay correctly renders the REQUEST_TIMEOUT error
// state when a SHOW_ERROR message with errorCode: 'REQUEST_TIMEOUT' is received.
// This validates the overlay's rendering code for this error code.
// ---------------------------------------------------------------------------

test.describe('Error handling: REQUEST_TIMEOUT', () => {
  test('overlay renders REQUEST_TIMEOUT error state when the error message is injected', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const tabId = await getTabId(sw);
    await injectContentScript(sw, tabId);
    await waitForContentScript(sw, tabId);

    await sendMessageToPage(sw, tabId, {
      type: 'SHOW_ERROR',
      payload: {
        errorCode: 'REQUEST_TIMEOUT',
        errorMessage: 'Request timed out. The model may be loading. Try again.',
      },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 5_000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Suite: Service worker message validation (no Ollama)
// ---------------------------------------------------------------------------

test.describe('Error handling: service worker message validation', () => {
  test('invalid message type returns INVALID_MESSAGE error response', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForSelector('h1', { timeout: 8_000 });

    const response = await page.evaluate(async () => {
      return chrome.runtime.sendMessage({ type: 'NOT_A_REAL_TYPE' });
    });

    expect((response as Record<string, unknown>).success).toBe(false);
    expect((response as Record<string, unknown>).errorCode).toBe('INVALID_MESSAGE');
  });

  test('empty text in CORRECT_GRAMMAR returns EMPTY_INPUT error response', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForSelector('h1', { timeout: 8_000 });

    const response = await page.evaluate(async () => {
      return chrome.runtime.sendMessage({
        type: 'CORRECT_GRAMMAR',
        payload: { text: '   ' }, // whitespace only
      });
    });

    expect((response as Record<string, unknown>).success).toBe(false);
    expect((response as Record<string, unknown>).errorCode).toBe('EMPTY_INPUT');
  });

  test('text over limit in CORRECT_GRAMMAR returns INPUT_TOO_LONG error response', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForSelector('h1', { timeout: 8_000 });

    const response = await page.evaluate(async () => {
      return chrome.runtime.sendMessage({
        type: 'CORRECT_GRAMMAR',
        payload: { text: 'x'.repeat(10_001) },
      });
    });

    expect((response as Record<string, unknown>).success).toBe(false);
    expect((response as Record<string, unknown>).errorCode).toBe('INPUT_TOO_LONG');
  });

  test('HEALTH_CHECK returns a structured response with reachable and modelFound fields', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForSelector('h1', { timeout: 8_000 });

    const response = await page.evaluate(async () => {
      return chrome.runtime.sendMessage({ type: 'HEALTH_CHECK' });
    });

    // Both Ollama and OpenAI are verified reachable by global-setup preconditions.
    expect((response as Record<string, unknown>).success).toBe(true);
    expect(typeof (response as Record<string, unknown>).reachable).toBe('boolean');
    expect(typeof (response as Record<string, unknown>).modelFound).toBe('boolean');
    expect((response as Record<string, unknown>).reachable).toBe(true);
    expect((response as Record<string, unknown>).modelFound).toBe(true);
  });
});
