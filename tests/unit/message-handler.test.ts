// tests/unit/message-handler.test.ts
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { installChromeMock, resetChromeMock } from '../mocks/chrome.ts';

// Mock task functions
vi.mock('../../src/background/tasks.ts', () => ({
  correctGrammar: vi.fn(),
  translateText: vi.fn(),
}));

// Mock Ollama health check
vi.mock('../../src/background/ollama-client.ts', () => ({
  callOllama: vi.fn(),
  checkOllamaHealth: vi.fn(),
  createOllamaClient: vi.fn(),
}));

// Mock the OpenAI client so no test in this file reaches api.openai.com.
vi.mock('../../src/background/openai-client.ts', () => ({
  callOpenAI: vi.fn(),
  checkOpenAIHealth: vi.fn(),
  createOpenAIClient: vi.fn(),
}));

// Mock the provider-agnostic factory so OpenAI routing returns a controllable client.
vi.mock('../../src/background/llm-client.ts', () => ({
  getActiveClient: vi.fn(),
}));

beforeAll(() => {
  installChromeMock();
});

beforeEach(() => {
  resetChromeMock();
  vi.clearAllMocks();
});

describe('handleMessage', () => {
  it('returns INVALID_MESSAGE for null', async () => {
    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage(null);
    expect(response).toMatchObject({ success: false, errorCode: 'INVALID_MESSAGE' });
  });

  it('returns INVALID_MESSAGE for unknown message type', async () => {
    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({ type: 'TOTALLY_UNKNOWN' });
    expect(response).toMatchObject({ success: false, errorCode: 'INVALID_MESSAGE' });
  });

  it('handles CORRECT_GRAMMAR and returns success', async () => {
    const { correctGrammar } = await import('../../src/background/tasks.ts');
    vi.mocked(correctGrammar).mockResolvedValue('She does not know anything.');

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'CORRECT_GRAMMAR',
      payload: { text: 'She dont know nothing.' },
    });

    expect(response).toMatchObject({ success: true, result: 'She does not know anything.' });
    expect(correctGrammar).toHaveBeenCalledWith('She dont know nothing.', expect.any(Object));
  });

  it('returns EMPTY_INPUT for CORRECT_GRAMMAR with empty text', async () => {
    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'CORRECT_GRAMMAR',
      payload: { text: '' },
    });
    expect(response).toMatchObject({ success: false, errorCode: 'EMPTY_INPUT' });
  });

  it('returns INPUT_TOO_LONG for CORRECT_GRAMMAR with oversized text', async () => {
    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'CORRECT_GRAMMAR',
      payload: { text: 'a'.repeat(10_001) },
    });
    expect(response).toMatchObject({ success: false, errorCode: 'INPUT_TOO_LONG' });
  });

  it('handles TRANSLATE and returns success', async () => {
    const { translateText } = await import('../../src/background/tasks.ts');
    vi.mocked(translateText).mockResolvedValue('Soarele straluceste.');

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'TRANSLATE',
      payload: { text: 'The sun is shining.', targetLanguage: 'Romanian' },
    });

    expect(response).toMatchObject({ success: true, result: 'Soarele straluceste.' });
    expect(translateText).toHaveBeenCalledWith(
      'The sun is shining.',
      'Romanian',
      expect.any(Object),
    );
  });

  it('returns EMPTY_INPUT for TRANSLATE with empty text', async () => {
    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'TRANSLATE',
      payload: { text: '  ', targetLanguage: 'German' },
    });
    expect(response).toMatchObject({ success: false, errorCode: 'EMPTY_INPUT' });
  });

  it('handles HEALTH_CHECK and returns health status', async () => {
    const { checkOllamaHealth } = await import('../../src/background/ollama-client.ts');
    vi.mocked(checkOllamaHealth).mockResolvedValue({ reachable: true, modelFound: true, error: null });

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({ type: 'HEALTH_CHECK' });

    expect(response).toMatchObject({ success: true, reachable: true, modelFound: true, error: null });
  });

  it('handles GET_SETTINGS and returns settings', async () => {
    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({ type: 'GET_SETTINGS' });

    expect(response).toMatchObject({ success: true });
    expect((response as { settings: unknown }).settings).toBeDefined();
  });

  it('handles SAVE_SETTINGS and returns success', async () => {
    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'SAVE_SETTINGS',
      payload: { settings: { model: 'qwen3:14b' } },
    });

    expect(response).toMatchObject({ success: true });
  });

  it('returns error response when correctGrammar throws OLLAMA_UNREACHABLE', async () => {
    const { correctGrammar } = await import('../../src/background/tasks.ts');
    vi.mocked(correctGrammar).mockRejectedValue(new Error('Ollama unreachable: connection refused'));

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'CORRECT_GRAMMAR',
      payload: { text: 'Some text' },
    });

    expect(response).toMatchObject({ success: false, errorCode: 'OLLAMA_UNREACHABLE' });
  });

  it('returns error response when translateText throws timeout error', async () => {
    const { translateText } = await import('../../src/background/tasks.ts');
    vi.mocked(translateText).mockRejectedValue(new Error('Ollama request timed out after 60000ms'));

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'TRANSLATE',
      payload: { text: 'text', targetLanguage: 'German' },
    });

    expect(response).toMatchObject({ success: false, errorCode: 'REQUEST_TIMEOUT' });
  });
});

// ============================================================
// OpenAI provider routing
// ============================================================

describe('handleMessage: OpenAI provider routing', () => {
  // Seed storage so getSettings() reports the OpenAI provider as active.
  async function selectOpenAIProvider(): Promise<void> {
    await chrome.storage.local.set({
      settings: {
        ollamaEndpoint: 'http://localhost:11434',
        model: 'qwen3:14b',
        defaultTargetLanguage: 'English',
        provider: 'openai',
        openaiModel: 'gpt-5-nano',
        openaiApiKey: 'sk-test',
        openaiConsentAcknowledged: true,
      },
    });
  }

  it('routes CORRECT_GRAMMAR through getActiveClient when provider is openai', async () => {
    await selectOpenAIProvider();
    const { getActiveClient } = await import('../../src/background/llm-client.ts');
    const callMock = vi.fn().mockResolvedValue('Corrected via OpenAI.');
    vi.mocked(getActiveClient).mockReturnValue({ call: callMock, healthCheck: vi.fn() });

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'CORRECT_GRAMMAR',
      payload: { text: 'She dont know.' },
    });

    expect(response).toMatchObject({ success: true, result: 'Corrected via OpenAI.' });
    expect(getActiveClient).toHaveBeenCalled();
    expect(callMock).toHaveBeenCalled();
    // The Ollama task path must NOT be used when OpenAI is the provider.
    const { correctGrammar } = await import('../../src/background/tasks.ts');
    expect(correctGrammar).not.toHaveBeenCalled();
  });

  it('routes TRANSLATE through getActiveClient when provider is openai', async () => {
    await selectOpenAIProvider();
    const { getActiveClient } = await import('../../src/background/llm-client.ts');
    const callMock = vi.fn().mockResolvedValue('Translated via OpenAI.');
    vi.mocked(getActiveClient).mockReturnValue({ call: callMock, healthCheck: vi.fn() });

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'TRANSLATE',
      payload: { text: 'Hello.', targetLanguage: 'German' },
    });

    expect(response).toMatchObject({ success: true, result: 'Translated via OpenAI.' });
    expect(callMock).toHaveBeenCalled();
  });

  it('classifies an LLMError thrown by the OpenAI client to its ErrorCode', async () => {
    await selectOpenAIProvider();
    const { getActiveClient } = await import('../../src/background/llm-client.ts');
    const { LLMError } = await import('../../src/shared/errors.ts');
    const callMock = vi.fn().mockRejectedValue(new LLMError('OPENAI_AUTH_FAILED', 'opaque (401)'));
    vi.mocked(getActiveClient).mockReturnValue({ call: callMock, healthCheck: vi.fn() });

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'CORRECT_GRAMMAR',
      payload: { text: 'Some text.' },
    });

    expect(response).toMatchObject({ success: false, errorCode: 'OPENAI_AUTH_FAILED' });
  });

  it('HEALTH_CHECK uses checkOpenAIHealth when provider is openai', async () => {
    await selectOpenAIProvider();
    const { checkOpenAIHealth } = await import('../../src/background/openai-client.ts');
    vi.mocked(checkOpenAIHealth).mockResolvedValue({ reachable: true, modelFound: true, error: null });

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({ type: 'HEALTH_CHECK' });

    expect(response).toMatchObject({ success: true, reachable: true, modelFound: true });
    expect(checkOpenAIHealth).toHaveBeenCalledWith('sk-test', 'gpt-5-nano');
  });
});

// ============================================================
// GET_SETTINGS key redaction and VALIDATE_OPENAI_KEY
// ============================================================

describe('handleMessage: OpenAI key redaction and validation', () => {
  it('GET_SETTINGS redacts a stored openaiApiKey to the __SET__ sentinel', async () => {
    await chrome.storage.local.set({
      settings: {
        ollamaEndpoint: 'http://localhost:11434',
        model: 'qwen3:14b',
        defaultTargetLanguage: 'English',
        provider: 'ollama',
        openaiModel: 'gpt-5-nano',
        openaiApiKey: 'sk-super-secret',
        openaiConsentAcknowledged: false,
      },
    });

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({ type: 'GET_SETTINGS' }) as {
      settings: { openaiApiKey: string };
    };
    // The real key must never leave the service worker.
    expect(response.settings.openaiApiKey).toBe('__SET__');
  });

  it('GET_SETTINGS reports an empty openaiApiKey when no key is stored', async () => {
    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({ type: 'GET_SETTINGS' }) as {
      settings: { openaiApiKey: string };
    };
    expect(response.settings.openaiApiKey).toBe('');
  });

  it('SAVE_SETTINGS does not overwrite the stored key when given the __SET__ sentinel', async () => {
    const { saveSettings, getSettings } = await import('../../src/shared/storage.ts');
    await saveSettings({ openaiApiKey: 'sk-original' });

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    await handleMessage({
      type: 'SAVE_SETTINGS',
      payload: { settings: { provider: 'openai', openaiApiKey: '__SET__' } },
    });

    const stored = await getSettings();
    // The sentinel is stripped, so the original key survives.
    expect(stored.openaiApiKey).toBe('sk-original');
    expect(stored.provider).toBe('openai');
  });

  it('SAVE_SETTINGS persists a real new key', async () => {
    const { getSettings } = await import('../../src/shared/storage.ts');

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    await handleMessage({
      type: 'SAVE_SETTINGS',
      payload: { settings: { openaiApiKey: 'sk-newly-typed' } },
    });

    const stored = await getSettings();
    expect(stored.openaiApiKey).toBe('sk-newly-typed');
  });

  it('VALIDATE_OPENAI_KEY returns valid=true when the key and model check out', async () => {
    const { checkOpenAIHealth } = await import('../../src/background/openai-client.ts');
    vi.mocked(checkOpenAIHealth).mockResolvedValue({ reachable: true, modelFound: true, error: null });

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'VALIDATE_OPENAI_KEY',
      payload: { key: 'sk-candidate', model: 'gpt-5-nano' },
    });

    expect(response).toMatchObject({ success: true, valid: true, modelFound: true });
    expect(checkOpenAIHealth).toHaveBeenCalledWith('sk-candidate', 'gpt-5-nano');
  });

  it('VALIDATE_OPENAI_KEY returns valid=false when the key is rejected', async () => {
    const { checkOpenAIHealth } = await import('../../src/background/openai-client.ts');
    vi.mocked(checkOpenAIHealth).mockResolvedValue({
      reachable: true,
      modelFound: false,
      error: 'Invalid API key.',
    });

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'VALIDATE_OPENAI_KEY',
      payload: { key: 'sk-bad', model: 'gpt-5-nano' },
    });

    expect(response).toMatchObject({ success: true, valid: false });
  });

  it('rejects a VALIDATE_OPENAI_KEY message with an unknown model as INVALID_MESSAGE', async () => {
    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'VALIDATE_OPENAI_KEY',
      payload: { key: 'sk-test', model: 'gpt-4o' },
    });
    expect(response).toMatchObject({ success: false, errorCode: 'INVALID_MESSAGE' });
  });
});
