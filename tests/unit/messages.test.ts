// tests/unit/messages.test.ts
import { describe, it, expect } from 'vitest';
import {
  isValidMessageType,
  isSupportedLanguage,
  isCorrectGrammarRequest,
  isTranslateRequest,
  isHealthCheckRequest,
  isGetSettingsRequest,
  isSaveSettingsRequest,
  isValidateOpenAIKeyRequest,
} from '../../src/shared/messages.ts';

describe('isValidMessageType', () => {
  it('accepts known message types', () => {
    expect(isValidMessageType('CORRECT_GRAMMAR')).toBe(true);
    expect(isValidMessageType('TRANSLATE')).toBe(true);
    expect(isValidMessageType('HEALTH_CHECK')).toBe(true);
    expect(isValidMessageType('GET_SETTINGS')).toBe(true);
    expect(isValidMessageType('SAVE_SETTINGS')).toBe(true);
    expect(isValidMessageType('VALIDATE_OPENAI_KEY')).toBe(true);
    expect(isValidMessageType('SHOW_LOADING')).toBe(true);
    expect(isValidMessageType('SHOW_RESULT')).toBe(true);
    expect(isValidMessageType('SHOW_ERROR')).toBe(true);
    expect(isValidMessageType('DISMISS_OVERLAY')).toBe(true);
    expect(isValidMessageType('START_TRANSLATE')).toBe(true);
  });

  it('rejects unknown message types', () => {
    expect(isValidMessageType('UNKNOWN')).toBe(false);
    expect(isValidMessageType('')).toBe(false);
    expect(isValidMessageType(null)).toBe(false);
    expect(isValidMessageType(42)).toBe(false);
  });
});

describe('isSupportedLanguage', () => {
  it('accepts valid languages', () => {
    expect(isSupportedLanguage('English')).toBe(true);
    expect(isSupportedLanguage('German')).toBe(true);
    expect(isSupportedLanguage('Romanian')).toBe(true);
  });

  it('rejects invalid languages', () => {
    expect(isSupportedLanguage('english')).toBe(false);
    expect(isSupportedLanguage('FR')).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
    expect(isSupportedLanguage(undefined)).toBe(false);
    expect(isSupportedLanguage('')).toBe(false);
  });
});

describe('isCorrectGrammarRequest', () => {
  it('accepts a valid CORRECT_GRAMMAR message', () => {
    const msg = { type: 'CORRECT_GRAMMAR', payload: { text: 'She dont know nothing.' } };
    expect(isCorrectGrammarRequest(msg)).toBe(true);
  });

  it('rejects missing payload', () => {
    expect(isCorrectGrammarRequest({ type: 'CORRECT_GRAMMAR' })).toBe(false);
  });

  it('rejects non-string text', () => {
    expect(isCorrectGrammarRequest({ type: 'CORRECT_GRAMMAR', payload: { text: 123 } })).toBe(false);
  });

  it('rejects wrong type', () => {
    expect(isCorrectGrammarRequest({ type: 'TRANSLATE', payload: { text: 'hello' } })).toBe(false);
  });

  it('rejects null', () => {
    expect(isCorrectGrammarRequest(null)).toBe(false);
  });
});

describe('isTranslateRequest', () => {
  it('accepts a valid TRANSLATE message', () => {
    const msg = {
      type: 'TRANSLATE',
      payload: { text: 'Hello', targetLanguage: 'Romanian' },
    };
    expect(isTranslateRequest(msg)).toBe(true);
  });

  it('accepts all three target languages', () => {
    for (const lang of ['English', 'German', 'Romanian']) {
      expect(isTranslateRequest({
        type: 'TRANSLATE',
        payload: { text: 'Hello', targetLanguage: lang },
      })).toBe(true);
    }
  });

  it('rejects invalid targetLanguage', () => {
    const msg = {
      type: 'TRANSLATE',
      payload: { text: 'Hi', targetLanguage: 'French' },
    };
    expect(isTranslateRequest(msg)).toBe(false);
  });

  it('rejects missing text', () => {
    const msg = {
      type: 'TRANSLATE',
      payload: { targetLanguage: 'English' },
    };
    expect(isTranslateRequest(msg)).toBe(false);
  });

  it('rejects null', () => {
    expect(isTranslateRequest(null)).toBe(false);
  });
});

describe('isHealthCheckRequest', () => {
  it('accepts a valid HEALTH_CHECK message', () => {
    expect(isHealthCheckRequest({ type: 'HEALTH_CHECK' })).toBe(true);
  });

  it('rejects wrong type', () => {
    expect(isHealthCheckRequest({ type: 'CORRECT_GRAMMAR' })).toBe(false);
  });

  it('rejects null', () => {
    expect(isHealthCheckRequest(null)).toBe(false);
  });
});

describe('isGetSettingsRequest', () => {
  it('accepts a valid GET_SETTINGS message', () => {
    expect(isGetSettingsRequest({ type: 'GET_SETTINGS' })).toBe(true);
  });

  it('rejects wrong type', () => {
    expect(isGetSettingsRequest({ type: 'SAVE_SETTINGS' })).toBe(false);
  });
});

describe('isSaveSettingsRequest', () => {
  it('accepts a valid SAVE_SETTINGS message', () => {
    const msg = {
      type: 'SAVE_SETTINGS',
      payload: { settings: { model: 'qwen3:14b' } },
    };
    expect(isSaveSettingsRequest(msg)).toBe(true);
  });

  it('rejects missing payload', () => {
    expect(isSaveSettingsRequest({ type: 'SAVE_SETTINGS' })).toBe(false);
  });

  it('rejects null', () => {
    expect(isSaveSettingsRequest(null)).toBe(false);
  });

  it('accepts the new OpenAI settings fields', () => {
    const msg = {
      type: 'SAVE_SETTINGS',
      payload: {
        settings: {
          provider: 'openai',
          openaiModel: 'gpt-5-nano',
          openaiApiKey: 'sk-test',
          openaiConsentAcknowledged: true,
        },
      },
    };
    expect(isSaveSettingsRequest(msg)).toBe(true);
  });

  it('accepts the redaction sentinel as openaiApiKey (it is still a string)', () => {
    const msg = {
      type: 'SAVE_SETTINGS',
      payload: { settings: { openaiApiKey: '__SET__' } },
    };
    expect(isSaveSettingsRequest(msg)).toBe(true);
  });

  it('rejects an invalid provider value', () => {
    const msg = {
      type: 'SAVE_SETTINGS',
      payload: { settings: { provider: 'anthropic' } },
    };
    expect(isSaveSettingsRequest(msg)).toBe(false);
  });

  it('rejects a non-string openaiApiKey value', () => {
    const msg = {
      type: 'SAVE_SETTINGS',
      payload: { settings: { openaiApiKey: 12345 } },
    };
    expect(isSaveSettingsRequest(msg)).toBe(false);
  });
});

describe('isValidateOpenAIKeyRequest', () => {
  it('accepts a valid VALIDATE_OPENAI_KEY message', () => {
    const msg = {
      type: 'VALIDATE_OPENAI_KEY',
      payload: { key: 'sk-test', model: 'gpt-5-nano' },
    };
    expect(isValidateOpenAIKeyRequest(msg)).toBe(true);
  });

  it('accepts both available OpenAI models', () => {
    expect(isValidateOpenAIKeyRequest({
      type: 'VALIDATE_OPENAI_KEY',
      payload: { key: 'sk-test', model: 'gpt-5.4-nano' },
    })).toBe(true);
    expect(isValidateOpenAIKeyRequest({
      type: 'VALIDATE_OPENAI_KEY',
      payload: { key: 'sk-test', model: 'gpt-5-nano' },
    })).toBe(true);
  });

  it('rejects an unknown model', () => {
    const msg = {
      type: 'VALIDATE_OPENAI_KEY',
      payload: { key: 'sk-test', model: 'gpt-4o' },
    };
    expect(isValidateOpenAIKeyRequest(msg)).toBe(false);
  });

  it('rejects a non-string key', () => {
    const msg = {
      type: 'VALIDATE_OPENAI_KEY',
      payload: { key: 123, model: 'gpt-5-nano' },
    };
    expect(isValidateOpenAIKeyRequest(msg)).toBe(false);
  });

  it('rejects a missing payload', () => {
    expect(isValidateOpenAIKeyRequest({ type: 'VALIDATE_OPENAI_KEY' })).toBe(false);
  });

  it('rejects the wrong message type', () => {
    expect(isValidateOpenAIKeyRequest({
      type: 'SAVE_SETTINGS',
      payload: { key: 'sk-test', model: 'gpt-5-nano' },
    })).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidateOpenAIKeyRequest(null)).toBe(false);
  });
});
