// tests/unit/openai-client.test.ts
// Unit tests for the OpenAI chat-completions client.
//
// fetch is always mocked -- no test in this file ever reaches api.openai.com.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  callOpenAI,
  checkOpenAIHealth,
  createOpenAIClient,
} from '../../src/background/openai-client.ts';
import { LLMError } from '../../src/shared/errors.ts';

// ============================================================
// Fetch Mock Helpers
// ============================================================

function mockFetchSuccess(
  content: string,
  extra: { model?: string; usage?: { total_tokens?: number } } = {},
): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }], ...extra }),
    text: async () => '',
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function mockFetchStatus(status: number, jsonBody: unknown = {}): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
    text: async () => '',
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function mockFetchNetworkError(message: string): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)));
}

function mockFetchAbort(): void {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));
}

// ============================================================
// callOpenAI
// ============================================================

describe('callOpenAI', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns trimmed response content on HTTP 200 success', async () => {
    mockFetchSuccess('  Corrected text.  ');
    const result = await callOpenAI('sk-test', 'System prompt', 'input text', 'gpt-5-nano');
    expect(result.text).toBe('Corrected text.');
  });

  it('returns an LLMResult with model, token count, and elapsed time', async () => {
    mockFetchSuccess('Corrected text.', {
      model: 'gpt-5-nano-2025',
      usage: { total_tokens: 87 },
    });
    const result = await callOpenAI('sk-test', 'System prompt', 'input text', 'gpt-5-nano');
    expect(result.text).toBe('Corrected text.');
    expect(result.model).toBe('gpt-5-nano-2025');
    expect(result.totalTokens).toBe(87);
    expect(typeof result.elapsedMs).toBe('number');
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('falls back to the requested model and null tokens when usage is absent', async () => {
    mockFetchSuccess('Corrected text.');
    const result = await callOpenAI('sk-test', 'System prompt', 'input text', 'gpt-5-nano');
    expect(result.model).toBe('gpt-5-nano');
    expect(result.totalTokens).toBeNull();
  });

  it('returns an empty-text LLMResult for empty user text without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await callOpenAI('sk-test', 'System prompt', '', 'gpt-5-nano');
    expect(result.text).toBe('');
    expect(result.totalTokens).toBeNull();
    expect(result.elapsedMs).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an empty-text LLMResult for whitespace-only user text without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await callOpenAI('sk-test', 'System prompt', '   ', 'gpt-5-nano');
    expect(result.text).toBe('');
    expect(result.totalTokens).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to the OpenAI chat completions endpoint with a Bearer auth header', async () => {
    const fetchMock = mockFetchSuccess('ok');
    await callOpenAI('sk-secret-key', 'prompt', 'text', 'gpt-5-nano');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-secret-key');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends a minimal request shape (model, messages, stream; no sampling params)', async () => {
    const fetchMock = mockFetchSuccess('ok');
    await callOpenAI('sk-test', 'prompt', 'text', 'gpt-5.4-nano');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string) as {
      model: string;
      stream: boolean;
      temperature?: unknown;
      top_p?: unknown;
      options?: unknown;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('gpt-5.4-nano');
    expect(body.stream).toBe(false);
    // gpt-5-nano / gpt-5.4-nano reject non-default sampling params -- none are sent.
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
    expect(body.options).toBeUndefined();
    expect(body.messages[0]).toEqual({ role: 'system', content: 'prompt' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'text' });
  });

  it('throws LLMError OPENAI_AUTH_FAILED on HTTP 401', async () => {
    mockFetchStatus(401);
    await expect(
      callOpenAI('sk-bad', 'prompt', 'text', 'gpt-5-nano'),
    ).rejects.toMatchObject({ code: 'OPENAI_AUTH_FAILED' });
  });

  it('throws LLMError OPENAI_QUOTA_EXCEEDED on HTTP 403 (billing/region)', async () => {
    mockFetchStatus(403);
    await expect(
      callOpenAI('sk-test', 'prompt', 'text', 'gpt-5-nano'),
    ).rejects.toMatchObject({ code: 'OPENAI_QUOTA_EXCEEDED' });
  });

  it('throws LLMError OPENAI_RATE_LIMITED on HTTP 429 with a generic error body', async () => {
    mockFetchStatus(429, { error: { type: 'requests' } });
    await expect(
      callOpenAI('sk-test', 'prompt', 'text', 'gpt-5-nano'),
    ).rejects.toMatchObject({ code: 'OPENAI_RATE_LIMITED' });
  });

  it('throws LLMError OPENAI_QUOTA_EXCEEDED on HTTP 429 with insufficient_quota', async () => {
    mockFetchStatus(429, { error: { type: 'insufficient_quota' } });
    await expect(
      callOpenAI('sk-test', 'prompt', 'text', 'gpt-5-nano'),
    ).rejects.toMatchObject({ code: 'OPENAI_QUOTA_EXCEEDED' });
  });

  it('defaults a 429 with an unparseable body to OPENAI_RATE_LIMITED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => { throw new Error('not JSON'); },
      text: async () => 'gateway html',
    }));
    await expect(
      callOpenAI('sk-test', 'prompt', 'text', 'gpt-5-nano'),
    ).rejects.toMatchObject({ code: 'OPENAI_RATE_LIMITED' });
  });

  it('throws LLMError UNEXPECTED_RESPONSE on other non-OK status (e.g. 500)', async () => {
    mockFetchStatus(500);
    await expect(
      callOpenAI('sk-test', 'prompt', 'text', 'gpt-5-nano'),
    ).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });

  it('throws LLMError OPENAI_UNREACHABLE on a network failure', async () => {
    mockFetchNetworkError('Failed to fetch');
    await expect(
      callOpenAI('sk-test', 'prompt', 'text', 'gpt-5-nano'),
    ).rejects.toMatchObject({ code: 'OPENAI_UNREACHABLE' });
  });

  it('throws LLMError REQUEST_TIMEOUT on an aborted (timed-out) request', async () => {
    mockFetchAbort();
    await expect(
      callOpenAI('sk-test', 'prompt', 'text', 'gpt-5-nano', 100),
    ).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
  });

  it('throws LLMError UNEXPECTED_RESPONSE on a malformed response shape (no choices)', async () => {
    mockFetchStatus(200, { unexpected: 'data' });
    await expect(
      callOpenAI('sk-test', 'prompt', 'text', 'gpt-5-nano'),
    ).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });

  it('throws LLMError UNEXPECTED_RESPONSE when message.content is not a string', async () => {
    mockFetchStatus(200, { choices: [{ message: { content: 42 } }] });
    await expect(
      callOpenAI('sk-test', 'prompt', 'text', 'gpt-5-nano'),
    ).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });

  it('never leaks the API key in a thrown error message', async () => {
    mockFetchStatus(401);
    try {
      await callOpenAI('sk-super-secret-value', 'prompt', 'text', 'gpt-5-nano');
      throw new Error('expected callOpenAI to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError);
      expect((err as Error).message).not.toContain('sk-super-secret-value');
      expect((err as Error).stack ?? '').not.toContain('sk-super-secret-value');
    }
  });
});

// ============================================================
// checkOpenAIHealth
// ============================================================

describe('checkOpenAIHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns reachable=true, modelFound=true when the model is listed', async () => {
    mockFetchStatus(200, { data: [{ id: 'gpt-5-nano' }, { id: 'gpt-4o' }] });
    const result = await checkOpenAIHealth('sk-test', 'gpt-5-nano');
    expect(result).toEqual({ reachable: true, modelFound: true, error: null });
  });

  it('returns reachable=true, modelFound=false when the model is not listed', async () => {
    mockFetchStatus(200, { data: [{ id: 'gpt-4o' }] });
    const result = await checkOpenAIHealth('sk-test', 'gpt-5-nano');
    expect(result.reachable).toBe(true);
    expect(result.modelFound).toBe(false);
    expect(result.error).toBeNull();
  });

  it('maps HTTP 401 to a reachable result with an "Invalid API key" message', async () => {
    mockFetchStatus(401);
    const result = await checkOpenAIHealth('sk-bad', 'gpt-5-nano');
    expect(result).toEqual({
      reachable: true,
      modelFound: false,
      error: 'Invalid API key.',
    });
  });

  it('maps HTTP 429 to a reachable result with a rate-limit message', async () => {
    mockFetchStatus(429);
    const result = await checkOpenAIHealth('sk-test', 'gpt-5-nano');
    expect(result.reachable).toBe(true);
    expect(result.modelFound).toBe(false);
    expect(result.error).toMatch(/rate limit/i);
  });

  it('maps other non-OK status to reachable=false with a status-only message', async () => {
    mockFetchStatus(503);
    const result = await checkOpenAIHealth('sk-test', 'gpt-5-nano');
    expect(result.reachable).toBe(false);
    expect(result.error).toContain('503');
  });

  it('maps a network error to reachable=false with a sanitized message', async () => {
    mockFetchNetworkError('ENOTFOUND api.openai.com');
    const result = await checkOpenAIHealth('sk-test', 'gpt-5-nano');
    expect(result).toEqual({
      reachable: false,
      modelFound: false,
      error: 'Cannot reach OpenAI.',
    });
  });

  it('sends the Authorization header to the /v1/models endpoint', async () => {
    const fetchMock = mockFetchStatus(200, { data: [] });
    await checkOpenAIHealth('sk-health-key', 'gpt-5-nano');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-health-key' }),
      }),
    );
  });
});

// ============================================================
// createOpenAIClient (LLMClient adapter)
// ============================================================

describe('createOpenAIClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('produces an LLMClient whose call() returns the model response', async () => {
    mockFetchSuccess('adapter result');
    const client = createOpenAIClient({ apiKey: 'sk-test', model: 'gpt-5-nano' });
    const result = await client.call('system', 'user text', { model: 'gpt-5-nano' });
    expect(result.text).toBe('adapter result');
  });

  it('passes the per-call model through to the request body', async () => {
    const fetchMock = mockFetchSuccess('ok');
    const client = createOpenAIClient({ apiKey: 'sk-test', model: 'gpt-5-nano' });
    await client.call('system', 'user', { model: 'gpt-5.4-nano' });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string) as { model: string; temperature?: unknown };
    expect(body.model).toBe('gpt-5.4-nano');
    expect(body.temperature).toBeUndefined();
  });

  it('produces an LLMClient whose healthCheck() reports model availability', async () => {
    mockFetchStatus(200, { data: [{ id: 'gpt-5-nano' }] });
    const client = createOpenAIClient({ apiKey: 'sk-test', model: 'gpt-5-nano' });
    const health = await client.healthCheck('gpt-5-nano');
    expect(health.reachable).toBe(true);
    expect(health.modelFound).toBe(true);
  });
});
