// src/background/openai-client.ts
// OpenAI chat completions client for the Chrome extension service worker.
// Only the service worker calls OpenAI -- never content scripts or the popup.
//
// Security invariants (enforced here, never relaxed):
//   - The API key is constructed into the Authorization header at call-site only.
//   - The key is never logged, never placed in an Error message or cause.
//   - Raw OpenAI response bodies are never surfaced in user-facing errors.

import type { LLMClient, LLMHealthResult } from './llm-client.ts';
import { LLMError } from '../shared/errors.ts';
import {
  OPENAI_API_BASE,
  REQUEST_TIMEOUT_MS,
  HEALTH_CHECK_TIMEOUT_MS,
} from '../shared/constants.ts';

// ============================================================
// Request Builder
// ============================================================

// The gpt-5-nano / gpt-5.4-nano models reject non-default sampling
// parameters (temperature, top_p) with HTTP 400. The request is kept
// minimal -- model, messages, stream -- so the model uses its own
// defaults. max_tokens / max_completion_tokens are omitted for the same
// reason.
function buildOpenAIRequest(
  systemPrompt: string,
  userText: string,
  model: string,
): object {
  return {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    stream: false,
  };
}

// ============================================================
// Main Call Function
// ============================================================

/**
 * Calls the OpenAI chat completions API (non-streaming).
 *
 * @param apiKey - OpenAI bearer key (used only in the Authorization header)
 * @param systemPrompt - The system prompt for the task
 * @param userText - The user's input text
 * @param model - The model identifier (e.g. 'gpt-5-nano')
 * @param timeoutMs - Request timeout in milliseconds
 * @returns The model's trimmed response text
 * @throws LLMError with an appropriate ErrorCode on failure
 */
export async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  model: string,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<string> {
  if (!userText || userText.trim() === '') {
    return '';
  }

  const url = `${OPENAI_API_BASE}/v1/chat/completions`;
  const body = buildOpenAIRequest(systemPrompt, userText, model);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LLMError('REQUEST_TIMEOUT', `OpenAI request timed out after ${timeoutMs}ms`);
    }
    throw new LLMError('OPENAI_UNREACHABLE', 'Cannot reach OpenAI');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    throw new LLMError('OPENAI_AUTH_FAILED', 'OpenAI auth failed (401)');
  }

  if (response.status === 403) {
    throw new LLMError('OPENAI_QUOTA_EXCEEDED', 'OpenAI billing or region error (403)');
  }

  if (response.status === 429) {
    // Attempt to read the error type to distinguish quota from rate-limit.
    // Only the error.type field is read; the body is never surfaced to the user.
    let errorType: string | undefined;
    try {
      const errBody = await response.json() as { error?: { type?: unknown } };
      if (typeof errBody?.error?.type === 'string') {
        errorType = errBody.error.type;
      }
    } catch {
      // Parsing failure: default to rate-limited below.
    }
    if (errorType === 'insufficient_quota') {
      throw new LLMError('OPENAI_QUOTA_EXCEEDED', 'OpenAI quota exceeded (429)');
    }
    throw new LLMError('OPENAI_RATE_LIMITED', 'OpenAI rate limit reached (429)');
  }

  if (!response.ok) {
    // Other non-OK: surface only the status code, never the body.
    throw new LLMError('UNEXPECTED_RESPONSE', `OpenAI returned HTTP ${response.status}`);
  }

  const data: unknown = await response.json();

  // Defensive extraction mirroring ollama-client.ts. The error message does NOT
  // include JSON.stringify(data) because an OpenAI response body could contain
  // account- or request-correlated identifiers.
  const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content;

  if (typeof content !== 'string') {
    throw new LLMError('UNEXPECTED_RESPONSE', 'Unexpected response shape from OpenAI');
  }

  return content.trim();
}

// ============================================================
// Health Check
// ============================================================

/**
 * Checks whether the OpenAI API is reachable and whether the target model
 * is accessible with the given API key.
 *
 * @param apiKey - OpenAI bearer key (used only in the Authorization header)
 * @param model - Model name to verify
 * @returns Health status object (never throws)
 */
export async function checkOpenAIHealth(
  apiKey: string,
  model: string,
): Promise<LLMHealthResult> {
  try {
    const response = await fetch(`${OPENAI_API_BASE}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });

    if (response.status === 401) {
      return { reachable: true, modelFound: false, error: 'Invalid API key.' };
    }

    if (response.status === 429) {
      return { reachable: true, modelFound: false, error: 'Rate limit reached. Try again shortly.' };
    }

    if (!response.ok) {
      return {
        reachable: false,
        modelFound: false,
        error: `OpenAI returned HTTP ${response.status}`,
      };
    }

    const data = await response.json() as { data?: Array<{ id: string }> };
    const models = data?.data ?? [];
    const modelFound = models.some((m) => m.id === model);

    return { reachable: true, modelFound, error: null };
  } catch {
    return { reachable: false, modelFound: false, error: 'Cannot reach OpenAI.' };
  }
}

// ============================================================
// LLMClient Factory
// ============================================================

/**
 * Creates a provider-agnostic LLMClient backed by the OpenAI API.
 * The API key is captured in the closure and never exposed via the interface.
 */
export function createOpenAIClient(cfg: { apiKey: string; model: string }): LLMClient {
  return {
    call: (system, user, opts): Promise<string> =>
      callOpenAI(cfg.apiKey, system, user, opts.model, opts.timeoutMs),
    healthCheck: (model): Promise<LLMHealthResult> =>
      checkOpenAIHealth(cfg.apiKey, model),
  };
}
