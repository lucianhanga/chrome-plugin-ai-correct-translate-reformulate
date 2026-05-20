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
// Translation Prompt
// ============================================================

/**
 * System prompt for translation. The source language is always auto-detected
 * by the model.
 */
export function buildTranslateSystemPrompt(targetLanguage: SupportedLanguage): string {
  return `You are a translation assistant.
Detect the language of the input text automatically.
Translate the text to ${targetLanguage}.
Output ONLY the translated text with no explanations, no quotes, no markdown.
If the input is empty, output nothing.`;
}
