// tests/unit/errors.test.ts
import { describe, it, expect } from 'vitest';
import { classifyError, getUserMessage, getErrorColor, ERROR_MESSAGES, ERROR_COLORS, LLMError } from '../../src/shared/errors.ts';
import { COLORS } from '../../src/shared/constants.ts';

describe('classifyError', () => {
  it('classifies timeout/AbortError as REQUEST_TIMEOUT', () => {
    const err = new Error('timed out');
    expect(classifyError(err)).toBe('REQUEST_TIMEOUT');
  });

  it('classifies AbortError by name', () => {
    const err = new Error('operation was aborted');
    err.name = 'AbortError';
    expect(classifyError(err)).toBe('REQUEST_TIMEOUT');
  });

  it('classifies 404/model not found as MODEL_NOT_FOUND', () => {
    expect(classifyError(new Error('Model not found'))).toBe('MODEL_NOT_FOUND');
    expect(classifyError(new Error('Ollama API error 404'))).toBe('MODEL_NOT_FOUND');
  });

  it('classifies network/unreachable errors as OLLAMA_UNREACHABLE', () => {
    expect(classifyError(new Error('Ollama unreachable: load failed'))).toBe('OLLAMA_UNREACHABLE');
    expect(classifyError(new Error('Failed to fetch'))).toBe('OLLAMA_UNREACHABLE');
    expect(classifyError(new Error('econnrefused'))).toBe('OLLAMA_UNREACHABLE');
  });

  it('classifies unexpected response shape as UNEXPECTED_RESPONSE', () => {
    expect(classifyError(new Error('Unexpected Ollama response shape'))).toBe('UNEXPECTED_RESPONSE');
  });

  it('classifies unknown errors as UNKNOWN_ERROR', () => {
    expect(classifyError(new Error('Something random happened'))).toBe('UNKNOWN_ERROR');
    expect(classifyError('string error')).toBe('UNKNOWN_ERROR');
    expect(classifyError(null)).toBe('UNKNOWN_ERROR');
  });

  it('classifies an LLMError structurally by its code (not by message text)', () => {
    // The message text deliberately does not hint at the code -- classification
    // must come from the structural `code` field on LLMError.
    expect(classifyError(new LLMError('OPENAI_AUTH_FAILED', 'opaque (401)'))).toBe('OPENAI_AUTH_FAILED');
    expect(classifyError(new LLMError('OPENAI_RATE_LIMITED', 'opaque (429)'))).toBe('OPENAI_RATE_LIMITED');
    expect(classifyError(new LLMError('OPENAI_QUOTA_EXCEEDED', 'opaque (429)'))).toBe('OPENAI_QUOTA_EXCEEDED');
    expect(classifyError(new LLMError('OPENAI_UNREACHABLE', 'opaque'))).toBe('OPENAI_UNREACHABLE');
    expect(classifyError(new LLMError('REQUEST_TIMEOUT', 'opaque'))).toBe('REQUEST_TIMEOUT');
    expect(classifyError(new LLMError('UNEXPECTED_RESPONSE', 'opaque'))).toBe('UNEXPECTED_RESPONSE');
  });
});

describe('LLMError', () => {
  it('is an Error subclass that carries an ErrorCode', () => {
    const err = new LLMError('OPENAI_AUTH_FAILED', 'OpenAI auth failed (401)');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.code).toBe('OPENAI_AUTH_FAILED');
    expect(err.name).toBe('LLMError');
    expect(err.message).toBe('OpenAI auth failed (401)');
  });
});

describe('getUserMessage', () => {
  it('returns a non-empty string for every error code', () => {
    const codes = Object.keys(ERROR_MESSAGES) as Array<keyof typeof ERROR_MESSAGES>;
    for (const code of codes) {
      const msg = getUserMessage(code);
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('provides actionable message for OLLAMA_UNREACHABLE', () => {
    const msg = getUserMessage('OLLAMA_UNREACHABLE');
    expect(msg).toContain('ollama serve');
  });

  it('provides actionable message for MODEL_NOT_FOUND', () => {
    const msg = getUserMessage('MODEL_NOT_FOUND');
    expect(msg).toContain('ollama pull');
  });

  it('provides OpenAI-specific (not Ollama-flavoured) copy for the OpenAI error codes', () => {
    expect(getUserMessage('OPENAI_AUTH_FAILED')).toMatch(/OpenAI/);
    expect(getUserMessage('OPENAI_AUTH_FAILED')).toMatch(/key/i);
    expect(getUserMessage('OPENAI_RATE_LIMITED')).toMatch(/rate limit/i);
    expect(getUserMessage('OPENAI_QUOTA_EXCEEDED')).toMatch(/quota|billing/i);
    expect(getUserMessage('OPENAI_UNREACHABLE')).toMatch(/Cannot reach OpenAI/i);
    // OpenAI failure copy must not give Ollama advice.
    expect(getUserMessage('OPENAI_UNREACHABLE')).not.toContain('ollama serve');
  });
});

describe('getErrorColor', () => {
  it('returns failure color for hard errors', () => {
    expect(getErrorColor('OLLAMA_UNREACHABLE')).toBe(COLORS.FAILURE);
    expect(getErrorColor('MODEL_NOT_FOUND')).toBe(COLORS.FAILURE);
    expect(getErrorColor('UNKNOWN_ERROR')).toBe(COLORS.FAILURE);
  });

  it('returns warning color for soft errors', () => {
    expect(getErrorColor('REQUEST_TIMEOUT')).toBe(COLORS.WARNING);
    expect(getErrorColor('EMPTY_INPUT')).toBe(COLORS.WARNING);
    expect(getErrorColor('INPUT_TOO_LONG')).toBe(COLORS.WARNING);
  });

  it('colors OpenAI errors: rate-limit is a retryable warning, the rest are failures', () => {
    expect(getErrorColor('OPENAI_RATE_LIMITED')).toBe(COLORS.WARNING);
    expect(getErrorColor('OPENAI_AUTH_FAILED')).toBe(COLORS.FAILURE);
    expect(getErrorColor('OPENAI_QUOTA_EXCEEDED')).toBe(COLORS.FAILURE);
    expect(getErrorColor('OPENAI_UNREACHABLE')).toBe(COLORS.FAILURE);
  });

  it('covers all error codes', () => {
    const codes = Object.keys(ERROR_COLORS) as Array<keyof typeof ERROR_COLORS>;
    for (const code of codes) {
      const color = getErrorColor(code);
      expect([COLORS.SUCCESS, COLORS.FAILURE, COLORS.WARNING]).toContain(color);
    }
  });
});
