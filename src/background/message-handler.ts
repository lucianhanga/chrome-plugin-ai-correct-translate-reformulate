// src/background/message-handler.ts
// Message router: receives messages from popup, validates them, dispatches to task functions.

import type { ServiceWorkerResponse, ErrorCode } from '../shared/messages.ts';
import {
  isCorrectGrammarRequest,
  isTranslateRequest,
  isHealthCheckRequest,
  isGetSettingsRequest,
  isSaveSettingsRequest,
  isValidateOpenAIKeyRequest,
  isValidMessageType,
} from '../shared/messages.ts';
import { validateTextInput } from '../shared/validators.ts';
import { classifyError, getUserMessage } from '../shared/errors.ts';
import { getSettings, saveSettings } from '../shared/storage.ts';
import { correctGrammar, translateText } from './tasks.ts';
import { checkOllamaHealth } from './ollama-client.ts';
import { getActiveClient } from './llm-client.ts';
import { checkOpenAIHealth } from './openai-client.ts';
import { GRAMMAR_CORRECT_SYSTEM, buildTranslateSystemPrompt } from '../shared/prompts.ts';

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

      let llmResult: import('../shared/types.ts').LLMResult;
      if (settings.provider === 'openai') {
        // Route through the provider-agnostic client for OpenAI.
        const client = getActiveClient(settings);
        llmResult = await client.call(
          GRAMMAR_CORRECT_SYSTEM,
          message.payload.text,
          { model: settings.openaiModel, temperature: 0.2 },
        );
      } else {
        // Ollama path: delegate to correctGrammar so existing tests remain valid.
        llmResult = await correctGrammar(message.payload.text, {
          model: settings.model,
          endpoint: settings.ollamaEndpoint,
        });
      }

      return {
        success: true,
        result: llmResult.text,
        model: llmResult.model,
        totalTokens: llmResult.totalTokens,
        elapsedMs: llmResult.elapsedMs,
      };
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

      let llmResult: import('../shared/types.ts').LLMResult;
      if (settings.provider === 'openai') {
        // Route through the provider-agnostic client for OpenAI.
        const client = getActiveClient(settings);
        const systemPrompt = buildTranslateSystemPrompt(
          message.payload.targetLanguage,
        );
        llmResult = await client.call(
          systemPrompt,
          message.payload.text,
          { model: settings.openaiModel, temperature: 0.2 },
        );
      } else {
        // Ollama path: delegate to translateText so existing tests remain valid.
        llmResult = await translateText(
          message.payload.text,
          message.payload.targetLanguage,
          { model: settings.model, endpoint: settings.ollamaEndpoint },
        );
      }

      return {
        success: true,
        result: llmResult.text,
        model: llmResult.model,
        totalTokens: llmResult.totalTokens,
        elapsedMs: llmResult.elapsedMs,
      };
    }

    // HEALTH_CHECK
    if (isHealthCheckRequest(message)) {
      const settings = await getSettings();
      if (settings.provider === 'openai') {
        const health = await checkOpenAIHealth(settings.openaiApiKey, settings.openaiModel);
        return {
          success: true,
          reachable: health.reachable,
          modelFound: health.modelFound,
          error: health.error,
        };
      }
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
      // Redact the API key: the popup only needs to know whether a key is set.
      // The real key never leaves the service worker except in outbound API requests.
      const redactedSettings = {
        ...settings,
        openaiApiKey: settings.openaiApiKey.length > 0 ? '__SET__' : '',
      };
      return { success: true, settings: redactedSettings };
    }

    // SAVE_SETTINGS
    if (isSaveSettingsRequest(message)) {
      const incoming = message.payload.settings;
      // If the popup sends the redaction sentinel, do not overwrite the stored key.
      const toSave: Partial<typeof incoming> = { ...incoming };
      if (toSave.openaiApiKey === '__SET__') {
        delete toSave.openaiApiKey;
      }
      await saveSettings(toSave);
      return { success: true };
    }

    // VALIDATE_OPENAI_KEY
    if (isValidateOpenAIKeyRequest(message)) {
      const health = await checkOpenAIHealth(message.payload.key, message.payload.model);
      return {
        success: true,
        valid: health.reachable && health.modelFound,
        modelFound: health.modelFound,
        error: health.error,
      };
    }

    return errorResponse('INVALID_MESSAGE');
  } catch (error) {
    console.error('[message-handler] Unhandled error:', error);
    const errorCode = classifyError(error);
    return errorResponse(errorCode);
  }
}
