// src/background/service-worker.ts
// Chrome MV3 service worker entry point.
// All event listeners must be registered synchronously at the top level.

import { registerContextMenus } from './context-menu.ts';
import { handleMessage } from './message-handler.ts';
import { resolveMenuAction, resolveCommandAction } from './context-menu.ts';
import type { ResolvedMenuAction } from './context-menu.ts';
import { validateTextInput } from '../shared/validators.ts';
import { classifyError, getUserMessage } from '../shared/errors.ts';
import { getSettings, saveSettings } from '../shared/storage.ts';
import { correctGrammar, translateText } from './tasks.ts';
import { getActiveClient } from './llm-client.ts';
import { CONTEXT_MENU_IDS } from '../shared/constants.ts';
import { isRunSelectionActionRequest } from '../shared/messages.ts';
import type { ServiceWorkerToContentScriptMessage, RunSelectionActionRequest } from '../shared/messages.ts';

// ============================================================
// Install Handler
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenus().catch((err: unknown) => {
    console.error('[service-worker] registerContextMenus failed on install:', err);
  });
  syncAllSitesToolbarFromSettings();
});

// ============================================================
// Startup Handler (re-register menus if service worker restarts)
// ============================================================

chrome.runtime.onStartup.addListener(() => {
  registerContextMenus().catch((err: unknown) => {
    console.error('[service-worker] registerContextMenus failed on startup:', err);
  });
  syncAllSitesToolbarFromSettings();
});

// ============================================================
// Message Handler (Popup -> Service Worker)
// ============================================================

chrome.runtime.onMessage.addListener(
  (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
    // Trust boundary: only accept messages that originate from this extension
    // (its own popup and content scripts share chrome.runtime.id). Reject
    // anything else -- e.g. another installed extension -- so privileged actions
    // like VALIDATE_OPENAI_KEY and SAVE_SETTINGS cannot be driven by outsiders.
    if (sender.id !== chrome.runtime.id) {
      sendResponse({
        success: false,
        error: 'Unauthorized sender.',
        errorCode: 'INVALID_MESSAGE',
      });
      return false;
    }

    // The in-page selection toolbar routes actions through here. Unlike the
    // popup requests (handled by handleMessage), this needs the sender's tab and
    // frame so the result overlay renders in the frame the selection lives in.
    if (isRunSelectionActionRequest(message)) {
      const tabId = sender.tab?.id;
      if (typeof tabId === 'number') {
        dispatchAction(
          tabId,
          sender.frameId ?? 0,
          message.payload.text,
          toResolvedAction(message.payload),
        );
      } else {
        console.warn('[service-worker] RUN_SELECTION_ACTION without a tab id');
      }
      sendResponse({ success: true });
      return false;
    }

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

    // Register/unregister the all-sites selection toolbar when the opt-in toggles.
    if (typeof newSettings['toolbarAllSites'] === 'boolean') {
      syncAllSitesToolbar(newSettings['toolbarAllSites'] as boolean).catch((err: unknown) => {
        console.error('[service-worker] syncAllSitesToolbar failed:', err);
      });
    }
  },
);

// ============================================================
// All-sites selection toolbar (opt-in dynamic content script)
// ============================================================
//
// By default the selection toolbar is a STATIC content script scoped to the
// Outlook allowlist in manifest.json. When the user opts in (Settings ->
// "Show the selection toolbar on all sites"), the same script is additionally
// registered dynamically for <all_urls>. This keeps the secure default narrow
// while letting users broaden it deliberately. It needs no new permission --
// the <all_urls> host permission and `scripting` are already granted. On Outlook
// both the static and dynamic scripts may match; the toolbar's injection guard
// makes the second load a no-op.

const ALL_SITES_SCRIPT_ID = 'ct-selection-toolbar-all-sites';

function syncAllSitesToolbarFromSettings(): void {
  getSettings()
    .then((settings) => syncAllSitesToolbar(settings.toolbarAllSites))
    .catch((err: unknown) => {
      console.error('[service-worker] Failed to sync all-sites toolbar on startup:', err);
    });
}

async function syncAllSitesToolbar(enabled: boolean): Promise<void> {
  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [ALL_SITES_SCRIPT_ID],
  });
  const isRegistered = existing.length > 0;

  if (enabled && !isRegistered) {
    await registerAllSitesToolbar();
  } else if (!enabled && isRegistered) {
    await chrome.scripting.unregisterContentScripts({ ids: [ALL_SITES_SCRIPT_ID] });
  }
}

async function registerAllSitesToolbar(): Promise<void> {
  const base: chrome.scripting.RegisteredContentScript = {
    id: ALL_SITES_SCRIPT_ID,
    js: ['selection-toolbar.js'],
    matches: ['<all_urls>'],
    allFrames: true,
    runAt: 'document_idle',
    persistAcrossSessions: false,
  };
  try {
    // matchOriginAsFallback reaches opaque child frames (about:blank / blob:)
    // used by some editors. Not all Chrome versions accept it with <all_urls>.
    await chrome.scripting.registerContentScripts([{ ...base, matchOriginAsFallback: true }]);
  } catch {
    await chrome.scripting.registerContentScripts([base]);
  }
}

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

  dispatchAction(tabId, frameId, selectionText, resolvedAction);
}

chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

// ============================================================
// Keyboard Command Handler
// ============================================================

/**
 * Reads the current selection in the frame this runs in. Injected verbatim
 * into every frame via chrome.scripting.executeScript, so it must be
 * self-contained (no references to outer scope).
 */
function readSelectionText(): string {
  // Runs injected inside a page frame (not the service worker), where `window`
  // and getSelection are defined -- hence the worker-context lint suppression.
  // eslint-disable-next-line no-undef
  return window.getSelection()?.toString() ?? '';
}

/**
 * A keyboard command carries no selection or frame, so scan every frame of the
 * tab for a live selection and return the first non-empty one. Webmail compose
 * editors (Outlook, GMX, ...) host their editable area in a child iframe, so
 * the selection is rarely in the top frame.
 */
async function findSelectionInFrames(
  tabId: number,
): Promise<{ frameId: number; text: string } | null> {
  let results: chrome.scripting.InjectionResult[];
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: readSelectionText,
    });
  } catch (err) {
    // e.g. a restricted page (chrome://, the Web Store) where injection is
    // forbidden. Nothing we can do -- treat as "no selection".
    console.warn('[service-worker] Selection scan failed:', err);
    return null;
  }

  for (const r of results) {
    const text = typeof r.result === 'string' ? r.result : '';
    if (text.trim().length > 0) {
      return { frameId: r.frameId ?? 0, text };
    }
  }
  return null;
}

function handleCommand(command: string, tab: chrome.tabs.Tab | undefined): void {
  if (!tab?.id) {
    console.error('[service-worker] Keyboard command without a valid tab ID');
    return;
  }
  const tabId = tab.id;

  getSettings()
    .then(async (settings) => {
      const resolvedAction = resolveCommandAction(command, settings);
      if (!resolvedAction) {
        // Not one of this extension's commands.
        return;
      }

      const found = await findSelectionInFrames(tabId);
      // When nothing is selected, dispatch into the top frame with empty text;
      // validation there surfaces the usual "select some text first" overlay.
      dispatchAction(tabId, found?.frameId ?? 0, found?.text ?? '', resolvedAction);
    })
    .catch((err: unknown) => {
      console.error('[service-worker] Keyboard command failed:', err);
    });
}

chrome.commands.onCommand.addListener(handleCommand);

// E2E/unit test hook: keyboard command events cannot be synthesized from
// outside the browser. Tests invoke this handler reference directly. It grants
// no capability beyond the keyboard commands already declared in the manifest.
(globalThis as typeof globalThis & {
  __ctCommandHandler?: typeof handleCommand;
}).__ctCommandHandler = handleCommand;

// ============================================================
// Shared Action Dispatch (context menu + keyboard command)
// ============================================================

/**
 * Injects the content script into the target frame and runs the resolved
 * action, driving the loading -> result / error overlay lifecycle. Shared by
 * the context-menu click handler and the keyboard-command handler so both
 * trigger paths behave identically.
 */
function dispatchAction(
  tabId: number,
  frameId: number,
  selectionText: string,
  resolvedAction: ResolvedMenuAction,
): void {
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

      // Summarize: hand off to the content script, which runs the
      // summarize-and-show-result flow itself.
      if (resolvedAction.action === 'summarize' && resolvedAction.length !== undefined) {
        sendToContentScript(tabId, frameId, {
          type: 'START_SUMMARIZE',
          payload: {
            originalText: selectionText,
            length: resolvedAction.length,
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

/**
 * Maps a validated RUN_SELECTION_ACTION payload to the ResolvedMenuAction shape
 * the shared dispatch path expects. The payload has already been validated by
 * isRunSelectionActionRequest, so each action's parameter is present and valid.
 */
function toResolvedAction(payload: RunSelectionActionRequest['payload']): ResolvedMenuAction {
  return {
    action: payload.action,
    ...(payload.targetLanguage !== undefined ? { targetLanguage: payload.targetLanguage } : {}),
    ...(payload.tone !== undefined ? { tone: payload.tone } : {}),
    ...(payload.length !== undefined ? { length: payload.length } : {}),
  };
}

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
  const client = getActiveClient(settings);
  const model = settings.provider === 'openai' ? settings.openaiModel : settings.model;
  const options = { model, temperature: 0.2 };

  if (action === 'correct') {
    return correctGrammar(client, text, options);
  }

  if (!targetLanguage) {
    throw new Error('targetLanguage is required for translate action');
  }

  return translateText(client, text, targetLanguage, options);
}
