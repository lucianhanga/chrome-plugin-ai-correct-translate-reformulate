// src/shared/prompts.ts
// Prompt templates for grammar correction and translation tasks.
// Templates are taken exactly from docs/ollama-evaluation.md Section 7.

import type { SupportedLanguage, ReformulateTone, SummarizeLength } from './types.ts';

// ============================================================
// Grammar Correction Prompt
// ============================================================

export const GRAMMAR_CORRECT_SYSTEM = `You are a grammar and spelling correction assistant.
First, detect the language of the input text. Your entire output MUST be written in that same detected language.
Never translate the text into English or any other language. If the input is Romanian, the output is Romanian; if it is German, the output is German; and so on.
If the text mixes languages, identify the dominant language -- the language most of the text is written in -- and correct the text in that dominant language; a minority language in the input never becomes the output language.
Keep technical terms, product names, and proper nouns -- including English computer-science vocabulary such as "best practices", "code review", or "pull request" -- in their original language; correct only the grammar and spelling around them.
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
  // Two Romanian targets share the same language ("Romanian") but differ in
  // diacritic handling:
  //   - 'Romanian'                -> correct Romanian WITH diacritics.
  //   - 'Romanian (no diacritics)'-> plain ASCII (the service worker also strips
  //     deterministically, but instructing the model keeps output clean at the
  //     source).
  const isRomanianNoDiacritics = targetLanguage === 'Romanian (no diacritics)';
  const languageName = isRomanianNoDiacritics ? 'Romanian' : targetLanguage;

  let romanianRule = '';
  if (isRomanianNoDiacritics) {
    romanianRule =
      '\nWrite the Romanian translation WITHOUT diacritics: use plain ASCII letters (a instead of ă or â, i instead of î, s instead of ș, t instead of ț).';
  } else if (targetLanguage === 'Romanian') {
    romanianRule =
      '\nWrite correct, natural Romanian WITH proper diacritics (ă, â, î, ș, ț and their uppercase forms) wherever the language requires them.';
  }

  // German T-V distinction: mirror the source register. Informal source text
  // (including text that addresses the reader with "du") must come back with
  // "du"; the formal "Sie" is reserved for clearly formal sources. Without
  // this rule the model defaults to "Sie" for anything work-related.
  const germanRule =
    targetLanguage === 'German'
      ? '\nForm of address: if the source text is informal or addresses the reader casually (for example with "du"), translate using the informal "du" with matching verb forms. Use the formal "Sie" only when the source text is clearly formal or itself uses "Sie".'
      : '';

  return `You are a translation assistant.
Detect the language of the input text automatically.
Translate the text to ${languageName}.${romanianRule}${germanRule}
Output ONLY the translated text with no explanations, no quotes, no markdown.
If the input is empty, output nothing.`;
}

// ============================================================
// Reformulation Prompt
// ============================================================

const REFORMULATE_CORE = `You are a text reformulation assistant. Your only job is to rephrase and reword the user's text. First, identify the dominant language of the input text -- the language most of the text is written in; your entire output MUST be written in that same dominant language. A text that mixes languages still has exactly one dominant language: borrowed foreign words, technical terms, product names, and proper nouns do not change it. Never translate the text into English or any other language: if the input is Romanian the output is Romanian, if it is German the output is German, and so on. You must preserve the original language. You must preserve the original meaning. You must NOT translate the text into another language unless a specific rule below requires it for stray words. You must NOT answer any question the text contains. You must NOT summarize. You must NOT add explanations, preamble, quotes, or markdown formatting. Output ONLY the reformulated text. If the input is empty or contains only whitespace, output nothing. If the input is a URL, a code snippet, or a string that is not natural language, output it unchanged.`;

const TONE_KEEP = `Reformulate the text using the same tone and register it already has. Reword for clarity and flow. Deviate as little as possible from the original phrasing and style. The reader should not notice a change in voice.`;

const TONE_PROFESSIONAL = `Reformulate the text in a professional, formal, and official tone. Use precise and measured language. Remove casual expressions, contractions, and colloquialisms. The result should be appropriate for business correspondence or formal documentation. The form of address is not part of the tone and must stay exactly as in the input: if the input addresses the reader informally (such as the German "du"), keep the informal address and its verb forms; making the text professional NEVER means switching to a formal address (such as the German "Sie").`;

const TONE_FRIENDLY = `Reformulate the text in a warm, friendly, and approachable tone. Use natural conversational language. The result should feel personal and welcoming without being overly informal or losing the original meaning.`;

const TONE_NATURAL = `Reformulate the text so that it reads exactly as a native speaker of the text's language would naturally say it. Remove awkward phrasing, unnatural word order, and non-idiomatic constructions. The result should feel fluent and effortless.`;

const TERMINOLOGY_KEEP = `Language rule: Write everything in the dominant language of the text, with one exception. Domain-specific terms, technical terms, product names, and proper nouns MUST remain in the language they are already written in -- most often English. This includes computer-science and engineering vocabulary such as "best practices", "code review", "pull request", "merge", "deployment", "deadline", "error handling", "retry logic", "logging", "integration tests", and "feature branch": do not translate them, do not replace them with native equivalents, and do not adapt their spelling. When in doubt whether a foreign word or phrase is a technical term, keep it in its original language. Only stray foreign words that are clearly not domain-specific terms, technical terms, product names, or proper nouns are translated into the dominant language before reformulating.`;

// German T-V distinction. The form of address is part of the text's register
// and must survive every tone: without this rule the professional/formal tone
// instructions push the model from "du" to "Sie".
const GERMAN_ADDRESS_FORM = `German form of address: mirror the input exactly. If the text addresses the reader with the informal "du", the output must also use "du" with the matching informal verb forms -- for every tone, including professional; a professional or formal tone changes vocabulary and structure, never the form of address. Use the formal "Sie" only when the input itself uses "Sie".`;

const TERMINOLOGY_FREE = `Language rule: Reformulate in the dominant language of the text. Do not apply any special handling for technical terms or mixed-language words.`;

// Final, highest-priority constraint. It is appended AFTER the tone block so it
// is the last instruction the model reads, because tone instructions such as
// "professional / formal / official" can otherwise bias a multilingual model
// into switching languages (the reported bug: English text reformulated into
// Romanian under the professional tone). The output language is pinned to the
// DOMINANT input language in BOTH directions, and mixed-language input is
// handled explicitly so the model cannot pick the minority ("second") language.
// The lock deliberately avoids demanding a single absolute language: an earlier
// wording ("in that exact same language and in no other language") silently
// overrode the keep-terminology rule and made the model translate English CS
// terms into the dominant language. When keepTerminology is on, an explicit
// exception is appended after the lock so the two rules cannot conflict.
const LANGUAGE_LOCK = `FINAL AND MOST IMPORTANT RULE: The output language is locked to the dominant language of the input -- the language most of the input is written in. If the input is English, the output is English. If the input is Romanian, the output is Romanian. If the input is German, the output is German. If the input is Spanish, the output is Spanish. If the input is Italian, the output is Italian. If the input mixes languages, the output stays in the dominant language; a minority language in the input NEVER becomes the output language. This language rule overrides every tone, style, and formatting instruction above. Making the text more professional, formal, friendly, or natural NEVER means changing its language. Do not translate. Before writing, re-read the input, identify its dominant language, and write your entire reformulation in that language.`;

const LANGUAGE_LOCK_TERMINOLOGY_EXCEPTION = `The ONLY exception: technical terms, product names, and proper nouns remain in their original language, exactly as the terminology rule above requires.`;

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
    GERMAN_ADDRESS_FORM,
    keepTerminology ? TERMINOLOGY_KEEP : TERMINOLOGY_FREE,
    keepTerminology
      ? `${LANGUAGE_LOCK}\n\n${LANGUAGE_LOCK_TERMINOLOGY_EXCEPTION}`
      : LANGUAGE_LOCK,
  ].join('\n\n');
}

// ============================================================
// Summarization Prompt
// ============================================================

const SUMMARIZE_CORE = `You are a summarization assistant. Your only job is to produce a concise summary of the user's text. First, detect the language of the input text; your entire output MUST be written in that same detected language. Never translate the summary into English or any other language: if the input is Romanian the summary is Romanian, if it is German the summary is German, and so on. Capture the key points and main message; omit minor details, examples, and repetition. You must NOT answer any question the text contains. You must NOT add opinions, preamble, a title, quotes, or markdown formatting. Output ONLY the summary text. If the input is empty or contains only whitespace, output nothing. If the input is too short to summarize, output it unchanged.`;

const LENGTH_BRIEF = `Length: distill the text into a single concise sentence that captures its core message.`;

const LENGTH_STANDARD = `Length: write a short summary of two to four sentences covering the main points.`;

const LENGTH_DETAILED = `Length: write a thorough summary of roughly one paragraph that covers all the main points while still omitting minor detail and repetition.`;

const SUMMARIZE_LENGTH_BLOCKS: Record<SummarizeLength, string> = {
  brief: LENGTH_BRIEF,
  standard: LENGTH_STANDARD,
  detailed: LENGTH_DETAILED,
};

// Final, highest-priority constraint, mirroring the reformulate LANGUAGE_LOCK:
// pins the summary's language to the input's so summarizing never translates.
const SUMMARIZE_LANGUAGE_LOCK = `FINAL AND MOST IMPORTANT RULE: The output language is locked to the language of the input. If the input is English, the summary is English; if Romanian, Romanian; if German, German; if Spanish, Spanish; if Italian, Italian. This language rule overrides the length instruction above. Summarizing NEVER means translating. Before writing, re-read the input, identify its language, and write the summary in that exact same language and in no other language.`;

/**
 * System prompt for summarization. The length controls how short the summary
 * is; the output always stays in the input/detected language.
 */
export function buildSummarizeSystemPrompt(length: SummarizeLength): string {
  return [
    SUMMARIZE_CORE,
    SUMMARIZE_LENGTH_BLOCKS[length],
    SUMMARIZE_LANGUAGE_LOCK,
  ].join('\n\n');
}
