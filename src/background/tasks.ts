// src/background/tasks.ts
// High-level task functions for grammar correction and translation.

import type { LLMResult, SupportedLanguage, OllamaCallOptions } from '../shared/types.ts';
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
 * @returns LLMResult with corrected text and metadata
 */
export async function correctGrammar(
  text: string,
  ollamaOptions: OllamaCallOptions = {},
): Promise<LLMResult> {
  return callOllama(GRAMMAR_CORRECT_SYSTEM, text, {
    temperature: 0.2,
    ...ollamaOptions,
  });
}

// ============================================================
// Translation
// ============================================================

/**
 * Translate text to targetLanguage. The source language is always auto-detected
 * by the model.
 *
 * @param text - The text to translate
 * @param targetLanguage - Target language ('English', 'German', or 'Romanian')
 * @param ollamaOptions - Optional overrides for model, endpoint, timeout
 * @returns LLMResult with translated text and metadata
 */
export async function translateText(
  text: string,
  targetLanguage: SupportedLanguage,
  ollamaOptions: OllamaCallOptions = {},
): Promise<LLMResult> {
  const systemPrompt = buildTranslateSystemPrompt(targetLanguage);
  return callOllama(systemPrompt, text, {
    temperature: 0.2,
    ...ollamaOptions,
  });
}
