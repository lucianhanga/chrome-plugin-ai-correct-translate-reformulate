// src/background/ollama-client.ts
// Fetch-based Ollama client for the Chrome extension service worker.
// Only the service worker calls Ollama -- never content scripts or the popup.

import type { LLMClient, LLMHealthResult } from './llm-client.ts';
import type { OllamaCallOptions, OllamaHealthResult } from '../shared/types.ts';
import {
  DEFAULT_MODEL,
  DEFAULT_OLLAMA_ENDPOINT,
  OLLAMA_PARAMS,
  REQUEST_TIMEOUT_MS,
  HEALTH_CHECK_TIMEOUT_MS,
} from '../shared/constants.ts';

// ============================================================
// Request Builder
// ============================================================

function buildChatRequest(
  systemPrompt: string,
  userText: string,
  model: string,
  temperature: number,
): object {
  return {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    stream: false,
    options: {
      temperature,
      top_p: OLLAMA_PARAMS.top_p,
      top_k: OLLAMA_PARAMS.top_k,
      num_ctx: OLLAMA_PARAMS.num_ctx,
      think: OLLAMA_PARAMS.think,
    },
  };
}

// ============================================================
// Main Call Function
// ============================================================

/**
 * Calls the Ollama OpenAI-compatible API (non-streaming).
 *
 * @param systemPrompt - The system prompt for the task
 * @param userText - The user's input text
 * @param options - Optional overrides for model, endpoint, timeout, temperature
 * @returns The model's trimmed response text
 * @throws Error with descriptive message on network failure, timeout, or Ollama error
 */
export async function callOllama(
  systemPrompt: string,
  userText: string,
  options: OllamaCallOptions = {},
): Promise<string> {
  const {
    model = DEFAULT_MODEL,
    endpoint = DEFAULT_OLLAMA_ENDPOINT,
    timeoutMs = REQUEST_TIMEOUT_MS,
    temperature = OLLAMA_PARAMS.temperature,
  } = options;

  if (!userText || userText.trim() === '') {
    return '';
  }

  const url = `${endpoint}/v1/chat/completions`;
  const body = buildChatRequest(systemPrompt, userText, model, temperature);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Ollama request timed out after ${timeoutMs}ms`, { cause: error });
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Ollama unreachable: ${msg}`, { cause: error });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 404) {
      throw new Error(`Model not found. Pull the model first: ollama pull ${model}`);
    }
    throw new Error(`Ollama API error ${response.status}: ${text}`);
  }

  const data: unknown = await response.json();

  const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content;

  if (typeof content !== 'string') {
    throw new Error(`Unexpected Ollama response shape: ${JSON.stringify(data)}`);
  }

  return content.trim();
}

// ============================================================
// Health Check
// ============================================================

/**
 * Check if Ollama is reachable and whether the target model is available.
 *
 * @param endpoint - Ollama base URL
 * @param model - Model name to verify
 * @returns Health status object
 */
export async function checkOllamaHealth(
  endpoint: string = DEFAULT_OLLAMA_ENDPOINT,
  model: string = DEFAULT_MODEL,
): Promise<OllamaHealthResult> {
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        reachable: false,
        modelFound: false,
        error: `Ollama returned HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as { models?: Array<{ name: string }> };
    const models = data?.models ?? [];
    const modelPrefix = model.split(':')[0] ?? model;
    const modelFound = models.some(
      (m) => m.name === model || m.name.startsWith(modelPrefix),
    );

    return { reachable: true, modelFound, error: null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { reachable: false, modelFound: false, error: msg };
  }
}

// ============================================================
// LLMClient Adapter
// ============================================================

/**
 * Wraps the lower-level callOllama / checkOllamaHealth functions in the
 * provider-agnostic LLMClient interface. The existing functions are unchanged;
 * this is a thin, pure adapter with no new behavior.
 */
export function createOllamaClient(cfg: { endpoint: string }): LLMClient {
  return {
    call: (system, user, opts): Promise<string> => {
      const callOpts: OllamaCallOptions = {
        endpoint: cfg.endpoint,
        model: opts.model,
      };
      if (opts.timeoutMs !== undefined) callOpts.timeoutMs = opts.timeoutMs;
      if (opts.temperature !== undefined) callOpts.temperature = opts.temperature;
      return callOllama(system, user, callOpts);
    },
    healthCheck: (model): Promise<LLMHealthResult> =>
      checkOllamaHealth(cfg.endpoint, model),
  };
}
