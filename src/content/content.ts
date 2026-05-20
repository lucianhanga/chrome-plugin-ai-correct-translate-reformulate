// src/content/content.ts
// Content script entry point.
// Receives messages from the service worker and manages the overlay lifecycle.
// For grammar correction the service worker drives loading -> result; for
// translation the service worker hands off via START_TRANSLATE and this script
// runs the translate-and-show-result flow (the source language is auto-detected
// by the model during the translation call).

import type {
  ServiceWorkerToContentScriptMessage,
  ServiceWorkerResponse,
  SuccessResponse,
  ErrorResponse,
  SupportedLanguage,
} from '../shared/messages.ts';
import {
  showLoading,
  showResult,
  showError,
  dismissOverlay,
  setOverlayCSS,
} from './overlay.ts';
import type { CapturedTarget } from './text-replacement.ts';
import {
  replaceCaptured,
  appendCaptured,
  copyResultToClipboard,
  captureSelectionTarget,
  isEditableTarget,
} from './text-replacement.ts';
import overlayCSS from './overlay.css?inline';

// ============================================================
// Bootstrap
// ============================================================

setOverlayCSS(overlayCSS);

// The page selection captured when a loading overlay is shown, so the result's
// Replace/Append actions can act on the original text field.
let capturedTarget: CapturedTarget = { kind: 'none' };

// Guard against being injected multiple times into the same page.
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
      // Capture the selection now, while it is still live, for Replace/Append.
      capturedTarget = captureSelectionTarget();
      showLoading(message.payload.action, message.payload.originalText, message.payload.provider);
      break;

    case 'SHOW_RESULT': {
      const target = capturedTarget;
      const resultData: import('./overlay.ts').OverlayResultData = {
        action: message.payload.action,
        originalText: message.payload.originalText,
        resultText: message.payload.resultText,
        editable: isEditableTarget(target),
        model: message.payload.model,
        totalTokens: message.payload.totalTokens,
        elapsedMs: message.payload.elapsedMs,
        ...(message.payload.targetLanguage !== undefined
          ? { targetLanguage: message.payload.targetLanguage }
          : {}),
      };
      // Auto-copy the result so it is immediately pasteable.
      copyResultToClipboard(message.payload.resultText).catch((err: unknown) => {
        console.error('[content] copy failed:', err);
      });
      showResult(resultData, {
        onReplace: (text: string) => {
          replaceCaptured(target, text).catch((err: unknown) => {
            console.error('[content] replace failed:', err);
          });
        },
        onAppend: (text: string) => {
          appendCaptured(target, text).catch((err: unknown) => {
            console.error('[content] append failed:', err);
          });
        },
        onReject: () => {
          // No action needed.
        },
      });
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

    case 'START_TRANSLATE':
      runTranslateFlow(
        message.payload.originalText,
        message.payload.targetLanguage,
        message.payload.provider,
      ).catch((err: unknown) => {
        console.error('[content] translate flow failed:', err);
      });
      break;

    default: {
      const _exhaustive: never = message;
      console.warn('[content] Unhandled message type:', _exhaustive);
    }
  }
}

// ============================================================
// Translate Flow
// ============================================================

/**
 * Translate the selected text and render the result. The source language is
 * auto-detected by the model during the translation call -- no separate
 * detection step. Replace/Append act on the captured selection.
 */
async function runTranslateFlow(
  originalText: string,
  targetLanguage: SupportedLanguage,
  provider: import('../shared/types.ts').LLMProvider = 'ollama',
): Promise<void> {
  // Capture the selection before the overlay is shown so Replace/Append can
  // act on the original text field.
  const target = captureSelectionTarget();

  showLoading('translate', originalText, provider);

  let response: ServiceWorkerResponse;
  try {
    response = (await chrome.runtime.sendMessage({
      type: 'TRANSLATE',
      payload: { text: originalText, targetLanguage },
    })) as ServiceWorkerResponse;
  } catch (err) {
    console.error('[content] translate request failed:', err);
    showError({
      errorCode: 'OLLAMA_UNREACHABLE',
      errorMessage: 'Could not reach the extension service worker.',
    });
    return;
  }

  if (isErrorResponse(response)) {
    showError({ errorCode: response.errorCode, errorMessage: response.error });
    return;
  }
  if (!isSuccessResponse(response)) {
    showError({
      errorCode: 'UNEXPECTED_RESPONSE',
      errorMessage: 'Unexpected response from the extension service worker.',
    });
    return;
  }

  const translation = response.result;

  // Auto-copy so the translation is immediately pasteable.
  await copyResultToClipboard(translation);

  showResult(
    {
      action: 'translate',
      originalText,
      resultText: translation,
      targetLanguage,
      editable: isEditableTarget(target),
      model: response.model,
      totalTokens: response.totalTokens,
      elapsedMs: response.elapsedMs,
    },
    {
      onReplace: (text: string) => {
        replaceCaptured(target, text).catch((e: unknown) => {
          console.error('[content] replace failed:', e);
        });
      },
      onAppend: (text: string) => {
        appendCaptured(target, text).catch((e: unknown) => {
          console.error('[content] append failed:', e);
        });
      },
      onReject: () => {
        // No action needed.
      },
    },
  );
}

// ============================================================
// Response Type Guards
// ============================================================

function isErrorResponse(r: ServiceWorkerResponse): r is ErrorResponse {
  return r.success === false;
}

function isSuccessResponse(r: ServiceWorkerResponse): r is SuccessResponse {
  return r.success === true && 'result' in r;
}

// ============================================================
// Message Type Guard
// ============================================================

function isServiceWorkerMessage(msg: unknown): msg is ServiceWorkerToContentScriptMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  const type = m['type'];
  return (
    type === 'SHOW_LOADING' ||
    type === 'SHOW_RESULT' ||
    type === 'SHOW_ERROR' ||
    type === 'DISMISS_OVERLAY' ||
    type === 'START_TRANSLATE'
  );
}
