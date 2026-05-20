// src/shared/validators.ts
// Input validation functions used before any Ollama request.

import type { ValidationResult } from './types.ts';
import { MAX_INPUT_LENGTH } from './constants.ts';

export { MAX_INPUT_LENGTH };

/**
 * Validates a text input before sending to Ollama.
 * Checks for empty/whitespace-only strings and length limits.
 */
export function validateTextInput(text: unknown): ValidationResult {
  if (typeof text !== 'string' || text.trim() === '') {
    return {
      valid: false,
      errorCode: 'EMPTY_INPUT',
      errorMessage: 'No text provided. Select some text first.',
    };
  }
  if (text.length > MAX_INPUT_LENGTH) {
    return {
      valid: false,
      errorCode: 'INPUT_TOO_LONG',
      errorMessage: `Text is too long (${text.length} characters, max ${MAX_INPUT_LENGTH}).`,
    };
  }
  return { valid: true };
}

/**
 * Validates a URL string for the Ollama endpoint.
 * Must be a valid http:// URL (https is not needed for localhost).
 */
export function validateEndpointUrl(url: unknown): ValidationResult {
  if (typeof url !== 'string' || url.trim() === '') {
    return {
      valid: false,
      errorCode: 'INVALID_MESSAGE',
      errorMessage: 'Endpoint URL cannot be empty.',
    };
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        errorCode: 'INVALID_MESSAGE',
        errorMessage: 'Endpoint URL must use http:// or https://',
      };
    }
    return { valid: true };
  } catch {
    return {
      valid: false,
      errorCode: 'INVALID_MESSAGE',
      errorMessage: 'Endpoint URL is not a valid URL.',
    };
  }
}

/**
 * Validates a model name string.
 * Must be a non-empty string.
 */
export function validateModelName(model: unknown): ValidationResult {
  if (typeof model !== 'string' || model.trim() === '') {
    return {
      valid: false,
      errorCode: 'INVALID_MESSAGE',
      errorMessage: 'Model name cannot be empty.',
    };
  }
  return { valid: true };
}
