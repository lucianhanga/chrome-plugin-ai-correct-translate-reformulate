// src/background/tasks.ts
// High-level task functions for grammar correction and translation.

import type { LLMResult, SupportedLanguage, OllamaCallOptions, ReformulateTone } from '../shared/types.ts';
import { callOllama } from './ollama-client.ts';
import {
  GRAMMAR_CORRECT_SYSTEM,
  buildTranslateSystemPrompt,
  buildReformulateSystemPrompt,
} from '../shared/prompts.ts';
import type { LLMClient, LLMCallOptions } from './llm-client.ts';

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

// ============================================================
// Reformulation
// ============================================================

/**
 * Reformulate text using the provider-agnostic LLMClient.
 * Temperature: 0.3 for 'keep' tone, 0.4 for all other tones.
 *
 * @param client - The active LLM client (Ollama or OpenAI)
 * @param text - The text to reformulate
 * @param tone - The tone style to apply
 * @param keepTerminology - Whether foreign words should be folded into the dominant language
 * @param options - Model name and optional temperature override
 * @returns LLMResult with reformulated text and metadata
 */
export async function reformulateText(
  client: LLMClient,
  text: string,
  tone: ReformulateTone,
  keepTerminology: boolean,
  options: LLMCallOptions,
): Promise<LLMResult> {
  const systemPrompt = buildReformulateSystemPrompt(tone, keepTerminology);
  return client.call(systemPrompt, text, options);
}
