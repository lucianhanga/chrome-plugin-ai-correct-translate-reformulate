// tests/unit/message-handler.test.ts
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { installChromeMock, resetChromeMock } from '../mocks/chrome.ts';

// Mock task functions
vi.mock('../../src/background/tasks.ts', () => ({
  correctGrammar: vi.fn(),
  translateText: vi.fn(),
  detectLanguage: vi.fn(),
}));

// Mock Ollama health check
vi.mock('../../src/background/ollama-client.ts', () => ({
  callOllama: vi.fn(),
  checkOllamaHealth: vi.fn(),
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
      payload: { text: 'The sun is shining.', targetLanguage: 'Romanian', sourceLanguage: null },
    });

    expect(response).toMatchObject({ success: true, result: 'Soarele straluceste.' });
    expect(translateText).toHaveBeenCalledWith(
      'The sun is shining.',
      'Romanian',
      null,
      expect.any(Object),
    );
  });

  it('returns EMPTY_INPUT for TRANSLATE with empty text', async () => {
    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'TRANSLATE',
      payload: { text: '  ', targetLanguage: 'German', sourceLanguage: null },
    });
    expect(response).toMatchObject({ success: false, errorCode: 'EMPTY_INPUT' });
  });

  it('handles DETECT_LANGUAGE and returns the detected language', async () => {
    const { detectLanguage } = await import('../../src/background/tasks.ts');
    vi.mocked(detectLanguage).mockResolvedValue('German');

    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'DETECT_LANGUAGE',
      payload: { text: 'Guten Tag.' },
    });

    expect(response).toMatchObject({ success: true, detectedLanguage: 'German' });
    expect(detectLanguage).toHaveBeenCalledWith('Guten Tag.', expect.any(Object));
  });

  it('returns EMPTY_INPUT for DETECT_LANGUAGE with empty text', async () => {
    const { handleMessage } = await import('../../src/background/message-handler.ts');
    const response = await handleMessage({
      type: 'DETECT_LANGUAGE',
      payload: { text: '' },
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
      payload: { text: 'text', targetLanguage: 'German', sourceLanguage: null },
    });

    expect(response).toMatchObject({ success: false, errorCode: 'REQUEST_TIMEOUT' });
  });
});
