// src/content/content.ts
// Content script entry point.
// Listens for messages from the service worker and manages the overlay lifecycle.
// The content script is injected programmatically via chrome.scripting.executeScript.

import type { ServiceWorkerToContentScriptMessage } from '../shared/messages.ts';
import {
  showLoading,
  showResult,
  showError,
  dismissOverlay,
  setOverlayCSS,
} from './overlay.ts';
import { applyResult } from './text-replacement.ts';
import overlayCSS from './overlay.css?inline';

// ============================================================
// Bootstrap
// ============================================================

// Inject overlay CSS into the module so Shadow DOM has styles available
setOverlayCSS(overlayCSS);

// Guard against being injected multiple times into the same page.
// Chrome scripting may re-inject on repeated context menu actions.
const MARKER = '__ct_content_registered__';
if (!(window as unknown as Record<string, boolean>)[MARKER]) {
  (window as unknown as Record<string, boolean>)[MARKER] = true;
  registerMessageListener();
}

// ============================================================
// Message Listener
// ============================================================

function registerMessageListener(): void {
  chrome.runtime.onMessage.addListener(
    (message: unknown, _sender: chrome.runtime.MessageSender) => {
      if (!isServiceWorkerMessage(message)) return;
      handleMessage(message);
    },
  );
}

function handleMessage(message: ServiceWorkerToContentScriptMessage): void {
  switch (message.type) {
    case 'SHOW_LOADING':
      showLoading(message.payload.action, message.payload.originalText);
      break;

    case 'SHOW_RESULT': {
      const resultData: import('./overlay.ts').OverlayResultData = {
        action: message.payload.action,
        originalText: message.payload.originalText,
        resultText: message.payload.resultText,
        ...(message.payload.targetLanguage !== undefined
          ? { targetLanguage: message.payload.targetLanguage }
          : {}),
      };
      showResult(
        resultData,
        {
          onAccept: (resultText: string) => {
            applyResult(resultText).catch((err: unknown) => {
              console.error('[content] applyResult failed:', err);
            });
          },
          onReject: () => {
            // No action needed -- overlay is already dismissed by the callback
          },
        },
      );
      break;
    }

    case 'SHOW_ERROR':
      showError({
        errorCode: message.payload.errorCode,
        errorMessage: message.payload.errorMessage,
      });
      break;

    case 'DISMISS_OVERLAY':
      dismissOverlay();
      break;

    default: {
      // TypeScript exhaustiveness -- should never reach here
      const _exhaustive: never = message;
      console.warn('[content] Unhandled message type:', _exhaustive);
    }
  }
}

// ============================================================
// Type Guard
// ============================================================

function isServiceWorkerMessage(msg: unknown): msg is ServiceWorkerToContentScriptMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  const type = m['type'];
  return (
    type === 'SHOW_LOADING' ||
    type === 'SHOW_RESULT' ||
    type === 'SHOW_ERROR' ||
    type === 'DISMISS_OVERLAY'
  );
}
