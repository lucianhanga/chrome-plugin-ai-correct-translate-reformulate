// tests/unit/messages.test.ts
import { describe, it, expect } from 'vitest';
import {
  isValidMessageType,
  isSupportedLanguage,
  isCorrectGrammarRequest,
  isTranslateRequest,
  isReformulateRequest,
  isReformulateTone,
  isSummarizeRequest,
  isSummarizeLength,
  isHealthCheckRequest,
  isGetSettingsRequest,
  isSaveSettingsRequest,
  isValidateOpenAIKeyRequest,
  isRunSelectionActionRequest,
} from '../../src/shared/messages.ts';

describe('isValidMessageType', () => {
  it('accepts known message types', () => {
    expect(isValidMessageType('CORRECT_GRAMMAR')).toBe(true);
    expect(isValidMessageType('TRANSLATE')).toBe(true);
    expect(isValidMessageType('REFORMULATE')).toBe(true);
    expect(isValidMessageType('HEALTH_CHECK')).toBe(true);
    expect(isValidMessageType('GET_SETTINGS')).toBe(true);
    expect(isValidMessageType('SAVE_SETTINGS')).toBe(true);
    expect(isValidMessageType('VALIDATE_OPENAI_KEY')).toBe(true);
    expect(isValidMessageType('SHOW_LOADING')).toBe(true);
    expect(isValidMessageType('SHOW_RESULT')).toBe(true);
    expect(isValidMessageType('SHOW_ERROR')).toBe(true);
    expect(isValidMessageType('DISMISS_OVERLAY')).toBe(true);
    expect(isValidMessageType('START_TRANSLATE')).toBe(true);
    expect(isValidMessageType('START_REFORMULATE')).toBe(true);
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
    expect(isSupportedLanguage('Romanian (no diacritics)')).toBe(true);
    expect(isSupportedLanguage('Spanish')).toBe(true);
    expect(isSupportedLanguage('Italian')).toBe(true);
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

  it('accepts all supported target languages', () => {
    for (const lang of ['English', 'German', 'Romanian', 'Spanish', 'Italian']) {
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

// ============================================================
// isReformulateTone
// ============================================================

describe('isReformulateTone', () => {
  it('accepts all four valid tones', () => {
    expect(isReformulateTone('keep')).toBe(true);
    expect(isReformulateTone('professional')).toBe(true);
    expect(isReformulateTone('friendly')).toBe(true);
    expect(isReformulateTone('natural')).toBe(true);
  });

  it('rejects invalid strings', () => {
    expect(isReformulateTone('ultra-casual')).toBe(false);
    expect(isReformulateTone('')).toBe(false);
    expect(isReformulateTone('KEEP')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isReformulateTone(null)).toBe(false);
    expect(isReformulateTone(undefined)).toBe(false);
    expect(isReformulateTone(42)).toBe(false);
  });
});

// ============================================================
// isReformulateRequest
// ============================================================

describe('isReformulateRequest', () => {
  it('accepts a valid REFORMULATE message', () => {
    const msg = {
      type: 'REFORMULATE',
      payload: { text: 'Some text.', tone: 'professional', keepTerminology: true },
    };
    expect(isReformulateRequest(msg)).toBe(true);
  });

  it('accepts all four valid tones', () => {
    for (const tone of ['keep', 'professional', 'friendly', 'natural']) {
      expect(isReformulateRequest({
        type: 'REFORMULATE',
        payload: { text: 'text', tone, keepTerminology: false },
      })).toBe(true);
    }
  });

  it('accepts keepTerminology=false', () => {
    expect(isReformulateRequest({
      type: 'REFORMULATE',
      payload: { text: 'text', tone: 'keep', keepTerminology: false },
    })).toBe(true);
  });

  it('rejects an invalid tone', () => {
    expect(isReformulateRequest({
      type: 'REFORMULATE',
      payload: { text: 'text', tone: 'ultra-casual', keepTerminology: true },
    })).toBe(false);
  });

  it('rejects a non-boolean keepTerminology', () => {
    expect(isReformulateRequest({
      type: 'REFORMULATE',
      payload: { text: 'text', tone: 'keep', keepTerminology: 'yes' },
    })).toBe(false);
  });

  it('rejects missing text', () => {
    expect(isReformulateRequest({
      type: 'REFORMULATE',
      payload: { tone: 'keep', keepTerminology: true },
    })).toBe(false);
  });

  it('rejects wrong type', () => {
    expect(isReformulateRequest({
      type: 'TRANSLATE',
      payload: { text: 'text', tone: 'keep', keepTerminology: true },
    })).toBe(false);
  });

  it('rejects null', () => {
    expect(isReformulateRequest(null)).toBe(false);
  });
});

describe('isSummarizeLength', () => {
  it('accepts the three valid lengths', () => {
    expect(isSummarizeLength('brief')).toBe(true);
    expect(isSummarizeLength('standard')).toBe(true);
    expect(isSummarizeLength('detailed')).toBe(true);
  });

  it('rejects invalid lengths', () => {
    expect(isSummarizeLength('short')).toBe(false);
    expect(isSummarizeLength('')).toBe(false);
    expect(isSummarizeLength(null)).toBe(false);
    expect(isSummarizeLength(undefined)).toBe(false);
  });
});

describe('isSummarizeRequest', () => {
  it('accepts a valid SUMMARIZE message', () => {
    const msg = { type: 'SUMMARIZE', payload: { text: 'Some long text.', length: 'standard' } };
    expect(isSummarizeRequest(msg)).toBe(true);
  });

  it('accepts all three lengths', () => {
    for (const length of ['brief', 'standard', 'detailed']) {
      expect(isSummarizeRequest({
        type: 'SUMMARIZE',
        payload: { text: 'Some long text.', length },
      })).toBe(true);
    }
  });

  it('rejects an invalid length', () => {
    expect(isSummarizeRequest({
      type: 'SUMMARIZE',
      payload: { text: 'Some long text.', length: 'tiny' },
    })).toBe(false);
  });

  it('rejects non-string text', () => {
    expect(isSummarizeRequest({ type: 'SUMMARIZE', payload: { text: 123, length: 'brief' } })).toBe(false);
  });

  it('rejects wrong type and null', () => {
    expect(isSummarizeRequest({ type: 'REFORMULATE', payload: { text: 'x', length: 'brief' } })).toBe(false);
    expect(isSummarizeRequest(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isRunSelectionActionRequest (in-page selection toolbar)
// ---------------------------------------------------------------------------

describe('isRunSelectionActionRequest', () => {
  it('accepts a correct action with no parameter', () => {
    expect(
      isRunSelectionActionRequest({ type: 'RUN_SELECTION_ACTION', payload: { action: 'correct', text: 'hi' } }),
    ).toBe(true);
  });

  it('accepts translate with a supported language', () => {
    expect(
      isRunSelectionActionRequest({
        type: 'RUN_SELECTION_ACTION',
        payload: { action: 'translate', text: 'hi', targetLanguage: 'German' },
      }),
    ).toBe(true);
  });

  it('accepts reformulate with a valid tone and summarize with a valid length', () => {
    expect(
      isRunSelectionActionRequest({
        type: 'RUN_SELECTION_ACTION',
        payload: { action: 'reformulate', text: 'hi', tone: 'professional' },
      }),
    ).toBe(true);
    expect(
      isRunSelectionActionRequest({
        type: 'RUN_SELECTION_ACTION',
        payload: { action: 'summarize', text: 'hi', length: 'brief' },
      }),
    ).toBe(true);
  });

  it('rejects translate without a valid language', () => {
    expect(
      isRunSelectionActionRequest({
        type: 'RUN_SELECTION_ACTION',
        payload: { action: 'translate', text: 'hi', targetLanguage: 'Klingon' },
      }),
    ).toBe(false);
    expect(
      isRunSelectionActionRequest({ type: 'RUN_SELECTION_ACTION', payload: { action: 'translate', text: 'hi' } }),
    ).toBe(false);
  });

  it('rejects reformulate/summarize with an invalid parameter', () => {
    expect(
      isRunSelectionActionRequest({
        type: 'RUN_SELECTION_ACTION',
        payload: { action: 'reformulate', text: 'hi', tone: 'sarcastic' },
      }),
    ).toBe(false);
    expect(
      isRunSelectionActionRequest({
        type: 'RUN_SELECTION_ACTION',
        payload: { action: 'summarize', text: 'hi', length: 'epic' },
      }),
    ).toBe(false);
  });

  it('rejects an unknown action, non-string text, wrong type, and null', () => {
    expect(
      isRunSelectionActionRequest({ type: 'RUN_SELECTION_ACTION', payload: { action: 'explode', text: 'hi' } }),
    ).toBe(false);
    expect(
      isRunSelectionActionRequest({ type: 'RUN_SELECTION_ACTION', payload: { action: 'correct', text: 123 } }),
    ).toBe(false);
    expect(
      isRunSelectionActionRequest({ type: 'CORRECT_GRAMMAR', payload: { action: 'correct', text: 'hi' } }),
    ).toBe(false);
    expect(isRunSelectionActionRequest(null)).toBe(false);
  });

  it('recognises RUN_SELECTION_ACTION as a valid message type', () => {
    expect(isValidMessageType('RUN_SELECTION_ACTION')).toBe(true);
  });
});
