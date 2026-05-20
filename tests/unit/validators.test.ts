// tests/unit/validators.test.ts
import { describe, it, expect } from 'vitest';
import { validateTextInput, validateEndpointUrl, validateModelName, MAX_INPUT_LENGTH } from '../../src/shared/validators.ts';

describe('validateTextInput', () => {
  it('accepts a valid string', () => {
    const result = validateTextInput('Hello world');
    expect(result.valid).toBe(true);
  });

  it('rejects an empty string', () => {
    const result = validateTextInput('');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('EMPTY_INPUT');
  });

  it('rejects a whitespace-only string', () => {
    const result = validateTextInput('   \n\t  ');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('EMPTY_INPUT');
  });

  it('rejects null', () => {
    const result = validateTextInput(null);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('EMPTY_INPUT');
  });

  it('rejects undefined', () => {
    const result = validateTextInput(undefined);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('EMPTY_INPUT');
  });

  it('rejects a number', () => {
    const result = validateTextInput(42);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('EMPTY_INPUT');
  });

  it('accepts a string exactly at the limit', () => {
    const text = 'a'.repeat(MAX_INPUT_LENGTH);
    const result = validateTextInput(text);
    expect(result.valid).toBe(true);
  });

  it('rejects a string one character over the limit', () => {
    const text = 'a'.repeat(MAX_INPUT_LENGTH + 1);
    const result = validateTextInput(text);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('INPUT_TOO_LONG');
  });

  it('includes the character count in the error message when over limit', () => {
    const text = 'a'.repeat(MAX_INPUT_LENGTH + 100);
    const result = validateTextInput(text);
    expect(result.errorMessage).toContain(String(MAX_INPUT_LENGTH + 100));
  });
});

describe('validateEndpointUrl', () => {
  it('accepts a valid http URL', () => {
    const result = validateEndpointUrl('http://localhost:11434');
    expect(result.valid).toBe(true);
  });

  it('accepts a valid https URL', () => {
    const result = validateEndpointUrl('https://my-ollama-server.example.com');
    expect(result.valid).toBe(true);
  });

  it('rejects an empty string', () => {
    const result = validateEndpointUrl('');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('INVALID_MESSAGE');
  });

  it('rejects a non-URL string', () => {
    const result = validateEndpointUrl('not-a-url');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('INVALID_MESSAGE');
  });

  it('rejects null', () => {
    const result = validateEndpointUrl(null);
    expect(result.valid).toBe(false);
  });
});

describe('validateModelName', () => {
  it('accepts a valid model name', () => {
    const result = validateModelName('qwen3.6:35b-a3b');
    expect(result.valid).toBe(true);
  });

  it('rejects an empty string', () => {
    const result = validateModelName('');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('INVALID_MESSAGE');
  });

  it('rejects null', () => {
    const result = validateModelName(null);
    expect(result.valid).toBe(false);
  });
});
