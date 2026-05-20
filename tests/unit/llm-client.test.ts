// tests/unit/llm-client.test.ts
// Unit tests for the provider-agnostic LLMClient factory (getActiveClient).
//
// Routing is verified by observing which endpoint the resolved client's call()
// hits: Ollama -> http://.../v1/chat/completions on the configured endpoint,
// OpenAI -> https://api.openai.com/v1/chat/completions. fetch is always mocked.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { getActiveClient } from '../../src/background/llm-client.ts';
import type { ExtensionSettings } from '../../src/shared/types.ts';
import { DEFAULT_SETTINGS } from '../../src/shared/constants.ts';

function settings(overrides: Partial<ExtensionSettings>): ExtensionSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function mockChatFetch(): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    text: async () => '',
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('getActiveClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes to the Ollama client when provider is "ollama"', async () => {
    const fetchMock = mockChatFetch();
    const client = getActiveClient(settings({
      provider: 'ollama',
      ollamaEndpoint: 'http://localhost:11434',
    }));
    await client.call('system', 'text', { model: 'qwen3:14b' });

    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    // The Ollama request shape nests params in an options block.
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string) as { options?: unknown };
    expect(body.options).toBeDefined();
  });

  it('routes to the OpenAI client when provider is "openai"', async () => {
    const fetchMock = mockChatFetch();
    const client = getActiveClient(settings({
      provider: 'openai',
      openaiApiKey: 'sk-test',
      openaiModel: 'gpt-5-nano',
    }));
    await client.call('system', 'text', { model: 'gpt-5-nano' });

    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    // The OpenAI request shape does not nest params in an options block.
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string) as { options?: unknown };
    expect(body.options).toBeUndefined();
  });

  it('defaults to the Ollama client for the default settings', async () => {
    const fetchMock = mockChatFetch();
    const client = getActiveClient(DEFAULT_SETTINGS);
    await client.call('system', 'text', { model: DEFAULT_SETTINGS.model });
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('localhost:11434');
  });

  it('uses the configured OpenAI API key in the Authorization header', async () => {
    const fetchMock = mockChatFetch();
    const client = getActiveClient(settings({
      provider: 'openai',
      openaiApiKey: 'sk-routed-key',
      openaiModel: 'gpt-5-nano',
    }));
    await client.call('system', 'text', { model: 'gpt-5-nano' });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-routed-key');
  });

  it('OpenAI client healthCheck queries the OpenAI /v1/models endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'gpt-5-nano' }] }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = getActiveClient(settings({
      provider: 'openai',
      openaiApiKey: 'sk-test',
      openaiModel: 'gpt-5-nano',
    }));
    const health = await client.healthCheck('gpt-5-nano');
    expect(health.modelFound).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/models');
  });

  it('Ollama client healthCheck queries the configured endpoint /api/tags', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ models: [{ name: 'qwen3:14b' }] }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = getActiveClient(settings({
      provider: 'ollama',
      ollamaEndpoint: 'http://localhost:11434',
    }));
    const health = await client.healthCheck('qwen3:14b');
    expect(health.modelFound).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:11434/api/tags');
  });
});
