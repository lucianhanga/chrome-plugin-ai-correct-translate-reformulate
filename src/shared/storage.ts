// src/shared/storage.ts
// Type-safe storage abstraction over chrome.storage.local.

import type { ExtensionSettings } from './types.ts';
import { DEFAULT_SETTINGS, AVAILABLE_OPENAI_MODELS, DEFAULT_OPENAI_MODEL, REFORMULATE_TONES, SUMMARIZE_LENGTHS, SUPPORTED_LANGUAGES } from './constants.ts';

// ============================================================
// Storage Schema
// ============================================================

export interface StorageSchema {
  settings: ExtensionSettings;
}

// ============================================================
// Read
// ============================================================

/**
 * Read settings from chrome.storage.local, merging with defaults.
 * Missing fields are filled with default values.
 */
export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get('settings');
  const stored = result['settings'] as Partial<ExtensionSettings> | undefined;
  const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };

  // Defense-in-depth: coerce new fields to valid values in case of corrupted
  // or hand-edited storage. The spread does not validate value types.
  if (merged.provider !== 'ollama' && merged.provider !== 'openai') {
    merged.provider = 'ollama';
  }
  if (!AVAILABLE_OPENAI_MODELS.includes(merged.openaiModel)) {
    merged.openaiModel = DEFAULT_OPENAI_MODEL;
  }
  if (typeof merged.openaiApiKey !== 'string') {
    merged.openaiApiKey = '';
  }
  if (typeof merged.openaiConsentAcknowledged !== 'boolean') {
    merged.openaiConsentAcknowledged = false;
  }
  // Defense-in-depth: coerce reformulate fields to valid values.
  if (typeof merged.keepTerminology !== 'boolean') {
    merged.keepTerminology = true;
  }
  if (!REFORMULATE_TONES.includes(merged.defaultReformulateTone)) {
    merged.defaultReformulateTone = 'keep';
  }
  // Defense-in-depth: coerce summarize fields to valid values.
  if (!SUMMARIZE_LENGTHS.includes(merged.defaultSummarizeLength)) {
    merged.defaultSummarizeLength = 'standard';
  }
  // Defense-in-depth: coerce the all-sites toolbar flag to a boolean.
  if (typeof merged.toolbarAllSites !== 'boolean') {
    merged.toolbarAllSites = false;
  }
  // Defense-in-depth: coerce the target language to a supported value (covers
  // both Romanian variants and guards against corrupted/hand-edited storage).
  if (!SUPPORTED_LANGUAGES.includes(merged.defaultTargetLanguage)) {
    merged.defaultTargetLanguage = DEFAULT_SETTINGS.defaultTargetLanguage;
  }

  return merged;
}

// ============================================================
// Write
// ============================================================

/**
 * Write partial settings to chrome.storage.local.
 * Merges with existing settings rather than replacing the entire object.
 */
export async function saveSettings(partial: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();
  const updated: ExtensionSettings = { ...current, ...partial };
  await chrome.storage.local.set({ settings: updated });
}

/**
 * Reset all settings to defaults.
 */
export async function resetSettings(): Promise<void> {
  await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
}

/**
 * Clear all extension storage (settings only -- no user data is ever stored).
 */
export async function clearStorage(): Promise<void> {
  await chrome.storage.local.clear();
}
