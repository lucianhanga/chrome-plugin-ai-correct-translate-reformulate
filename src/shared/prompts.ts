// src/shared/prompts.ts
// Prompt templates for grammar correction and translation tasks.
// Templates are taken exactly from docs/ollama-evaluation.md Section 7.

import type { SupportedLanguage } from './types.ts';

// ============================================================
// Grammar Correction Prompt
// ============================================================

export const GRAMMAR_CORRECT_SYSTEM = `You are a grammar and spelling correction assistant.
Correct grammar and spelling errors in the given text.
Preserve the original meaning exactly.
Preserve the original language -- do not translate.
If the text uses Romanian, restore missing diacritics (ă, â, î, ș, ț and their uppercase forms).
Output ONLY the corrected text with no explanations, no quotes, no markdown.
If the text is already correct, output it unchanged.
If the input is empty, output nothing.`;

// ============================================================
// Translation Prompts
// ============================================================

/**
 * System prompt for translation with auto-detect source language.
 */
export function buildTranslateAutoSystemPrompt(targetLanguage: SupportedLanguage): string {
  return `You are a translation assistant.
Detect the language of the input text automatically.
Translate the text to ${targetLanguage}.
Output ONLY the translated text with no explanations, no quotes, no markdown.
If the input is empty, output nothing.`;
}

/**
 * System prompt for translation with explicit source language.
 */
export function buildTranslateExplicitSystemPrompt(
  sourceLanguage: SupportedLanguage,
  targetLanguage: SupportedLanguage,
): string {
  return `You are a translation assistant.
Translate the given text from ${sourceLanguage} to ${targetLanguage}.
Output ONLY the translated text with no explanations, no quotes, no markdown.
If the input is empty, output nothing.`;
}

/**
 * Selects the correct translation system prompt based on whether a source
 * language is provided (explicit) or should be auto-detected (null).
 */
export function buildTranslateSystemPrompt(
  targetLanguage: SupportedLanguage,
  sourceLanguage: SupportedLanguage | null,
): string {
  if (sourceLanguage !== null) {
    return buildTranslateExplicitSystemPrompt(sourceLanguage, targetLanguage);
  }
  return buildTranslateAutoSystemPrompt(targetLanguage);
}

// ============================================================
// Language Detection Prompt
// ============================================================

/**
 * System prompt for detecting the source language of a piece of text.
 * The model is constrained to the three supported languages.
 */
export const DETECT_LANGUAGE_SYSTEM = `You are a language detection assistant.
Identify the primary language of the given text.
The only valid answers are: English, German, Romanian.
If the text is in another language, choose the closest of those three.
Output ONLY one word -- English, German, or Romanian -- with no explanation, punctuation, quotes, or markdown.`;
