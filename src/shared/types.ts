// src/shared/types.ts
// Shared type definitions used across extension contexts.

// ============================================================
// Language Types
// ============================================================

export type SupportedLanguage = 'English' | 'German' | 'Romanian';

export type ActionType = 'correct' | 'translate';

// ============================================================
// Provider Types
// ============================================================

export type LLMProvider = 'ollama' | 'openai';

export type OpenAIModel = 'gpt-5.4-nano' | 'gpt-5-nano';

// ============================================================
// Extension Settings
// ============================================================

export interface ExtensionSettings {
  ollamaEndpoint: string;
  model: string;                        // Ollama model
  defaultTargetLanguage: SupportedLanguage;

  // Provider selection
  provider: LLMProvider;                // discriminator; default 'ollama'
  openaiModel: OpenAIModel;             // default 'gpt-5-nano'
  openaiApiKey: string;                 // default '' (empty = not configured)
  openaiConsentAcknowledged: boolean;   // one-time egress consent flag; default false
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
  | 'UNKNOWN_ERROR'
  | 'OPENAI_AUTH_FAILED'
  | 'OPENAI_RATE_LIMITED'
  | 'OPENAI_QUOTA_EXCEEDED'
  | 'OPENAI_UNREACHABLE';

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
