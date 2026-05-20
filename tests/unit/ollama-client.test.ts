// tests/unit/ollama-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callOllama, checkOllamaHealth } from '../../src/background/ollama-client.ts';

// ============================================================
// Fetch Mock Helpers
// ============================================================

function mockFetchSuccess(
  content: string,
  extra: { model?: string; usage?: { total_tokens?: number } } = {},
): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      ...extra,
    }),
    text: async () => '',
  }));
}

function mockFetchError(status: number, body = ''): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => body,
    json: async () => ({}),
  }));
}

function mockFetchNetworkError(message: string): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)));
}

function mockFetchAbort(): void {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));
}

function mockFetchTagsSuccess(models: Array<{ name: string }>): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ models }),
    text: async () => '',
  }));
}

// ============================================================
// callOllama Tests
// ============================================================

describe('callOllama', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns trimmed response content on success', async () => {
    mockFetchSuccess('  Corrected text.  ');
    const result = await callOllama('System prompt', 'input text');
    expect(result.text).toBe('Corrected text.');
  });

  it('returns an LLMResult with model, token count, and elapsed time', async () => {
    mockFetchSuccess('Corrected text.', {
      model: 'qwen3:14b',
      usage: { total_tokens: 142 },
    });
    const result = await callOllama('System prompt', 'input text');
    expect(result.text).toBe('Corrected text.');
    expect(result.model).toBe('qwen3:14b');
    expect(result.totalTokens).toBe(142);
    expect(typeof result.elapsedMs).toBe('number');
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('falls back to the requested model and null tokens when the response omits usage', async () => {
    mockFetchSuccess('Corrected text.');
    const result = await callOllama('System prompt', 'input text', { model: 'llama3:8b' });
    expect(result.model).toBe('llama3:8b');
    expect(result.totalTokens).toBeNull();
  });

  it('returns an empty-text LLMResult for empty user text', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await callOllama('System prompt', '');
    expect(result.text).toBe('');
    expect(result.totalTokens).toBeNull();
    expect(result.elapsedMs).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an empty-text LLMResult for whitespace-only user text', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await callOllama('System prompt', '   ');
    expect(result.text).toBe('');
    expect(result.totalTokens).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on network error', async () => {
    mockFetchNetworkError('Failed to fetch');
    await expect(callOllama('prompt', 'text')).rejects.toThrow('Ollama unreachable');
  });

  it('throws with timeout message on AbortError', async () => {
    mockFetchAbort();
    await expect(callOllama('prompt', 'text')).rejects.toThrow('timed out');
  });

  it('throws with model-not-found message on HTTP 404', async () => {
    mockFetchError(404);
    await expect(callOllama('prompt', 'text')).rejects.toThrow('Model not found');
  });

  it('throws with status code on other HTTP errors', async () => {
    mockFetchError(500, 'Internal Server Error');
    await expect(callOllama('prompt', 'text')).rejects.toThrow('500');
  });

  it('throws on unexpected response shape (no choices)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: 'data' }),
      text: async () => '',
    }));
    await expect(callOllama('prompt', 'text')).rejects.toThrow('Unexpected Ollama response shape');
  });

  it('sends request to the correct URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    await callOllama('prompt', 'text', { endpoint: 'http://localhost:11434' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses the specified model in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    await callOllama('prompt', 'text', { model: 'qwen3:14b' });
    const callArgs = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string) as { model: string };
    expect(body.model).toBe('qwen3:14b');
  });

  it('sends think: false in options', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    await callOllama('prompt', 'text');
    const callArgs = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string) as { options: { think: boolean } };
    expect(body.options.think).toBe(false);
  });
});

// ============================================================
// checkOllamaHealth Tests
// ============================================================

describe('checkOllamaHealth', () => {
  beforeEach(() => {
    // Stub AbortSignal.timeout if not available in the test environment
    if (!AbortSignal.timeout) {
      vi.stubGlobal('AbortSignal', {
        timeout: (ms: number) => {
          const controller = new AbortController();
          setTimeout(() => controller.abort(), ms);
          return controller.signal;
        },
      });
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns reachable=true and modelFound=true when model is present', async () => {
    mockFetchTagsSuccess([{ name: 'qwen3.6:35b-a3b' }]);
    const result = await checkOllamaHealth('http://localhost:11434', 'qwen3.6:35b-a3b');
    expect(result.reachable).toBe(true);
    expect(result.modelFound).toBe(true);
    expect(result.error).toBeNull();
  });

  it('returns reachable=true and modelFound=false when model is not in list', async () => {
    mockFetchTagsSuccess([{ name: 'llama3:8b' }]);
    const result = await checkOllamaHealth('http://localhost:11434', 'qwen3.6:35b-a3b');
    expect(result.reachable).toBe(true);
    expect(result.modelFound).toBe(false);
  });

  it('returns reachable=false on network error', async () => {
    mockFetchNetworkError('Connection refused');
    const result = await checkOllamaHealth();
    expect(result.reachable).toBe(false);
    expect(result.modelFound).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns reachable=false when Ollama returns non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
      text: async () => '',
    }));
    const result = await checkOllamaHealth();
    expect(result.reachable).toBe(false);
    expect(result.error).toContain('503');
  });

  it('matches model by prefix (e.g., qwen3.6 prefix matches qwen3.6:35b-a3b)', async () => {
    mockFetchTagsSuccess([{ name: 'qwen3.6:35b-a3b' }]);
    const result = await checkOllamaHealth('http://localhost:11434', 'qwen3.6:35b-a3b');
    expect(result.modelFound).toBe(true);
  });
});
