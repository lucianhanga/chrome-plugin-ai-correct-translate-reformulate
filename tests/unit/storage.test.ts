// tests/unit/storage.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { installChromeMock, resetChromeMock } from '../mocks/chrome.ts';
import { DEFAULT_SETTINGS } from '../../src/shared/constants.ts';

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
    expect(settings).toHaveProperty('sourceLanguageOverride');
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

  it('can set sourceLanguageOverride to a specific language', async () => {
    const { getSettings, saveSettings } = await getStorageModule();
    await saveSettings({ sourceLanguageOverride: 'German' });
    const settings = await getSettings();
    expect(settings.sourceLanguageOverride).toBe('German');
  });

  it('can reset sourceLanguageOverride to null', async () => {
    const { getSettings, saveSettings } = await getStorageModule();
    await saveSettings({ sourceLanguageOverride: 'German' });
    await saveSettings({ sourceLanguageOverride: null });
    const settings = await getSettings();
    expect(settings.sourceLanguageOverride).toBeNull();
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
