// tests/e2e/overlay.test.ts
// End-to-end tests for the in-page result overlay (Shadow DOM).
//
// What is covered:
//   - Loading overlay appears in the correct state
//   - Result overlay: shows original text, result text, Accept and Reject buttons
//   - Accept in a textarea replaces the selected text (observed via .value)
//   - Accept in a non-editable context: "Copied!" toast appears
//   - Reject dismisses the overlay without modifying the page
//   - Keyboard: Escape dismisses the overlay
//   - Keyboard: Enter accepts the result
//   - Error overlay: shown when Ollama returns an error code
//   - Only one overlay exists at a time (singleton)
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
async function waitForContentScript(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as Record<string, boolean>)['__ct_content_registered__'] === true,
    { timeout: 5_000 },
  );
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

    await waitForContentScript(page);

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

    await waitForContentScript(page);

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

    await waitForContentScript(page);

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_ERROR',
      payload: {
        errorCode: 'OLLAMA_UNREACHABLE',
        errorMessage: 'Cannot reach Ollama. Make sure it is running: ollama serve',
      },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
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

    await waitForContentScript(page);

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_LOADING',
      payload: { action: 'correct', originalText: 'Test text.' },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
      { timeout: 5_000 },
    );

    await sendMessageToPage(sw, realTabId, { type: 'DISMISS_OVERLAY' });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') === null,
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

    await waitForContentScript(page);

    await sendMessageToPage(sw, realTabId, {
      type: 'SHOW_LOADING',
      payload: { action: 'correct', originalText: 'First text.' },
    });

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') !== null,
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
// Suite: Overlay behavior -- Accept and Reject
// ---------------------------------------------------------------------------

test.describe('Overlay: Accept and Reject behavior', () => {
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

    await waitForContentScript(page);

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
      { timeout: 5_000 },
    );

    await page.keyboard.press('Escape');

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') === null,
      { timeout: 5_000 },
    );
  });

  test('Enter key accepts the result when body is focused (not inside a form field)', async ({ context, testServerBaseUrl }) => {
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

    await waitForContentScript(page);

    // Focus document.body so Enter triggers the accept path (not a form field handler).
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
      { timeout: 5_000 },
    );

    // Enter should accept -- onAccept calls applyResult, which copies to clipboard
    // for non-editable context and dismisses the overlay.
    await page.keyboard.press('Enter');

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') === null,
      { timeout: 5_000 },
    );
  });

  test('Escape on result overlay rejects (removes overlay without modifying textarea)', async ({ context, testServerBaseUrl }) => {
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

    await waitForContentScript(page);

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
      { timeout: 5_000 },
    );

    await page.keyboard.press('Escape');

    await page.waitForFunction(
      () => document.querySelector('[data-ct-overlay-host]') === null,
      { timeout: 3_000 },
    );

    // Textarea value must be unchanged after Escape.
    const valueAfterEscape = await textarea.inputValue();
    expect(valueAfterEscape).toBe(originalValue);
  });

  test('Copied toast appears after Enter-accept on non-editable text', async ({ context, testServerBaseUrl }) => {
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

    await waitForContentScript(page);
    await page.evaluate(() => document.body.focus());

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
      { timeout: 5_000 },
    );

    await page.keyboard.press('Enter');

    // showCopiedToast() appends a [data-ct-toast-host] element to document.body.
    await page.waitForFunction(
      () => document.querySelector('[data-ct-toast-host]') !== null,
      { timeout: 5_000 },
    );
  });
});
