// src/background/message-handler.ts
// Message router: receives messages from popup, validates them, dispatches to task functions.

import type { ServiceWorkerResponse, ErrorCode } from '../shared/messages.ts';
import {
  isCorrectGrammarRequest,
  isTranslateRequest,
  isDetectLanguageRequest,
  isHealthCheckRequest,
  isGetSettingsRequest,
  isSaveSettingsRequest,
  isValidMessageType,
} from '../shared/messages.ts';
import { validateTextInput } from '../shared/validators.ts';
import { classifyError, getUserMessage } from '../shared/errors.ts';
import { getSettings, saveSettings } from '../shared/storage.ts';
import { correctGrammar, translateText, detectLanguage } from './tasks.ts';
import { checkOllamaHealth } from './ollama-client.ts';

// ============================================================
// Error Helper
// ============================================================

function errorResponse(errorCode: ErrorCode, errorMessage?: string): ServiceWorkerResponse {
  return {
    success: false,
    error: errorMessage ?? getUserMessage(errorCode),
    errorCode,
  };
}

// ============================================================
// Main Message Handler
// ============================================================

/**
 * Handles a single message from the popup.
 * Validates input, dispatches to the correct task function, and returns a typed response.
 */
export async function handleMessage(message: unknown): Promise<ServiceWorkerResponse> {
  // Structural guard: must be an object with a known type field
  if (
    typeof message !== 'object' ||
    message === null ||
    !isValidMessageType((message as Record<string, unknown>)['type'])
  ) {
    return errorResponse('INVALID_MESSAGE');
  }

  try {
    // CORRECT_GRAMMAR
    if (isCorrectGrammarRequest(message)) {
      const validation = validateTextInput(message.payload.text);
      if (!validation.valid) {
        return errorResponse(
          validation.errorCode ?? 'INVALID_MESSAGE',
          validation.errorMessage,
        );
      }

      const settings = await getSettings();
      const result = await correctGrammar(message.payload.text, {
        model: settings.model,
        endpoint: settings.ollamaEndpoint,
      });

      return { success: true, result };
    }

    // TRANSLATE
    if (isTranslateRequest(message)) {
      const validation = validateTextInput(message.payload.text);
      if (!validation.valid) {
        return errorResponse(
          validation.errorCode ?? 'INVALID_MESSAGE',
          validation.errorMessage,
        );
      }

      const settings = await getSettings();
      const result = await translateText(
        message.payload.text,
        message.payload.targetLanguage,
        message.payload.sourceLanguage,
        { model: settings.model, endpoint: settings.ollamaEndpoint },
      );

      return { success: true, result };
    }

    // DETECT_LANGUAGE
    if (isDetectLanguageRequest(message)) {
      const validation = validateTextInput(message.payload.text);
      if (!validation.valid) {
        return errorResponse(
          validation.errorCode ?? 'INVALID_MESSAGE',
          validation.errorMessage,
        );
      }

      const settings = await getSettings();
      const detectedLanguage = await detectLanguage(message.payload.text, {
        model: settings.model,
        endpoint: settings.ollamaEndpoint,
      });

      return { success: true, detectedLanguage };
    }

    // HEALTH_CHECK
    if (isHealthCheckRequest(message)) {
      const settings = await getSettings();
      const health = await checkOllamaHealth(settings.ollamaEndpoint, settings.model);
      return {
        success: true,
        reachable: health.reachable,
        modelFound: health.modelFound,
        error: health.error,
      };
    }

    // GET_SETTINGS
    if (isGetSettingsRequest(message)) {
      const settings = await getSettings();
      return { success: true, settings };
    }

    // SAVE_SETTINGS
    if (isSaveSettingsRequest(message)) {
      await saveSettings(message.payload.settings);
      return { success: true };
    }

    return errorResponse('INVALID_MESSAGE');
  } catch (error) {
    console.error('[message-handler] Unhandled error:', error);
    const errorCode = classifyError(error);
    return errorResponse(errorCode);
  }
}
