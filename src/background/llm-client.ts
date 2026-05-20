// src/background/llm-client.ts
// Provider-agnostic LLMClient interface and factory. Service-worker only.

import type { ExtensionSettings, LLMResult } from '../shared/types.ts';
import { createOllamaClient } from './ollama-client.ts';
import { createOpenAIClient } from './openai-client.ts';

// ============================================================
// Re-exports
// ============================================================

export type { LLMResult } from '../shared/types.ts';

// ============================================================
// Interface Types
// ============================================================

/** Provider-agnostic options passed to a client call. */
export interface LLMCallOptions {
  model: string;
  timeoutMs?: number;
  temperature?: number;
}

/** Provider-agnostic health result. `detail` is a short, non-sensitive label. */
export interface LLMHealthResult {
  reachable: boolean;      // endpoint responded
  modelFound: boolean;     // requested model is available to this credential
  error: string | null;    // sanitized message, never raw provider body, never the key
}

// ============================================================
// Interface
// ============================================================

export interface LLMClient {
  /**
   * Sends a single non-streaming chat completion. Returns an LLMResult with
   * the trimmed text plus metadata (model, totalTokens, elapsedMs).
   * Throws on failure with a sanitized message (never containing the API key).
   */
  call(
    systemPrompt: string,
    userText: string,
    options: LLMCallOptions,
  ): Promise<LLMResult>;

  /**
   * Verifies the provider is reachable and the model/credential is usable.
   */
  healthCheck(model: string): Promise<LLMHealthResult>;
}

// ============================================================
// Factory
// ============================================================

/**
 * Resolves the active client from settings. Service-worker only.
 * The factory is the single place that reads settings.provider.
 */
export function getActiveClient(settings: ExtensionSettings): LLMClient {
  if (settings.provider === 'openai') {
    return createOpenAIClient({
      apiKey: settings.openaiApiKey,
      model: settings.openaiModel,
    });
  }
  return createOllamaClient({
    endpoint: settings.ollamaEndpoint,
  });
}
