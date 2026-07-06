// src/shared/messages.ts
// Typed message interfaces and type guards for all extension message passing.

import type { SupportedLanguage, ActionType, ErrorCode, ExtensionSettings, OpenAIModel, ReformulateTone, SummarizeLength } from './types.ts';
import { AVAILABLE_OPENAI_MODELS, REFORMULATE_TONES, SUMMARIZE_LENGTHS } from './constants.ts';

// ============================================================
// Re-exports so consumers only need to import from messages.ts
// ============================================================

export type { SupportedLanguage, ActionType, ErrorCode, ExtensionSettings, ReformulateTone, SummarizeLength };

// ============================================================
// Messages: Popup -> Service Worker
// ============================================================

export interface CorrectGrammarRequest {
  type: 'CORRECT_GRAMMAR';
  payload: {
    text: string;
  };
}

export interface TranslateRequest {
  type: 'TRANSLATE';
  payload: {
    text: string;
    targetLanguage: SupportedLanguage;
  };
}

export interface HealthCheckRequest {
  type: 'HEALTH_CHECK';
}

export interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}

export interface SaveSettingsRequest {
  type: 'SAVE_SETTINGS';
  payload: {
    settings: Partial<ExtensionSettings>;
  };
}

export interface ValidateOpenAIKeyRequest {
  type: 'VALIDATE_OPENAI_KEY';
  payload: {
    key: string;
    model: OpenAIModel;
  };
}

export interface ReformulateRequest {
  type: 'REFORMULATE';
  payload: {
    text: string;
    tone: ReformulateTone;
    keepTerminology: boolean;
  };
}

export interface SummarizeRequest {
  type: 'SUMMARIZE';
  payload: {
    text: string;
    length: SummarizeLength;
  };
}

/**
 * Sent by the in-page selection toolbar (a content script) to the service
 * worker. Unlike the popup requests above, this carries a fully-specified
 * action plus the selected text; the service worker runs it in the sender's
 * tab/frame via the shared context-menu dispatch path.
 */
export interface RunSelectionActionRequest {
  type: 'RUN_SELECTION_ACTION';
  payload: {
    action: ActionType;
    text: string;
    targetLanguage?: SupportedLanguage;
    tone?: ReformulateTone;
    length?: SummarizeLength;
  };
}

export type PopupToServiceWorkerMessage =
  | CorrectGrammarRequest
  | TranslateRequest
  | HealthCheckRequest
  | GetSettingsRequest
  | SaveSettingsRequest
  | ValidateOpenAIKeyRequest
  | ReformulateRequest
  | SummarizeRequest;

// ============================================================
// Messages: Service Worker -> Content Script
// ============================================================

export interface ShowLoadingMessage {
  type: 'SHOW_LOADING';
  payload: {
    action: ActionType;
    originalText: string;
    /** Active LLM provider, used to display "Processing with <provider>..." */
    provider: import('./types.ts').LLMProvider;
    /** Reformulate tone, present only when action is 'reformulate'. */
    tone?: ReformulateTone;
  };
}

export interface ShowResultMessage {
  type: 'SHOW_RESULT';
  payload: {
    action: ActionType;
    originalText: string;
    resultText: string;
    targetLanguage?: SupportedLanguage;
    /** Reformulate tone, present only when action is 'reformulate'. */
    tone?: ReformulateTone;
    /** Model identifier reported by the LLM response. */
    model: string;
    /** Total tokens consumed (prompt + completion), or null when absent. */
    totalTokens: number | null;
    /** Wall-clock milliseconds for the LLM call. */
    elapsedMs: number;
  };
}

export interface ShowErrorMessage {
  type: 'SHOW_ERROR';
  payload: {
    errorCode: ErrorCode;
    errorMessage: string;
  };
}

export interface DismissOverlayMessage {
  type: 'DISMISS_OVERLAY';
}

export interface StartTranslateMessage {
  type: 'START_TRANSLATE';
  payload: {
    originalText: string;
    targetLanguage: SupportedLanguage;
    /** Active LLM provider, used to display "Processing with <provider>..." */
    provider: import('./types.ts').LLMProvider;
  };
}

export interface StartReformulateMessage {
  type: 'START_REFORMULATE';
  payload: {
    originalText: string;
    tone: ReformulateTone;
    keepTerminology: boolean;
    /** Active LLM provider, used to display "Processing with <provider>..." */
    provider: import('./types.ts').LLMProvider;
  };
}

export interface StartSummarizeMessage {
  type: 'START_SUMMARIZE';
  payload: {
    originalText: string;
    length: SummarizeLength;
    /** Active LLM provider, used to display "Processing with <provider>..." */
    provider: import('./types.ts').LLMProvider;
  };
}

export type ServiceWorkerToContentScriptMessage =
  | ShowLoadingMessage
  | ShowResultMessage
  | ShowErrorMessage
  | DismissOverlayMessage
  | StartTranslateMessage
  | StartReformulateMessage
  | StartSummarizeMessage;

// ============================================================
// Responses: Service Worker -> Popup
// ============================================================

export interface SuccessResponse {
  success: true;
  result: string;
  /** Model identifier reported by the LLM response. */
  model: string;
  /** Total tokens consumed (prompt + completion), or null when absent. */
  totalTokens: number | null;
  /** Wall-clock milliseconds for the LLM call. */
  elapsedMs: number;
}

export interface ErrorResponse {
  success: false;
  error: string;
  errorCode: ErrorCode;
}

export interface HealthCheckResponse {
  success: true;
  reachable: boolean;
  modelFound: boolean;
  error: string | null;
}

export interface SettingsResponse {
  success: true;
  settings: ExtensionSettings;
}

export interface SaveSettingsResponse {
  success: true;
}

export interface ValidateOpenAIKeyResponse {
  success: true;
  valid: boolean;
  modelFound: boolean;
  error: string | null;
}

export type ServiceWorkerResponse =
  | SuccessResponse
  | ErrorResponse
  | HealthCheckResponse
  | SettingsResponse
  | SaveSettingsResponse
  | ValidateOpenAIKeyResponse;

// ============================================================
// Known valid message type strings
// ============================================================

const VALID_TYPES: ReadonlySet<string> = new Set([
  'CORRECT_GRAMMAR',
  'TRANSLATE',
  'REFORMULATE',
  'HEALTH_CHECK',
  'GET_SETTINGS',
  'SAVE_SETTINGS',
  'VALIDATE_OPENAI_KEY',
  'SHOW_LOADING',
  'SHOW_RESULT',
  'SHOW_ERROR',
  'DISMISS_OVERLAY',
  'START_TRANSLATE',
  'START_REFORMULATE',
  'SUMMARIZE',
  'START_SUMMARIZE',
  'RUN_SELECTION_ACTION',
]);

const ACTION_TYPES_SET: ReadonlySet<string> = new Set([
  'correct',
  'translate',
  'reformulate',
  'summarize',
]);

const SUPPORTED_LANGUAGES_SET: ReadonlySet<string> = new Set([
  'English',
  'German',
  'Romanian',
  'Romanian (no diacritics)',
  'Spanish',
  'Italian',
]);

// ============================================================
// Type Guards
// ============================================================

export function isValidMessageType(type: unknown): type is string {
  return typeof type === 'string' && VALID_TYPES.has(type);
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && SUPPORTED_LANGUAGES_SET.has(value);
}

export function isCorrectGrammarRequest(msg: unknown): msg is CorrectGrammarRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'CORRECT_GRAMMAR' && typeof (m['payload'] as Record<string, unknown>)?.['text'] === 'string';
}

export function isTranslateRequest(msg: unknown): msg is TranslateRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m['type'] !== 'TRANSLATE') return false;
  const payload = m['payload'] as Record<string, unknown> | undefined;
  if (!payload) return false;
  return (
    typeof payload['text'] === 'string' &&
    isSupportedLanguage(payload['targetLanguage'])
  );
}

export function isHealthCheckRequest(msg: unknown): msg is HealthCheckRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'HEALTH_CHECK';
}

export function isGetSettingsRequest(msg: unknown): msg is GetSettingsRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'GET_SETTINGS';
}

export function isSaveSettingsRequest(msg: unknown): msg is SaveSettingsRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m['type'] !== 'SAVE_SETTINGS') return false;
  const payload = m['payload'] as Record<string, unknown> | undefined;
  if (typeof payload !== 'object' || payload === null || typeof payload['settings'] !== 'object') {
    return false;
  }
  const settings = payload['settings'] as Record<string, unknown>;
  // Reject obviously malformed provider or openaiApiKey values
  if ('provider' in settings && settings['provider'] !== 'ollama' && settings['provider'] !== 'openai') {
    return false;
  }
  if ('openaiApiKey' in settings && typeof settings['openaiApiKey'] !== 'string') {
    return false;
  }
  return true;
}

export function isValidateOpenAIKeyRequest(msg: unknown): msg is ValidateOpenAIKeyRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m['type'] !== 'VALIDATE_OPENAI_KEY') return false;
  const payload = m['payload'] as Record<string, unknown> | undefined;
  if (typeof payload !== 'object' || payload === null) return false;
  return (
    typeof payload['key'] === 'string' &&
    typeof payload['model'] === 'string' &&
    AVAILABLE_OPENAI_MODELS.includes(payload['model'] as OpenAIModel)
  );
}

/**
 * Type guard: checks that value is one of the four ReformulateTone values.
 */
export function isReformulateTone(v: unknown): v is ReformulateTone {
  return typeof v === 'string' && (REFORMULATE_TONES as readonly string[]).includes(v);
}

/**
 * Type guard: validates a REFORMULATE message from the popup.
 */
export function isReformulateRequest(msg: unknown): msg is ReformulateRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m['type'] !== 'REFORMULATE') return false;
  const payload = m['payload'] as Record<string, unknown> | undefined;
  if (typeof payload !== 'object' || payload === null) return false;
  return (
    typeof payload['text'] === 'string' &&
    isReformulateTone(payload['tone']) &&
    typeof payload['keepTerminology'] === 'boolean'
  );
}

/**
 * Type guard: checks that value is one of the three SummarizeLength values.
 */
export function isSummarizeLength(v: unknown): v is SummarizeLength {
  return typeof v === 'string' && (SUMMARIZE_LENGTHS as readonly string[]).includes(v);
}

/**
 * Type guard: validates a RUN_SELECTION_ACTION message from the in-page
 * selection toolbar. Ensures the action is known and that any per-action
 * parameter present is valid, so a malformed message can never drive a request.
 */
export function isRunSelectionActionRequest(msg: unknown): msg is RunSelectionActionRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m['type'] !== 'RUN_SELECTION_ACTION') return false;
  const payload = m['payload'] as Record<string, unknown> | undefined;
  if (typeof payload !== 'object' || payload === null) return false;
  if (typeof payload['text'] !== 'string') return false;
  const action = payload['action'];
  if (typeof action !== 'string' || !ACTION_TYPES_SET.has(action)) return false;

  // Each action requires its own parameter to be valid when present.
  if (action === 'translate') {
    return isSupportedLanguage(payload['targetLanguage']);
  }
  if (action === 'reformulate') {
    return isReformulateTone(payload['tone']);
  }
  if (action === 'summarize') {
    return isSummarizeLength(payload['length']);
  }
  // 'correct' takes no parameter.
  return true;
}

/**
 * Type guard: validates a SUMMARIZE message from the popup.
 */
export function isSummarizeRequest(msg: unknown): msg is SummarizeRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m['type'] !== 'SUMMARIZE') return false;
  const payload = m['payload'] as Record<string, unknown> | undefined;
  if (typeof payload !== 'object' || payload === null) return false;
  return (
    typeof payload['text'] === 'string' &&
    isSummarizeLength(payload['length'])
  );
}
