// src/background/tasks.ts
// High-level task functions for grammar correction and translation.

import type { SupportedLanguage, OllamaCallOptions } from '../shared/types.ts';
import { callOllama } from './ollama-client.ts';
import {
  GRAMMAR_CORRECT_SYSTEM,
  buildTranslateSystemPrompt,
} from '../shared/prompts.ts';

// ============================================================
// Grammar Correction
// ============================================================

/**
 * Correct grammar and spelling in the given text using Ollama.
 *
 * @param text - The text to correct
 * @param ollamaOptions - Optional overrides for model, endpoint, timeout
 * @returns The corrected text (unchanged if already correct)
 */
export async function correctGrammar(
  text: string,
  ollamaOptions: OllamaCallOptions = {},
): Promise<string> {
  return callOllama(GRAMMAR_CORRECT_SYSTEM, text, {
    temperature: 0.2,
    ...ollamaOptions,
  });
}

// ============================================================
// Translation
// ============================================================

/**
 * Translate text to targetLanguage. If sourceLang is null, auto-detect source.
 *
 * @param text - The text to translate
 * @param targetLanguage - Target language ('English', 'German', or 'Romanian')
 * @param sourceLanguage - Source language, or null to auto-detect
 * @param ollamaOptions - Optional overrides for model, endpoint, timeout
 * @returns The translated text
 */
export async function translateText(
  text: string,
  targetLanguage: SupportedLanguage,
  sourceLanguage: SupportedLanguage | null = null,
  ollamaOptions: OllamaCallOptions = {},
): Promise<string> {
  const systemPrompt = buildTranslateSystemPrompt(targetLanguage, sourceLanguage);
  return callOllama(systemPrompt, text, {
    temperature: 0.2,
    ...ollamaOptions,
  });
}
