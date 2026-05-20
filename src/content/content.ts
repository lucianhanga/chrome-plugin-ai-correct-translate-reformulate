// src/content/content.ts
// Content script entry point.
// Receives messages from the service worker and manages the overlay lifecycle.
// For grammar correction the service worker drives loading -> result; for
// translation the service worker hands off via START_TRANSLATE and this script
// orchestrates the detect-language -> confirm -> translate steps itself.

import type {
  ServiceWorkerToContentScriptMessage,
  ServiceWorkerResponse,
  DetectLanguageResponse,
  SuccessResponse,
  ErrorResponse,
  SupportedLanguage,
} from '../shared/messages.ts';
import {
  showLoading,
  showDetecting,
  showLanguageConfirm,
  showResult,
  showError,
  dismissOverlay,
  setOverlayCSS,
} from './overlay.ts';
import type { CapturedTarget } from './text-replacement.ts';
import {
  applyResult,
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
      showResult(resultData, {
        onAccept: (resultText: string) => {
          applyResult(resultText).catch((err: unknown) => {
            console.error('[content] applyResult failed:', err);
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
      runTranslateFlow(message.payload.originalText, message.payload.targetLanguage).catch(
        (err: unknown) => {
          console.error('[content] translate flow failed:', err);
        },
      );
      break;

    default: {
      const _exhaustive: never = message;
      console.warn('[content] Unhandled message type:', _exhaustive);
    }
  }
}

// ============================================================
// Translate Flow Orchestration
// ============================================================

/**
 * Drive the interactive translate flow inside the page:
 *   detect language -> let the user confirm/correct it -> translate.
 */
async function runTranslateFlow(
  originalText: string,
  targetLanguage: SupportedLanguage,
): Promise<void> {
  // Capture the selection now, before any overlay click collapses it.
  const target = captureSelectionTarget();

  showDetecting();

  let detectedLanguage: SupportedLanguage;
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'DETECT_LANGUAGE',
      payload: { text: originalText },
    })) as ServiceWorkerResponse;

    if (isErrorResponse(response)) {
      showError({ errorCode: response.errorCode, errorMessage: response.error });
      return;
    }
    if (!isDetectLanguageResponse(response)) {
      showError({
        errorCode: 'UNEXPECTED_RESPONSE',
        errorMessage: 'Unexpected response from the extension service worker.',
      });
      return;
    }
    detectedLanguage = response.detectedLanguage;
  } catch (err) {
    console.error('[content] detect language failed:', err);
    showError({
      errorCode: 'OLLAMA_UNREACHABLE',
      errorMessage: 'Could not reach the extension service worker.',
    });
    return;
  }

  showLanguageConfirm(
    { originalText, detectedLanguage, targetLanguage },
    {
      onConfirm: (sourceLanguage: SupportedLanguage) => {
        runTranslation(originalText, targetLanguage, sourceLanguage, target).catch(
          (err: unknown) => {
            console.error('[content] translation failed:', err);
          },
        );
      },
      onCancel: () => {
        // Overlay already dismissed by the confirm renderer.
      },
    },
  );
}

/** Run the translation with the confirmed source language and render the result. */
async function runTranslation(
  originalText: string,
  targetLanguage: SupportedLanguage,
  sourceLanguage: SupportedLanguage,
  target: CapturedTarget,
): Promise<void> {
  showLoading('translate', originalText);

  let response: ServiceWorkerResponse;
  try {
    response = (await chrome.runtime.sendMessage({
      type: 'TRANSLATE',
      payload: { text: originalText, targetLanguage, sourceLanguage },
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

function isDetectLanguageResponse(r: ServiceWorkerResponse): r is DetectLanguageResponse {
  return r.success === true && 'detectedLanguage' in r;
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
