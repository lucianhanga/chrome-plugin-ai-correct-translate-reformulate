// src/shared/messages.ts
// Typed message interfaces and type guards for all extension message passing.

import type { SupportedLanguage, ActionType, ErrorCode, ExtensionSettings, OpenAIModel } from './types.ts';
import { AVAILABLE_OPENAI_MODELS } from './constants.ts';

// ============================================================
// Re-exports so consumers only need to import from messages.ts
// ============================================================

export type { SupportedLanguage, ActionType, ErrorCode, ExtensionSettings };

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

export type PopupToServiceWorkerMessage =
  | CorrectGrammarRequest
  | TranslateRequest
  | HealthCheckRequest
  | GetSettingsRequest
  | SaveSettingsRequest
  | ValidateOpenAIKeyRequest;

// ============================================================
// Messages: Service Worker -> Content Script
// ============================================================

export interface ShowLoadingMessage {
  type: 'SHOW_LOADING';
  payload: {
    action: ActionType;
    originalText: string;
  };
}

export interface ShowResultMessage {
  type: 'SHOW_RESULT';
  payload: {
    action: ActionType;
    originalText: string;
    resultText: string;
    targetLanguage?: SupportedLanguage;
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
  };
}

export type ServiceWorkerToContentScriptMessage =
  | ShowLoadingMessage
  | ShowResultMessage
  | ShowErrorMessage
  | DismissOverlayMessage
  | StartTranslateMessage;

// ============================================================
// Responses: Service Worker -> Popup
// ============================================================

export interface SuccessResponse {
  success: true;
  result: string;
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
  'HEALTH_CHECK',
  'GET_SETTINGS',
  'SAVE_SETTINGS',
  'VALIDATE_OPENAI_KEY',
  'SHOW_LOADING',
  'SHOW_RESULT',
  'SHOW_ERROR',
  'DISMISS_OVERLAY',
  'START_TRANSLATE',
]);

const SUPPORTED_LANGUAGES_SET: ReadonlySet<string> = new Set([
  'English',
  'German',
  'Romanian',
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
