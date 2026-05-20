// tests/unit/messages.test.ts
import { describe, it, expect } from 'vitest';
import {
  isValidMessageType,
  isSupportedLanguage,
  isCorrectGrammarRequest,
  isTranslateRequest,
  isDetectLanguageRequest,
  isHealthCheckRequest,
  isGetSettingsRequest,
  isSaveSettingsRequest,
} from '../../src/shared/messages.ts';

describe('isValidMessageType', () => {
  it('accepts known message types', () => {
    expect(isValidMessageType('CORRECT_GRAMMAR')).toBe(true);
    expect(isValidMessageType('TRANSLATE')).toBe(true);
    expect(isValidMessageType('HEALTH_CHECK')).toBe(true);
    expect(isValidMessageType('GET_SETTINGS')).toBe(true);
    expect(isValidMessageType('SAVE_SETTINGS')).toBe(true);
    expect(isValidMessageType('SHOW_LOADING')).toBe(true);
    expect(isValidMessageType('SHOW_RESULT')).toBe(true);
    expect(isValidMessageType('SHOW_ERROR')).toBe(true);
    expect(isValidMessageType('DISMISS_OVERLAY')).toBe(true);
    expect(isValidMessageType('DETECT_LANGUAGE')).toBe(true);
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
  it('accepts a valid TRANSLATE message with auto-detect', () => {
    const msg = {
      type: 'TRANSLATE',
      payload: { text: 'Hello', targetLanguage: 'Romanian', sourceLanguage: null },
    };
    expect(isTranslateRequest(msg)).toBe(true);
  });

  it('accepts a valid TRANSLATE message with explicit source', () => {
    const msg = {
      type: 'TRANSLATE',
      payload: { text: 'Hallo', targetLanguage: 'English', sourceLanguage: 'German' },
    };
    expect(isTranslateRequest(msg)).toBe(true);
  });

  it('rejects invalid targetLanguage', () => {
    const msg = {
      type: 'TRANSLATE',
      payload: { text: 'Hi', targetLanguage: 'French', sourceLanguage: null },
    };
    expect(isTranslateRequest(msg)).toBe(false);
  });

  it('rejects invalid sourceLanguage', () => {
    const msg = {
      type: 'TRANSLATE',
      payload: { text: 'Hi', targetLanguage: 'English', sourceLanguage: 'Spanish' },
    };
    expect(isTranslateRequest(msg)).toBe(false);
  });

  it('rejects missing text', () => {
    const msg = {
      type: 'TRANSLATE',
      payload: { targetLanguage: 'English', sourceLanguage: null },
    };
    expect(isTranslateRequest(msg)).toBe(false);
  });

  it('rejects null', () => {
    expect(isTranslateRequest(null)).toBe(false);
  });
});

describe('isDetectLanguageRequest', () => {
  it('accepts a valid DETECT_LANGUAGE message', () => {
    expect(isDetectLanguageRequest({ type: 'DETECT_LANGUAGE', payload: { text: 'Hello' } })).toBe(true);
  });

  it('rejects missing payload', () => {
    expect(isDetectLanguageRequest({ type: 'DETECT_LANGUAGE' })).toBe(false);
  });

  it('rejects non-string text', () => {
    expect(isDetectLanguageRequest({ type: 'DETECT_LANGUAGE', payload: { text: 42 } })).toBe(false);
  });

  it('rejects wrong type', () => {
    expect(isDetectLanguageRequest({ type: 'TRANSLATE', payload: { text: 'hi' } })).toBe(false);
  });

  it('rejects null', () => {
    expect(isDetectLanguageRequest(null)).toBe(false);
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
});
