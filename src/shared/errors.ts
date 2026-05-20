// src/shared/errors.ts
// Error codes, user-facing messages, and color mappings.

import type { ErrorCode } from './types.ts';
import { COLORS } from './constants.ts';

export type { ErrorCode };

// ============================================================
// User-Facing Error Messages
// ============================================================

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  OLLAMA_UNREACHABLE:
    'Cannot reach Ollama. Make sure it is running: ollama serve',
  MODEL_NOT_FOUND:
    'Model not found. Pull it first: ollama pull qwen3:14b',
  REQUEST_TIMEOUT:
    'Request timed out. The model may be loading. Try again, or switch to a faster model (qwen3:14b) in settings.',
  EMPTY_INPUT:
    'No text provided. Select some text first.',
  INPUT_TOO_LONG:
    'Text is too long (max 10,000 characters). Select a shorter passage.',
  UNEXPECTED_RESPONSE:
    'Received an unexpected response from the language model. Check that the selected provider is working correctly.',
  UNKNOWN_ERROR:
    'An unexpected error occurred. Check the browser console for details.',
  INVALID_MESSAGE:
    'Invalid message received. This is a bug -- please report it.',
  OPENAI_AUTH_FAILED:
    'OpenAI rejected the API key. Open Settings and check or re-enter your key.',
  OPENAI_RATE_LIMITED:
    'OpenAI rate limit reached. Wait a few seconds and try again.',
  OPENAI_QUOTA_EXCEEDED:
    'Your OpenAI account is out of quota or has a billing issue. Check your OpenAI account, or switch back to local Ollama in Settings.',
  OPENAI_UNREACHABLE:
    'Cannot reach OpenAI. Check your internet connection, or switch to local Ollama in Settings.',
};

// ============================================================
// Error Color Mapping
// ============================================================

export const ERROR_COLORS: Record<ErrorCode, string> = {
  OLLAMA_UNREACHABLE: COLORS.FAILURE,
  MODEL_NOT_FOUND: COLORS.FAILURE,
  REQUEST_TIMEOUT: COLORS.WARNING,
  EMPTY_INPUT: COLORS.WARNING,
  INPUT_TOO_LONG: COLORS.WARNING,
  UNEXPECTED_RESPONSE: COLORS.FAILURE,
  UNKNOWN_ERROR: COLORS.FAILURE,
  INVALID_MESSAGE: COLORS.FAILURE,
  OPENAI_AUTH_FAILED: COLORS.FAILURE,
  OPENAI_RATE_LIMITED: COLORS.WARNING,
  OPENAI_QUOTA_EXCEEDED: COLORS.FAILURE,
  OPENAI_UNREACHABLE: COLORS.FAILURE,
};

// ============================================================
// Error Classification Helpers
// ============================================================

/**
 * Structural error type carrying an ErrorCode directly.
 * Used by the OpenAI client to avoid string-matching on error messages.
 */
export class LLMError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
  }
}

/**
 * Maps a raw Error to an ErrorCode based on structural type or message content.
 * LLMError is classified structurally (no string matching needed).
 * Plain Error messages are string-matched for backward compat with Ollama errors.
 */
export function classifyError(error: unknown): ErrorCode {
  if (!(error instanceof Error)) return 'UNKNOWN_ERROR';

  // Structural classification: LLMError carries its code directly.
  if (error instanceof LLMError) {
    return error.code;
  }

  const msg = error.message.toLowerCase();

  if (msg.includes('timed out') || error.name === 'AbortError') {
    return 'REQUEST_TIMEOUT';
  }
  if (msg.includes('model not found') || msg.includes('404')) {
    return 'MODEL_NOT_FOUND';
  }
  if (
    msg.includes('unreachable') ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('load failed')
  ) {
    return 'OLLAMA_UNREACHABLE';
  }
  if (msg.includes('unexpected') || msg.includes('response shape')) {
    return 'UNEXPECTED_RESPONSE';
  }

  return 'UNKNOWN_ERROR';
}

/**
 * Returns the user-facing message for an error code.
 */
export function getUserMessage(errorCode: ErrorCode): string {
  return ERROR_MESSAGES[errorCode];
}

/**
 * Returns the display color for an error code.
 */
export function getErrorColor(errorCode: ErrorCode): string {
  return ERROR_COLORS[errorCode];
}
