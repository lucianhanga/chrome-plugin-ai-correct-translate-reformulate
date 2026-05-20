// tests/unit/tasks.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  GRAMMAR_CORRECT_SYSTEM,
  buildTranslateSystemPrompt,
  DETECT_LANGUAGE_SYSTEM,
} from '../../src/shared/prompts.ts';

// Mock ollama-client before importing tasks
vi.mock('../../src/background/ollama-client.ts', () => ({
  callOllama: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('correctGrammar', () => {
  it('calls callOllama with the grammar correction system prompt', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { correctGrammar } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue('Corrected text.');

    const result = await correctGrammar('She dont know nothing.');
    expect(result).toBe('Corrected text.');
    expect(callOllama).toHaveBeenCalledWith(
      GRAMMAR_CORRECT_SYSTEM,
      'She dont know nothing.',
      expect.objectContaining({ temperature: 0.2 }),
    );
  });

  it('passes model and endpoint options through to callOllama', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { correctGrammar } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue('ok');

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
  it('uses auto-detect prompt when sourceLanguage is null', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { translateText } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue('Translated text.');

    await translateText('Hello', 'Romanian', null);
    const expectedPrompt = buildTranslateSystemPrompt('Romanian', null);
    expect(callOllama).toHaveBeenCalledWith(
      expectedPrompt,
      'Hello',
      expect.objectContaining({ temperature: 0.2 }),
    );
  });

  it('uses explicit source prompt when sourceLanguage is provided', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { translateText } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue('Hallo.');

    await translateText('Hello', 'German', 'English');
    const expectedPrompt = buildTranslateSystemPrompt('German', 'English');
    expect(callOllama).toHaveBeenCalledWith(
      expectedPrompt,
      'Hello',
      expect.objectContaining({ temperature: 0.2 }),
    );
  });

  it('defaults sourceLanguage to null (auto-detect)', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { translateText } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue('ok');

    // Called with only 2 args -- should default sourceLanguage to null
    await translateText('text', 'English');
    const expectedPrompt = buildTranslateSystemPrompt('English', null);
    expect(callOllama).toHaveBeenCalledWith(
      expectedPrompt,
      'text',
      expect.any(Object),
    );
  });

  it('returns the translated text', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { translateText } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue('Soarele straluceste.');

    const result = await translateText('The sun is shining.', 'Romanian', null);
    expect(result).toBe('Soarele straluceste.');
  });
});

describe('detectLanguage', () => {
  it('calls callOllama with the language-detection system prompt', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { detectLanguage } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue('German');

    const result = await detectLanguage('Guten Tag, wie geht es dir?');
    expect(result).toBe('German');
    expect(callOllama).toHaveBeenCalledWith(
      DETECT_LANGUAGE_SYSTEM,
      'Guten Tag, wie geht es dir?',
      expect.objectContaining({ temperature: 0 }),
    );
  });

  it('matches the language case-insensitively and ignores surrounding text', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { detectLanguage } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue('The language is romanian.');

    expect(await detectLanguage('Buna ziua')).toBe('Romanian');
  });

  it('defaults to English when the reply is not a recognized language', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { detectLanguage } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue('Klingon');

    expect(await detectLanguage('nuqneH')).toBe('English');
  });

  it('passes model and endpoint options through to callOllama', async () => {
    const { callOllama } = await import('../../src/background/ollama-client.ts');
    const { detectLanguage } = await import('../../src/background/tasks.ts');
    vi.mocked(callOllama).mockResolvedValue('English');

    await detectLanguage('Hello', { model: 'qwen3:14b', endpoint: 'http://localhost:11434' });
    expect(callOllama).toHaveBeenCalledWith(
      DETECT_LANGUAGE_SYSTEM,
      'Hello',
      expect.objectContaining({ model: 'qwen3:14b', endpoint: 'http://localhost:11434', temperature: 0 }),
    );
  });
});
