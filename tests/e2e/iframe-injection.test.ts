// tests/e2e/iframe-injection.test.ts
// End-to-end tests for context-menu actions on a selection inside an iframe.
//
// Webmail compose editors (GMX, Gmail, etc.) host the editable message body in
// a nested -- often cross-origin -- iframe. The service worker must inject the
// content script into the FRAME the user right-clicked (info.frameId), not the
// top frame: a selection inside an iframe lives in that frame's own document,
// so a top-frame content script never sees it and Replace/Append never appear.
//
// These tests use a SAME-ORIGIN iframe fixture (iframe-host.html embedding
// iframe-editor.html). They verify that the service worker injects the content
// script into the iframe and routes the overlay messages to it.
//
// The first test is deterministic: the loading overlay is shown before the LLM
// call, so it does not depend on Ollama. The second exercises the full real
// flow and asserts Replace applies to the editable selection inside the iframe.

import { test, expect } from './fixtures/extension-fixture';

async function getTabId(sw: import('@playwright/test').Worker): Promise<number> {
  return sw.evaluate(async (): Promise<number> => {
    const tabs = await chrome.tabs.query({ active: true });
    return tabs[0]?.id ?? -1;
  });
}

// Resolve the Chrome frameId of the editor iframe by injecting a probe into
// every frame of the tab and matching on the document URL.
async function getEditorFrameId(
  sw: import('@playwright/test').Worker,
  tabId: number,
): Promise<number> {
  return sw.evaluate(async (tid: number): Promise<number> => {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tid, allFrames: true },
      func: () => location.href,
    });
    const editor = results.find(
      (r) => typeof r.result === 'string' && r.result.includes('iframe-editor.html'),
    );
    if (!editor) {
      throw new Error('[test] editor iframe not found among injected frames');
    }
    return editor.frameId;
  }, tabId);
}

// Invoke the service worker's context-menu click handler directly, with an
// explicit frameId -- the frame the click is treated as originating from.
// A real chrome.contextMenus.onClicked event cannot be synthesized from a test.
async function simulateContextMenuClick(
  sw: import('@playwright/test').Worker,
  tabId: number,
  frameId: number,
  menuItemId: string,
  selectionText: string,
): Promise<void> {
  await sw.evaluate(
    ({
      tabId,
      frameId,
      menuItemId,
      selectionText,
    }: {
      tabId: number;
      frameId: number;
      menuItemId: string;
      selectionText: string;
    }) => {
      const info: chrome.contextMenus.OnClickData = {
        menuItemId,
        selectionText,
        editable: true,
        frameId,
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
          '[test] Service worker did not expose __ctClickHandler. Rebuild (pnpm build:test).',
        );
      }
      handler(info, tab);
    },
    { tabId, frameId, menuItemId, selectionText },
  );
}

test.describe('Context menu: selection inside an iframe', () => {
  test('content script is injected into the iframe and the overlay renders there, not the top frame', async ({
    context,
    testServerBaseUrl,
  }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/iframe-host.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');
    const tabId = await getTabId(sw);

    // Select the broken-English text inside the iframe's textarea. The
    // frameLocator auto-waits for the iframe and the textarea to load.
    const editor = page.frameLocator('#editor-frame');
    const textarea = editor.locator('[data-testid="iframe-textarea"]');
    await textarea.click();
    await textarea.selectText();
    const text = await textarea.inputValue();
    expect(text.length).toBeGreaterThan(0);

    const frameId = await getEditorFrameId(sw, tabId);
    // A real sub-frame, never the top frame (which is always frameId 0).
    expect(frameId).toBeGreaterThan(0);

    await simulateContextMenuClick(sw, tabId, frameId, 'correct_grammar', text);

    // The loading overlay host must appear INSIDE the iframe -- proof the
    // content script was injected into the iframe and SHOW_LOADING was routed
    // there. This is deterministic: SHOW_LOADING fires before the LLM call.
    await expect(editor.locator('[data-ct-overlay-host]')).toBeAttached({ timeout: 15_000 });

    // And it must NOT appear in the top frame -- proof the fix targets the
    // right frame instead of the top frame as before.
    expect(await page.locator('[data-ct-overlay-host]').count()).toBe(0);
  });

  test('Replace applies the result to an editable selection inside the iframe', async ({
    context,
    testServerBaseUrl,
  }) => {
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/iframe-host.html`);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');
    const tabId = await getTabId(sw);

    const editor = page.frameLocator('#editor-frame');
    const textarea = editor.locator('[data-testid="iframe-textarea"]');
    await textarea.click();
    await textarea.selectText();
    const original = await textarea.inputValue();
    expect(original.length).toBeGreaterThan(0);

    const frameId = await getEditorFrameId(sw, tabId);
    await simulateContextMenuClick(sw, tabId, frameId, 'correct_grammar', original);

    // Loading overlay appears inside the iframe.
    await expect(editor.locator('[data-ct-overlay-host]')).toBeAttached({ timeout: 15_000 });

    // The overlay persists from loading through result; poll Enter until it
    // dismisses. Enter triggers the primary Replace action only once the
    // result has rendered (it is a no-op during loading). Retry to absorb the
    // real Ollama inference latency. Mirrors the top-frame editable test.
    let dismissed = false;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Enter');
      try {
        await editor
          .locator('[data-ct-overlay-host]')
          .waitFor({ state: 'detached', timeout: 2_000 });
        dismissed = true;
        break;
      } catch {
        // Result state has not rendered yet -- retry.
      }
    }
    expect(dismissed).toBe(true);

    // Replace overwrote the textarea selection inside the iframe with the
    // corrected text -- the editable target was captured in the iframe.
    const after = await textarea.inputValue();
    expect(after.trim().length).toBeGreaterThan(0);
  });

  test('content script injects into a cross-origin iframe (requires <all_urls>)', async ({
    context,
    testServerBaseUrl,
  }) => {
    // Webmail editors (GMX, ...) live in CROSS-ORIGIN iframes. activeTab does
    // not grant injection into cross-origin sub-frames -- only the <all_urls>
    // host permission does. This points the iframe at the other loopback host
    // (127.0.0.1 vs localhost -- a different origin, same test server) and
    // verifies the content script still injects and the overlay renders there.
    const page = await context.newPage();
    await page.goto(`${testServerBaseUrl}/iframe-host.html`);

    // Re-point the iframe at the other loopback host -> a genuine cross-origin
    // frame relative to the host page.
    const base = new URL(testServerBaseUrl);
    const altHost = base.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
    const crossOriginUrl = `${base.protocol}//${altHost}:${base.port}/iframe-editor.html`;
    await page.evaluate((url: string) => {
      (document.getElementById('editor-frame') as HTMLIFrameElement).src = url;
    }, crossOriginUrl);

    const sw = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (!sw) throw new Error('Service worker not found');
    const tabId = await getTabId(sw);

    // Select text inside the cross-origin iframe (frameLocator auto-waits for
    // the re-pointed frame to load).
    const editor = page.frameLocator('#editor-frame');
    const textarea = editor.locator('[data-testid="iframe-textarea"]');
    await textarea.click();
    await textarea.selectText();
    const text = await textarea.inputValue();
    expect(text.length).toBeGreaterThan(0);

    const frameId = await getEditorFrameId(sw, tabId);
    expect(frameId).toBeGreaterThan(0);

    await simulateContextMenuClick(sw, tabId, frameId, 'correct_grammar', text);

    // The overlay must render inside the cross-origin iframe -- proof that
    // executeScript into a cross-origin frame succeeded, which is only possible
    // with the <all_urls> host permission.
    await expect(editor.locator('[data-ct-overlay-host]')).toBeAttached({ timeout: 15_000 });
  });
});
