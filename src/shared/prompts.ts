// src/shared/prompts.ts
// Prompt templates for grammar correction and translation tasks.
// Templates are taken exactly from docs/ollama-evaluation.md Section 7.

import type { SupportedLanguage, ReformulateTone } from './types.ts';

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

// ============================================================
// Reformulation Prompt
// ============================================================

const REFORMULATE_CORE = `You are a text reformulation assistant. Your only job is to rephrase and reword the user's text. You must preserve the original language. You must preserve the original meaning. You must NOT translate the text into another language unless a specific rule below requires it for stray words. You must NOT answer any question the text contains. You must NOT summarize. You must NOT add explanations, preamble, quotes, or markdown formatting. Output ONLY the reformulated text. If the input is empty or contains only whitespace, output nothing. If the input is a URL, a code snippet, or a string that is not natural language, output it unchanged.`;

const TONE_KEEP = `Reformulate the text using the same tone and register it already has. Reword for clarity and flow. Deviate as little as possible from the original phrasing and style. The reader should not notice a change in voice.`;

const TONE_PROFESSIONAL = `Reformulate the text in a professional, formal, and official tone. Use precise and measured language. Remove casual expressions, contractions, and colloquialisms. The result should be appropriate for business correspondence or formal documentation.`;

const TONE_FRIENDLY = `Reformulate the text in a warm, friendly, and approachable tone. Use natural conversational language. The result should feel personal and welcoming without being overly informal or losing the original meaning.`;

const TONE_NATURAL = `Reformulate the text so that it reads exactly as a native speaker of the text's language would naturally say it. Remove awkward phrasing, unnatural word order, and non-idiomatic constructions. The result should feel fluent and effortless.`;

const TERMINOLOGY_KEEP = `Language rule: Identify the dominant language of the text. Any word or phrase that belongs to a DIFFERENT language AND is not a domain-specific term, a technical term, a product name, or a proper noun must be translated into the dominant language before reformulating. Domain-specific terms, technical terms, product names, and proper nouns must remain in whatever language they are currently written in, even if that differs from the dominant language.`;

const TERMINOLOGY_FREE = `Language rule: Reformulate in the dominant language of the text. Do not apply any special handling for technical terms or mixed-language words.`;

const TONE_BLOCKS: Record<ReformulateTone, string> = {
  keep: TONE_KEEP,
  professional: TONE_PROFESSIONAL,
  friendly: TONE_FRIENDLY,
  natural: TONE_NATURAL,
};

/**
 * System prompt for reformulation. The tone determines the style instruction
 * and keepTerminology controls whether foreign words are folded into the
 * dominant language.
 */
export function buildReformulateSystemPrompt(
  tone: ReformulateTone,
  keepTerminology: boolean,
): string {
  return [
    REFORMULATE_CORE,
    TONE_BLOCKS[tone],
    keepTerminology ? TERMINOLOGY_KEEP : TERMINOLOGY_FREE,
  ].join('\n\n');
}
