// tests/e2e/overlay.test.ts
// End-to-end tests for the in-page result overlay (Shadow DOM).
//
// What is covered:
//   - Loading overlay appears in the correct state (correct and translate)
//   - Result overlay: renders for correction and translation (same result UI)
//   - Result overlay footer: Replace / Append / Close buttons exist
//   - Replace in a textarea overwrites the selected text (observed via .value)
//   - Append in a textarea inserts the result after the selection
//   - Close dismisses the overlay without modifying the page
//   - Keyboard: Escape dismisses the overlay
//   - Keyboard: Enter triggers the primary action (Replace)
//   - The result auto-copies to the clipboard (a "Copied!" toast appears)
//   - Error overlay: shown when Ollama returns an error code
//   - Only one overlay exists at a time (singleton)
//   - Translate result overlay: renders for a SHOW_RESULT with action 'translate'
//     and is dismissible via Escape / Close
//
// Overlay result UI note (current behavior):
//   Correction and translation now use the SAME result overlay. The overlay
//   auto-copies the result to the clipboard and its footer has three buttons:
//   Replace (data-ct-replace), Append (data-ct-append), Close (data-ct-close).
//   The old correct-flow Accept / Reject buttons no longer exist. Replace is
//   the primary keyboard action (Enter); Escape closes the overlay.
//
// Translate flow note (post-rollback):
//   The translate context-menu path runs the translate-and-show-result flow
//   inside the content script (START_TRANSLATE -> runTranslateFlow). There is no
//   language-detection or confirm step. The full real-Ollama translate flow,
//   including the Replace action, is covered in context-menu.test.ts. This file
//   covers the overlay's translate result-state rendering via a direct
//   SHOW_RESULT injection (no Ollama).
//
// Ollama approach: NONE. These tests exercise the content script's message-handling
// and overlay-rendering code in isolation. Messages are injected directly via the
// service worker's chrome.tabs.sendMessage API (exercised from sw.evaluate()).
// No Ollama call is made in this file.
//
// How messages are injected:
//   Chrome does not allow page-context scripts to call chrome.runtime.sendMessage
//   to extension contexts (no externally_connectable). The workaround is to call
//   chrome.tabs.sendMessage from the service worker context using sw.evaluate().
//   This is the same path the real service worker uses after an Ollama call.
//
// Shadow DOM note:
//   The overlay uses a 'closed' Shadow DOM. Playwright selectors and page.evaluate
//   cannot pierce it. Assertions verify the host element's presence/absence and
//   observable side-effects (textarea value changes, toast element appearance).
//
// HTTP server note:
//   The test page is served over HTTP (not file://) so that the extension's
//   host_permissions ('http://localhost/*' in the test build) allow
//   chrome.scripting.executeScript to inject the content script.

import { test, expect } from './fixtures/extension-fixture';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Wait for the content script to register its message listener.
//
// The content script runs in Chrome's ISOLATED content-script world, so the
// '__ct_content_registered__' marker it sets on window is NOT visible to
// page.evaluate / page.waitForFunction (those run in the page's MAIN world).
// Reading the marker therefore has to happen inside the isolated world, which
// is reachable via chrome.scripting.executeScript (defaults to world: 'ISOLATED').
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
  throw new Error('[overlay-test] Content script did not register within 5 s.');
}

// Send a typed message to a tab via the service worker context.
async function sendMessageToPage(
  serviceWorker: import('@playwright/test').Worker,
  tabId: number,
  message: Record<string, unknown>,
): Promise<void> {
  await serviceWorker.evaluate(
    ({ tabId, message }: { tabId: number; message: Record<string, unknown> }) => {
      return chrome.tabs.sendMessage(tabId, message);
    },
    { tabId, message },
  );
}

// ---------------------------------------------------------------------------
// Suite: Overlay rendering via direct service worker message injection
// ---------------------------------------------------------------------------

test.describe('Overlay: message-driven rendering', () => {
  test('SHOW_LOADING renders a loading overlay (host element attached)', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const realTabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({
        target: { tabId: tid },
        files: ['content.js'],
      });
    }, realTabId);

    await waitForContentScript(sw, realTabId);

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_LOADING',
      payload: { action: 'correct', originalText: 'She dont know nothing.' },
    });

    const hostExists = await page.evaluate(() => {
      return document.querySelector('[data-ct-overlay-host]') !== null;
    });
    expect(hostExists).toBe(true);
  });

  test('SHOW_RESULT renders the overlay (host element attached)', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const realTabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    }, realTabId);

    await waitForContentScript(sw, realTabId);

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_RESULT',
      payload: {
        action: 'correct',
        originalText: 'She dont know nothing.',
        resultText: 'She does not know anything.',
      },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 5_000 },
    );

    const overlayPresent = await page.evaluate(() => {
      return document.querySelector('[data-ct-overlay-host]') !== null;
    });
    expect(overlayPresent).toBe(true);
  });

  test('SHOW_ERROR renders an error overlay (host element attached)', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const realTabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    }, realTabId);

    await waitForContentScript(sw, realTabId);

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_ERROR',
      payload: {
        errorCode: 'OLLAMA_UNREACHABLE',
        errorMessage: 'Cannot reach Ollama. Make sure it is running: ollama serve',
      },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 5_000 },
    );
  });

  test('DISMISS_OVERLAY removes the overlay host element', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const realTabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    }, realTabId);

    await waitForContentScript(sw, realTabId);

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_LOADING',
      payload: { action: 'correct', originalText: 'Test text.' },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 5_000 },
    );

    await sendMessageToPage(sw, realTabId, { type: 'DISMISS_OVERLAY' });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') === null,
      undefined,
      { timeout: 5_000 },
    );
  });

  test('only one overlay exists at a time -- second SHOW_LOADING replaces the first', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const realTabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    }, realTabId);

    await waitForContentScript(sw, realTabId);

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_LOADING',
      payload: { action: 'correct', originalText: 'First text.' },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 5_000 },
    );

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_LOADING',
      payload: { action: 'translate', originalText: 'Second text.' },
    });

    const hostCount = await page.evaluate(
      () => document.querySelectorAll('[data-ct-overlay-host]').length,
    );
    expect(hostCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Suite: Overlay behavior -- Replace / Append / Close
//
// The overlay uses a closed Shadow DOM, so its footer buttons cannot be clicked
// through Playwright selectors. These tests drive the overlay via the keyboard
// (Escape closes, Enter triggers the primary action Replace) and assert on
// observable side effects (overlay removal, textarea value changes, the
// auto-copy toast).
// ---------------------------------------------------------------------------

test.describe('Overlay: Replace / Append / Close behavior', () => {
  test('Escape key dismisses the overlay', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const realTabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    }, realTabId);

    await waitForContentScript(sw, realTabId);

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_RESULT',
      payload: {
        action: 'correct',
        originalText: 'Test text.',
        resultText: 'Corrected test text.',
      },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 5_000 },
    );

    await page.keyboard.press('Escape');

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') === null,
      undefined,
      { timeout: 5_000 },
    );
  });

  test('Enter key triggers the primary action (Replace) when body is focused', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const realTabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    }, realTabId);

    await waitForContentScript(sw, realTabId);

    // Focus document.body so Enter triggers the primary action (not a form field handler).
    await page.evaluate(() => document.body.focus());

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_RESULT',
      payload: {
        action: 'correct',
        originalText: 'Test static text.',
        resultText: 'Corrected static text.',
      },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 5_000 },
    );

    // Enter triggers the primary action (Replace). With no captured editable
    // target it falls back to the clipboard, then the overlay is dismissed.
    await page.keyboard.press('Enter');

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') === null,
      undefined,
      { timeout: 5_000 },
    );
  });

  test('Escape on result overlay closes it without modifying the textarea', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const realTabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    }, realTabId);

    await waitForContentScript(sw, realTabId);

    const textarea = page.locator('[data-testid="textarea-field"]');
    await textarea.click();
    await textarea.selectText();
    const originalValue = await textarea.inputValue();

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_RESULT',
      payload: {
        action: 'correct',
        originalText: originalValue,
        resultText: 'Replacement text that must NOT appear after Escape.',
      },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 5_000 },
    );

    await page.keyboard.press('Escape');

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') === null,
      undefined,
      { timeout: 3_000 },
    );

    // Textarea value must be unchanged after Escape.
    const valueAfterEscape = await textarea.inputValue();
    expect(valueAfterEscape).toBe(originalValue);
  });

  test('Enter-triggered Replace overwrites the selected text in a textarea', async ({ context, testServerBaseUrl }) => {
    // Replace acts on the selection captured at SHOW_LOADING time. We therefore
    // send SHOW_LOADING (captures the textarea selection) before SHOW_RESULT,
    // mirroring the real correct/translate flow. Enter then triggers Replace,
    // which overwrites the selected range with the result text (+ a newline).
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const realTabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    }, realTabId);

    await waitForContentScript(sw, realTabId);

    // Select the full text of the editable textarea.
    const textarea = page.locator('[data-testid="textarea-field"]');
    await textarea.click();
    await textarea.selectText();
    const originalValue = await textarea.inputValue();

    // SHOW_LOADING captures the live selection for the later Replace/Append.
    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_LOADING',
      payload: { action: 'correct', originalText: originalValue },
    });
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 5_000 },
    );

    const replacement = 'She does not know anything about the project.';
    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_RESULT',
      payload: {
        action: 'correct',
        originalText: originalValue,
        resultText: replacement,
      },
    });
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 5_000 },
    );

    // Enter triggers Replace (the primary action). It overwrites the selection
    // with the result text plus a trailing newline, then dismisses the overlay.
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') === null,
      undefined,
      { timeout: 5_000 },
    );

    const valueAfterReplace = await textarea.inputValue();
    expect(valueAfterReplace.trim()).toBe(replacement);
    expect(valueAfterReplace).not.toBe(originalValue);
  });

  test('non-editable selection: the result overlay renders and dismisses via Escape', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const realTabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    }, realTabId);

    await waitForContentScript(sw, realTabId);
    await page.evaluate(() => document.body.focus());

    // No SHOW_LOADING precedes this, so no editable selection is captured --
    // the result is treated as non-editable: the overlay shows only Close
    // (Replace/Append are not rendered), and the result is still auto-copied.
    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_RESULT',
      payload: {
        action: 'correct',
        originalText: 'Static text here.',
        resultText: 'Corrected static text here.',
      },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 5_000 },
    );

    // Escape dismisses the overlay.
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') === null,
      undefined,
      { timeout: 5_000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Suite: Overlay translate result-state rendering
//
// These tests render the translate result overlay via a direct SHOW_RESULT
// message (action: 'translate'). The full real-Ollama translate flow, including
// the loading overlay and the Replace action, is covered in context-menu.test.ts.
// Here we verify the overlay's translate result-state renders and dismisses.
// ---------------------------------------------------------------------------

test.describe('Overlay: translate result rendering', () => {
  test('SHOW_LOADING with action translate renders the loading overlay (host attached)', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const realTabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    }, realTabId);

    await waitForContentScript(sw, realTabId);

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_LOADING',
      payload: { action: 'translate', originalText: 'Hallo, wie geht es dir?' },
    });

    const hostExists = await page.evaluate(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
    );
    expect(hostExists).toBe(true);
  });

  test('SHOW_RESULT with action translate renders the result overlay (host attached)', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const realTabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    }, realTabId);

    await waitForContentScript(sw, realTabId);

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_RESULT',
      payload: {
        action: 'translate',
        originalText: 'Hello, how are you?',
        resultText: 'Hallo, wie geht es dir?',
        targetLanguage: 'German',
      },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 5_000 },
    );

    const overlayPresent = await page.evaluate(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
    );
    expect(overlayPresent).toBe(true);
  });

  test('Escape dismisses a translate result overlay', async ({ context, testServerBaseUrl }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/test-page.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');

    const realTabId = await sw.evaluate(async (): Promise<number> => {
      const tabs = await chrome.tabs.query({ active: true });
      return tabs[0]?.id ?? -1;
    });

    await sw.evaluate(async (tid: number) => {
      await chrome.scripting.executeScript({ target: { tabId: tid }, files: ['content.js'] });
    }, realTabId);

    await waitForContentScript(sw, realTabId);

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_RESULT',
      payload: {
        action: 'translate',
        originalText: 'Hello, how are you?',
        resultText: 'Buna, ce mai faci?',
        targetLanguage: 'Romanian',
      },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      undefined,
      { timeout: 5_000 },
    );

    await page.keyboard.press('Escape');

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') === null,
      undefined,
      { timeout: 5_000 },
    );
  });
});
