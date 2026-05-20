// src/shared/types.ts
// Shared type definitions used across extension contexts.

// ============================================================
// Language Types
// ============================================================

export type SupportedLanguage = 'English' | 'German' | 'Romanian';

export type ActionType = 'correct' | 'translate';

// ============================================================
// Extension Settings
// ============================================================

export interface ExtensionSettings {
  ollamaEndpoint: string;
  model: string;
  defaultTargetLanguage: SupportedLanguage;
  sourceLanguageOverride: SupportedLanguage | null;
}

// ============================================================
// Error Codes
// ============================================================

export type ErrorCode =
  | 'OLLAMA_UNREACHABLE'
  | 'MODEL_NOT_FOUND'
  | 'REQUEST_TIMEOUT'
  | 'EMPTY_INPUT'
  | 'INPUT_TOO_LONG'
  | 'INVALID_MESSAGE'
  | 'UNEXPECTED_RESPONSE'
  | 'UNKNOWN_ERROR';

// ============================================================
// Ollama API Types (internal -- not exposed to content scripts)
// ============================================================

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: false;
  options: {
    temperature: number;
    top_p: number;
    top_k: number;
    num_ctx: number;
    think: boolean;
  };
}

export interface OllamaChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export interface OllamaHealthResult {
  reachable: boolean;
  modelFound: boolean;
  error: string | null;
}

export interface OllamaCallOptions {
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  temperature?: number;
}

// ============================================================
// Validation
// ============================================================

export interface ValidationResult {
  valid: boolean;
  errorCode?: ErrorCode;
  errorMessage?: string;
}
