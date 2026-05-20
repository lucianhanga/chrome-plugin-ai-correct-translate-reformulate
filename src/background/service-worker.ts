// src/background/service-worker.ts
// Chrome MV3 service worker entry point.
// All event listeners must be registered synchronously at the top level.

import { registerContextMenus } from './context-menu.ts';
import { handleMessage } from './message-handler.ts';
import { resolveMenuAction } from './context-menu.ts';
import { validateTextInput } from '../shared/validators.ts';
import { classifyError, getUserMessage } from '../shared/errors.ts';
import { getSettings } from '../shared/storage.ts';
import { correctGrammar, translateText } from './tasks.ts';
import type { ServiceWorkerToContentScriptMessage } from '../shared/messages.ts';

// ============================================================
// Install Handler
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenus();
});

// ============================================================
// Startup Handler (re-register menus if service worker restarts)
// ============================================================

chrome.runtime.onStartup.addListener(() => {
  registerContextMenus();
});

// ============================================================
// Message Handler (Popup -> Service Worker)
// ============================================================

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        console.error('[service-worker] Unexpected error in message handler:', error);
        sendResponse({
          success: false,
          error: 'An unexpected error occurred.',
          errorCode: 'UNKNOWN_ERROR',
        });
      });
    return true; // Keep message channel open for async response
  },
);

// ============================================================
// Context Menu Click Handler
// ============================================================

function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): void {
  if (!tab?.id) {
    console.error('[service-worker] Context menu click without valid tab ID');
    return;
  }

  const tabId = tab.id;
  const selectionText = info.selectionText ?? '';
  const menuItemId = String(info.menuItemId);

  const resolvedAction = resolveMenuAction(menuItemId);
  if (!resolvedAction) {
    // Clicked on a parent item (translate_parent) -- no action needed
    return;
  }

  // Validate input before doing anything
  const validation = validateTextInput(selectionText);

  // Inject the content script first so it can receive any message we send
  // (including error messages from failed validation).
  chrome.scripting
    .executeScript({
      target: { tabId },
      files: ['content.js'],
    })
    .then(() => {
      // Content script is now injected. Send error and stop if input is invalid.
      if (!validation.valid) {
        const errorCode = validation.errorCode ?? 'INVALID_MESSAGE';
        sendToContentScript(tabId, {
          type: 'SHOW_ERROR',
          payload: {
            errorCode,
            errorMessage: validation.errorMessage ?? getUserMessage(errorCode),
          },
        });
        // Return a resolved-but-sentinel value so the next .then does not fire.
        // Throwing here is cleaner; the .catch will handle it as a known user error.
        throw Object.assign(new Error(getUserMessage(errorCode)), { _validationError: true });
      }

      // Translate: hand off to the content script, which runs the
      // detect-language -> confirm -> translate flow itself.
      if (resolvedAction.action === 'translate' && resolvedAction.targetLanguage !== undefined) {
        sendToContentScript(tabId, {
          type: 'START_TRANSLATE',
          payload: {
            originalText: selectionText,
            targetLanguage: resolvedAction.targetLanguage,
          },
        });
        return null;
      }

      // Correct: the service worker drives loading -> result.
      const loadingMsg: ServiceWorkerToContentScriptMessage = {
        type: 'SHOW_LOADING',
        payload: {
          action: resolvedAction.action,
          originalText: selectionText,
        },
      };
      sendToContentScript(tabId, loadingMsg);

      // Dispatch to the correct task
      return processContextMenuAction(resolvedAction.action, selectionText, resolvedAction.targetLanguage);
    })
    .then((result: string | null) => {
      if (result === null) {
        // Translate path was handed off to the content script.
        return;
      }
      const resultMsg: ServiceWorkerToContentScriptMessage = {
        type: 'SHOW_RESULT',
        payload: {
          action: resolvedAction.action,
          originalText: selectionText,
          resultText: result,
          ...(resolvedAction.targetLanguage !== undefined
            ? { targetLanguage: resolvedAction.targetLanguage }
            : {}),
        },
      };
      sendToContentScript(tabId, resultMsg);
    })
    .catch((error: unknown) => {
      // If this is a validation error, SHOW_ERROR was already sent above -- do not re-send.
      if (
        error instanceof Error &&
        (error as Error & { _validationError?: boolean })._validationError === true
      ) {
        return;
      }
      console.error('[service-worker] Context menu action failed:', error);
      const errorCode = classifyError(error);
      sendToContentScript(tabId, {
        type: 'SHOW_ERROR',
        payload: {
          errorCode,
          errorMessage: getUserMessage(errorCode),
        },
      });
    });
}

chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

// E2E test hook: a real chrome.contextMenus.onClicked event cannot be
// synthesized from outside the browser. Tests invoke this handler reference
// directly. It is an inert function on the worker's global scope -- not
// reachable from web pages and grants no capability beyond the context menu.
(globalThis as typeof globalThis & {
  __ctClickHandler?: typeof handleContextMenuClick;
}).__ctClickHandler = handleContextMenuClick;

// ============================================================
// Helpers
// ============================================================

function sendToContentScript(tabId: number, message: ServiceWorkerToContentScriptMessage): void {
  chrome.tabs.sendMessage(tabId, message).catch((error: unknown) => {
    console.warn('[service-worker] Failed to send message to content script:', error);
  });
}

async function processContextMenuAction(
  action: 'correct' | 'translate',
  text: string,
  targetLanguage?: import('../shared/types.ts').SupportedLanguage,
): Promise<string> {
  const settings = await getSettings();
  const ollamaOptions = {
    model: settings.model,
    endpoint: settings.ollamaEndpoint,
  };

  if (action === 'correct') {
    return correctGrammar(text, ollamaOptions);
  }

  if (!targetLanguage) {
    throw new Error('targetLanguage is required for translate action');
  }

  return translateText(text, targetLanguage, settings.sourceLanguageOverride, ollamaOptions);
}
