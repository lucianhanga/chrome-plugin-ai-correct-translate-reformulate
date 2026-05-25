// src/background/service-worker.ts
// Chrome MV3 service worker entry point.
// All event listeners must be registered synchronously at the top level.

import { registerContextMenus } from './context-menu.ts';
import { handleMessage } from './message-handler.ts';
import { resolveMenuAction } from './context-menu.ts';
import { validateTextInput } from '../shared/validators.ts';
import { classifyError, getUserMessage } from '../shared/errors.ts';
import { getSettings, saveSettings } from '../shared/storage.ts';
import { correctGrammar, translateText } from './tasks.ts';
import { getActiveClient } from './llm-client.ts';
import { GRAMMAR_CORRECT_SYSTEM, buildTranslateSystemPrompt } from '../shared/prompts.ts';
import { CONTEXT_MENU_IDS } from '../shared/constants.ts';
import type { ServiceWorkerToContentScriptMessage } from '../shared/messages.ts';

// ============================================================
// Install Handler
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenus().catch((err: unknown) => {
    console.error('[service-worker] registerContextMenus failed on install:', err);
  });
});

// ============================================================
// Startup Handler (re-register menus if service worker restarts)
// ============================================================

chrome.runtime.onStartup.addListener(() => {
  registerContextMenus().catch((err: unknown) => {
    console.error('[service-worker] registerContextMenus failed on startup:', err);
  });
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
// Storage Change Listener (keep terminology checkbox in sync)
// ============================================================

chrome.storage.onChanged.addListener(
  (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName !== 'local') return;
    const settingsChange = changes['settings'];
    if (!settingsChange) return;

    const newSettings = settingsChange.newValue as Record<string, unknown> | undefined;
    if (!newSettings) return;

    if (typeof newSettings['keepTerminology'] === 'boolean') {
      chrome.contextMenus.update(
        CONTEXT_MENU_IDS.KEEP_TERMINOLOGY,
        { checked: newSettings['keepTerminology'] as boolean },
      ).catch((err: unknown) => {
        // The menu item may not exist yet (e.g. on very first install before
        // onInstalled fires). Suppress the error.
        console.warn('[service-worker] contextMenus.update failed:', err);
      });
    }
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
  // The frame the user right-clicked in. A selection inside an iframe (e.g. a
  // webmail compose editor) lives in that frame's own document, so the content
  // script must be injected there -- injecting into the top frame would never
  // see the selection. Defaults to 0 (the top frame) when absent.
  const frameId = info.frameId ?? 0;
  const selectionText = info.selectionText ?? '';
  const menuItemId = String(info.menuItemId);

  // Handle the keep_terminology checkbox toggle before any LLM routing.
  // It is a pure settings toggle -- no content script injection needed.
  if (menuItemId === CONTEXT_MENU_IDS.KEEP_TERMINOLOGY) {
    saveSettings({ keepTerminology: info.checked === true }).catch((err: unknown) => {
      console.error('[service-worker] Failed to save keepTerminology:', err);
    });
    return;
  }

  const resolvedAction = resolveMenuAction(menuItemId);
  if (!resolvedAction) {
    // Clicked on a parent item (ct_root, translate_parent, reformulate_parent)
    // or a separator -- no action needed.
    return;
  }

  // Validate input before doing anything
  const validation = validateTextInput(selectionText);

  // Inject the content script first so it can receive any message we send
  // (including error messages from failed validation).
  chrome.scripting
    .executeScript({
      target: { tabId, frameIds: [frameId] },
      files: ['content.js'],
    })
    .then(async () => {
      // Content script is now injected. Send error and stop if input is invalid.
      if (!validation.valid) {
        const errorCode = validation.errorCode ?? 'INVALID_MESSAGE';
        sendToContentScript(tabId, frameId, {
          type: 'SHOW_ERROR',
          payload: {
            errorCode,
            errorMessage: validation.errorMessage ?? getUserMessage(errorCode),
          },
        });
        // Throwing here is cleaner; the .catch will handle it as a known user error.
        throw Object.assign(new Error(getUserMessage(errorCode)), { _validationError: true });
      }

      // Read settings to know the active provider for UI labelling.
      const settings = await getSettings();

      // Translate: hand off to the content script, which runs the
      // translate-and-show-result flow itself.
      if (resolvedAction.action === 'translate' && resolvedAction.targetLanguage !== undefined) {
        sendToContentScript(tabId, frameId, {
          type: 'START_TRANSLATE',
          payload: {
            originalText: selectionText,
            targetLanguage: resolvedAction.targetLanguage,
            provider: settings.provider,
          },
        });
        return null;
      }

      // Reformulate: hand off to the content script, which runs the
      // reformulate-and-show-result flow itself.
      if (resolvedAction.action === 'reformulate' && resolvedAction.tone !== undefined) {
        sendToContentScript(tabId, frameId, {
          type: 'START_REFORMULATE',
          payload: {
            originalText: selectionText,
            tone: resolvedAction.tone,
            keepTerminology: settings.keepTerminology,
            provider: settings.provider,
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
          provider: settings.provider,
        },
      };
      sendToContentScript(tabId, frameId, loadingMsg);

      // Dispatch to the correct task. By this point the reformulate and
      // translate branches have already returned, so action is always 'correct'.
      return processContextMenuAction(
        resolvedAction.action as 'correct' | 'translate',
        selectionText,
        resolvedAction.targetLanguage,
      );
    })
    .then((llmResult: import('../shared/types.ts').LLMResult | null) => {
      if (llmResult === null) {
        // Translate / reformulate path was handed off to the content script.
        return;
      }
      const resultMsg: ServiceWorkerToContentScriptMessage = {
        type: 'SHOW_RESULT',
        payload: {
          action: resolvedAction.action,
          originalText: selectionText,
          resultText: llmResult.text,
          model: llmResult.model,
          totalTokens: llmResult.totalTokens,
          elapsedMs: llmResult.elapsedMs,
          ...(resolvedAction.targetLanguage !== undefined
            ? { targetLanguage: resolvedAction.targetLanguage }
            : {}),
        },
      };
      sendToContentScript(tabId, frameId, resultMsg);
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
      sendToContentScript(tabId, frameId, {
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

function sendToContentScript(
  tabId: number,
  frameId: number,
  message: ServiceWorkerToContentScriptMessage,
): void {
  // Target the specific frame the action originated in, so the message reaches
  // the content script injected into that frame (which may be an iframe).
  chrome.tabs.sendMessage(tabId, message, { frameId }).catch((error: unknown) => {
    console.warn('[service-worker] Failed to send message to content script:', error);
  });
}

async function processContextMenuAction(
  action: 'correct' | 'translate',
  text: string,
  targetLanguage?: import('../shared/types.ts').SupportedLanguage,
): Promise<import('../shared/types.ts').LLMResult> {
  const settings = await getSettings();

  if (settings.provider === 'openai') {
    const client = getActiveClient(settings);
    const systemPrompt =
      action === 'correct'
        ? GRAMMAR_CORRECT_SYSTEM
        : buildTranslateSystemPrompt(targetLanguage!);
    return client.call(systemPrompt, text, { model: settings.openaiModel, temperature: 0.2 });
  }

  const ollamaOptions = { model: settings.model, endpoint: settings.ollamaEndpoint };

  if (action === 'correct') {
    return correctGrammar(text, ollamaOptions);
  }

  if (!targetLanguage) {
    throw new Error('targetLanguage is required for translate action');
  }

  return translateText(text, targetLanguage, ollamaOptions);
}
