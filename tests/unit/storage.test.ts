// tests/unit/storage.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { installChromeMock, resetChromeMock, chromeMock } from '../mocks/chrome.ts';
import { DEFAULT_SETTINGS, DEFAULT_OPENAI_MODEL } from '../../src/shared/constants.ts';

beforeAll(() => {
  installChromeMock();
});

beforeEach(() => {
  resetChromeMock();
});

// Import after mocks are installed to avoid reference errors at module load time
async function getStorageModule() {
  // Dynamic import ensures chrome mock is in place before module evaluation
  return await import('../../src/shared/storage.ts');
}

describe('getSettings', () => {
  it('returns default settings when storage is empty', async () => {
    const { getSettings } = await getStorageModule();
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('merges stored settings with defaults', async () => {
    const { getSettings, saveSettings } = await getStorageModule();
    await saveSettings({ model: 'qwen3:14b' });
    const settings = await getSettings();
    expect(settings.model).toBe('qwen3:14b');
    expect(settings.ollamaEndpoint).toBe(DEFAULT_SETTINGS.ollamaEndpoint);
    expect(settings.defaultTargetLanguage).toBe(DEFAULT_SETTINGS.defaultTargetLanguage);
  });

  it('returns the full settings object with all required fields', async () => {
    const { getSettings } = await getStorageModule();
    const settings = await getSettings();
    expect(settings).toHaveProperty('ollamaEndpoint');
    expect(settings).toHaveProperty('model');
    expect(settings).toHaveProperty('defaultTargetLanguage');
    // OpenAI provider fields are also present.
    expect(settings).toHaveProperty('provider');
    expect(settings).toHaveProperty('openaiModel');
    expect(settings).toHaveProperty('openaiApiKey');
    expect(settings).toHaveProperty('openaiConsentAcknowledged');
  });
});

// ============================================================
// Migration and coercion of the new OpenAI provider fields
// ============================================================

describe('getSettings: OpenAI provider field migration and coercion', () => {
  // Write a raw settings object directly into the mocked storage, bypassing
  // saveSettings(), so we can simulate a pre-OpenAI or hand-edited storage state.
  async function seedRawSettings(raw: Record<string, unknown>): Promise<void> {
    await chromeMock.storage.local.set({ settings: raw });
  }

  it('fills the provider fields from defaults for a pre-OpenAI stored shape', async () => {
    const { getSettings } = await getStorageModule();
    // A pre-OpenAI settings object: only the original fields exist (no provider fields).
    await seedRawSettings({
      ollamaEndpoint: 'http://localhost:11434',
      model: 'qwen3:14b',
      defaultTargetLanguage: 'German',
    });
    const settings = await getSettings();
    expect(settings.provider).toBe('ollama');
    expect(settings.openaiModel).toBe(DEFAULT_OPENAI_MODEL);
    expect(settings.openaiApiKey).toBe('');
    expect(settings.openaiConsentAcknowledged).toBe(false);
    // The user's existing fields are untouched.
    expect(settings.defaultTargetLanguage).toBe('German');
  });

  it('keeps already-stored OpenAI field values when present', async () => {
    const { getSettings, saveSettings } = await getStorageModule();
    await saveSettings({
      provider: 'openai',
      openaiModel: 'gpt-5.4-nano',
      openaiApiKey: 'sk-stored',
      openaiConsentAcknowledged: true,
    });
    const settings = await getSettings();
    expect(settings.provider).toBe('openai');
    expect(settings.openaiModel).toBe('gpt-5.4-nano');
    expect(settings.openaiApiKey).toBe('sk-stored');
    expect(settings.openaiConsentAcknowledged).toBe(true);
  });

  it('coerces an invalid provider value back to "ollama"', async () => {
    const { getSettings } = await getStorageModule();
    await seedRawSettings({ ...DEFAULT_SETTINGS, provider: 'anthropic' });
    const settings = await getSettings();
    expect(settings.provider).toBe('ollama');
  });

  it('coerces an unknown openaiModel back to the default model', async () => {
    const { getSettings } = await getStorageModule();
    await seedRawSettings({ ...DEFAULT_SETTINGS, openaiModel: 'gpt-4o' });
    const settings = await getSettings();
    expect(settings.openaiModel).toBe(DEFAULT_OPENAI_MODEL);
  });

  it('coerces a non-string openaiApiKey to an empty string', async () => {
    const { getSettings } = await getStorageModule();
    await seedRawSettings({ ...DEFAULT_SETTINGS, openaiApiKey: 12345 });
    const settings = await getSettings();
    expect(settings.openaiApiKey).toBe('');
  });

  it('coerces a non-boolean openaiConsentAcknowledged to false', async () => {
    const { getSettings } = await getStorageModule();
    await seedRawSettings({ ...DEFAULT_SETTINGS, openaiConsentAcknowledged: 'yes' });
    const settings = await getSettings();
    expect(settings.openaiConsentAcknowledged).toBe(false);
  });

  it('preserves a valid non-default provider/model combination', async () => {
    const { getSettings } = await getStorageModule();
    await seedRawSettings({
      ...DEFAULT_SETTINGS,
      provider: 'openai',
      openaiModel: 'gpt-5.4-nano',
    });
    const settings = await getSettings();
    expect(settings.provider).toBe('openai');
    expect(settings.openaiModel).toBe('gpt-5.4-nano');
  });
});

describe('saveSettings', () => {
  it('persists a partial settings update', async () => {
    const { getSettings, saveSettings } = await getStorageModule();
    await saveSettings({ defaultTargetLanguage: 'German' });
    const settings = await getSettings();
    expect(settings.defaultTargetLanguage).toBe('German');
  });

  it('does not overwrite unrelated settings', async () => {
    const { getSettings, saveSettings } = await getStorageModule();
    await saveSettings({ model: 'qwen3:14b' });
    await saveSettings({ defaultTargetLanguage: 'Romanian' });
    const settings = await getSettings();
    expect(settings.model).toBe('qwen3:14b');
    expect(settings.defaultTargetLanguage).toBe('Romanian');
  });
});

describe('resetSettings', () => {
  it('restores all defaults', async () => {
    const { getSettings, saveSettings, resetSettings } = await getStorageModule();
    await saveSettings({ model: 'qwen3:14b', defaultTargetLanguage: 'Romanian' });
    await resetSettings();
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });
});
