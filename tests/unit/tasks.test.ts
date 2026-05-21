// tests/unit/tasks.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GRAMMAR_CORRECT_SYSTEM, buildTranslateSystemPrompt, buildReformulateSystemPrompt } from '../../src/shared/prompts.ts';
import type { LLMResult } from '../../src/shared/types.ts';

// Mock ollama-client before importing tasks
vi.mock('../../src/background/ollama-client.ts', () => ({
  callOllama: vi.fn(),
}));

// Build an LLMResult fixture; callOllama now resolves to this shape, not a string.
function llmResult(text: string, overrides: Partial<LLMResult> = {}): LLMResult {
  return { text, model: 'qwen3:14b', totalTokens: 100, elapsedMs: 1200, ...overrides };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('correctGrammar', () => {
  it('calls callOllama with the grammar correction system prompt', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { correctGrammar } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue(llmResult('Corrected text.'));

    const result = await correctGrammar('She dont know nothing.');
    expect(result.text).toBe('Corrected text.');
    expect(callOllama).toHaveBeenCalledWith(
      GRAMMAR_CORRECT_SYSTEM,
      'She dont know nothing.',
      expect.objectContaining({ temperature: 0.2 }),
    );
  });

  it('passes model and endpoint options through to callOllama', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { correctGrammar } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue(llmResult('ok'));

    await correctGrammar('text', { model: 'qwen3:14b', endpoint: 'http://localhost:11434' });
    expect(callOllama).toHaveBeenCalledWith(
      GRAMMAR_CORRECT_SYSTEM,
      'text',
      expect.objectContaining({ model: 'qwen3:14b', endpoint: 'http://localhost:11434', temperature: 0.2 }),
    );
  });

  it('propagates errors from callOllama', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { correctGrammar } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockRejectedValue(new Error('Ollama unreachable: network error'));

    await expect(correctGrammar('text')).rejects.toThrow('Ollama unreachable');
  });
});

describe('translateText', () => {
  it('uses auto-detect prompt', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { translateText } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue(llmResult('Translated text.'));

    await translateText('Hello', 'Romanian');
    const expectedPrompt = buildTranslateSystemPrompt('Romanian');
    expect(callOllama).toHaveBeenCalledWith(
      expectedPrompt,
      'Hello',
      expect.objectContaining({ temperature: 0.2 }),
    );
  });

  it('prompt instructs auto-detect for all supported target languages', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { translateText } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue(llmResult('ok'));

    for (const lang of ['English', 'German', 'Romanian'] as const) {
      await translateText('text', lang);
      const expectedPrompt = buildTranslateSystemPrompt(lang);
      expect(callOllama).toHaveBeenCalledWith(
        expectedPrompt,
        'text',
        expect.any(Object),
      );
    }
  });

  it('returns an LLMResult carrying the translated text and metadata', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { translateText } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue(
      llmResult('Soarele straluceste.', { model: 'qwen3:14b', totalTokens: 64, elapsedMs: 900 }),
    );

    const result = await translateText('The sun is shining.', 'Romanian');
    expect(result.text).toBe('Soarele straluceste.');
    expect(result.model).toBe('qwen3:14b');
    expect(result.totalTokens).toBe(64);
    expect(result.elapsedMs).toBe(900);
  });
});

// ============================================================
// reformulateText
// ============================================================

describe('reformulateText', () => {
  it('calls client.call with the correct system prompt for the given tone', async () => {
    const { reformulateText } = await import('../../src/background/tasks.ts');

    const callMock = vi.fn().mockResolvedValue(llmResult('Reformulated text.'));
    const client = { call: callMock, healthCheck: vi.fn() };

    await reformulateText(client, 'Original text.', 'professional', true, {
      model: 'qwen3:14b',
      temperature: 0.4,
    });

    const expectedPrompt = buildReformulateSystemPrompt('professional', true);
    expect(callMock).toHaveBeenCalledWith(expectedPrompt, 'Original text.', {
      model: 'qwen3:14b',
      temperature: 0.4,
    });
  });

  it('produces different prompts for each tone', async () => {
    const { reformulateText } = await import('../../src/background/tasks.ts');

    const prompts: string[] = [];
    for (const tone of ['keep', 'professional', 'friendly', 'natural'] as const) {
      const callMock = vi.fn().mockResolvedValue(llmResult('ok'));
      const client = { call: callMock, healthCheck: vi.fn() };
      await reformulateText(client, 'text', tone, true, { model: 'qwen3:14b' });
      const receivedPrompt = callMock.mock.calls[0]![0] as string;
      prompts.push(receivedPrompt);
    }

    // All four prompts should be distinct.
    const uniquePrompts = new Set(prompts);
    expect(uniquePrompts.size).toBe(4);
  });

  it('produces different prompts for keepTerminology true vs false', async () => {
    const { reformulateText } = await import('../../src/background/tasks.ts');

    const callMockTrue = vi.fn().mockResolvedValue(llmResult('ok'));
    await reformulateText(
      { call: callMockTrue, healthCheck: vi.fn() },
      'text', 'keep', true, { model: 'qwen3:14b' },
    );

    const callMockFalse = vi.fn().mockResolvedValue(llmResult('ok'));
    await reformulateText(
      { call: callMockFalse, healthCheck: vi.fn() },
      'text', 'keep', false, { model: 'qwen3:14b' },
    );

    const promptWithKeep = callMockTrue.mock.calls[0]![0] as string;
    const promptWithoutKeep = callMockFalse.mock.calls[0]![0] as string;
    expect(promptWithKeep).not.toBe(promptWithoutKeep);
  });

  it('returns an LLMResult from the client', async () => {
    const { reformulateText } = await import('../../src/background/tasks.ts');

    const callMock = vi.fn().mockResolvedValue(
      llmResult('Reformulated.', { model: 'gpt-5-nano', totalTokens: 55, elapsedMs: 800 }),
    );
    const result = await reformulateText(
      { call: callMock, healthCheck: vi.fn() },
      'text', 'friendly', false, { model: 'gpt-5-nano', temperature: 0.4 },
    );

    expect(result.text).toBe('Reformulated.');
    expect(result.model).toBe('gpt-5-nano');
    expect(result.totalTokens).toBe(55);
    expect(result.elapsedMs).toBe(800);
  });
});
