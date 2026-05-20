// src/shared/constants.ts
// Shared constants used across extension contexts.

import type { SupportedLanguage, ExtensionSettings, OpenAIModel } from './types.ts';

// ============================================================
// Supported Languages
// ============================================================

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  'English',
  'German',
  'Romanian',
] as const;

export const LANGUAGE_DISPLAY_NAMES: Record<SupportedLanguage, string> = {
  English: 'English',
  German: 'German',
  Romanian: 'Romanian',
};

// ============================================================
// Ollama Defaults
// ============================================================

export const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
export const DEFAULT_MODEL = 'qwen3:14b';
export const FALLBACK_MODEL = 'qwen3:14b';

// ============================================================
// Ollama Request Parameters
// ============================================================

export const OLLAMA_PARAMS = {
  temperature: 0.2,
  top_p: 0.8,
  top_k: 20,
  num_ctx: 16384,
  think: false,
} as const;

// ============================================================
// OpenAI Defaults
// ============================================================

export const OPENAI_API_BASE = 'https://api.openai.com';
export const DEFAULT_OPENAI_MODEL: OpenAIModel = 'gpt-5-nano';
export const AVAILABLE_OPENAI_MODELS: readonly OpenAIModel[] = [
  'gpt-5.4-nano',
  'gpt-5-nano',
] as const;

// ============================================================
// Timeouts
// ============================================================

export const REQUEST_TIMEOUT_MS = 60_000;
export const HEALTH_CHECK_TIMEOUT_MS = 5_000;

// ============================================================
// Input Limits
// ============================================================

export const MAX_INPUT_LENGTH = 10_000;

// ============================================================
// Extension Defaults
// ============================================================

export const DEFAULT_SETTINGS: ExtensionSettings = {
  ollamaEndpoint: DEFAULT_OLLAMA_ENDPOINT,
  model: DEFAULT_MODEL,
  defaultTargetLanguage: 'English',
  provider: 'ollama',
  openaiModel: DEFAULT_OPENAI_MODEL,
  openaiApiKey: '',
  openaiConsentAcknowledged: false,
};

// ============================================================
// Context Menu IDs
// ============================================================

export const CONTEXT_MENU_IDS = {
  CORRECT_GRAMMAR: 'correct_grammar',
  TRANSLATE_PARENT: 'translate_parent',
  TRANSLATE_EN: 'translate_en',
  TRANSLATE_DE: 'translate_de',
  TRANSLATE_RO: 'translate_ro',
} as const;

export type ContextMenuId = (typeof CONTEXT_MENU_IDS)[keyof typeof CONTEXT_MENU_IDS];

// ============================================================
// Color Codes (for UI elements)
// ============================================================

export const COLORS = {
  SUCCESS: '#22c55e',
  FAILURE: '#ef4444',
  WARNING: '#eab308',
} as const;
