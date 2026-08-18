// tests/unit/prompts.test.ts
import { describe, it, expect } from 'vitest';
import {
  GRAMMAR_CORRECT_SYSTEM,
  buildTranslateSystemPrompt,
  buildReformulateSystemPrompt,
  buildSummarizeSystemPrompt,
} from '../../src/shared/prompts.ts';

describe('GRAMMAR_CORRECT_SYSTEM', () => {
  it('is a non-empty string', () => {
    expect(typeof GRAMMAR_CORRECT_SYSTEM).toBe('string');
    expect(GRAMMAR_CORRECT_SYSTEM.length).toBeGreaterThan(0);
  });

  it('contains the clean-output constraint', () => {
    expect(GRAMMAR_CORRECT_SYSTEM).toContain('Output ONLY the corrected text');
    expect(GRAMMAR_CORRECT_SYSTEM).toContain('no explanations');
    expect(GRAMMAR_CORRECT_SYSTEM).toContain('no quotes');
    expect(GRAMMAR_CORRECT_SYSTEM).toContain('no markdown');
  });

  it('mentions Romanian diacritics', () => {
    expect(GRAMMAR_CORRECT_SYSTEM).toContain('ă');
    expect(GRAMMAR_CORRECT_SYSTEM).toContain('ș');
    expect(GRAMMAR_CORRECT_SYSTEM).toContain('ț');
  });

  it('instructs to preserve language', () => {
    expect(GRAMMAR_CORRECT_SYSTEM).toContain('do not translate');
  });

  it('instructs to detect the input language and respond in it (no English drift)', () => {
    // Regression guard: a Romanian (or any non-English) input must be corrected
    // in its own language, not silently translated to English.
    expect(GRAMMAR_CORRECT_SYSTEM).toContain('detect the language');
    expect(GRAMMAR_CORRECT_SYSTEM).toContain('same detected language');
    expect(GRAMMAR_CORRECT_SYSTEM).toMatch(/never translate .* into english/i);
  });

  it('handles mixed-language input: correct in the dominant language', () => {
    // Regression guard: a message that is mostly one language with a minority
    // second language must be corrected in the DOMINANT language, never in the
    // minority one.
    expect(GRAMMAR_CORRECT_SYSTEM).toContain('dominant language');
    expect(GRAMMAR_CORRECT_SYSTEM).toMatch(/mix(es)? languages/i);
  });

  it('keeps foreign technical terms in their original language', () => {
    // Regression guard: English computer-science vocabulary (e.g. "best
    // practices", "code review", "pull request") must stay in English; only
    // grammar and spelling around it is corrected.
    expect(GRAMMAR_CORRECT_SYSTEM).toMatch(/technical terms/i);
    expect(GRAMMAR_CORRECT_SYSTEM).toContain('original language');
  });

  it('handles empty input instruction', () => {
    expect(GRAMMAR_CORRECT_SYSTEM).toContain('empty');
  });
});

describe('buildTranslateSystemPrompt', () => {
  it('produces a prompt that mentions the target language', () => {
    const prompt = buildTranslateSystemPrompt('Romanian');
    expect(prompt).toContain('Romanian');
  });

  it('instructs to auto-detect source language', () => {
    const prompt = buildTranslateSystemPrompt('German');
    expect(prompt).toContain('Detect');
  });

  it('contains the clean-output constraint', () => {
    const prompt = buildTranslateSystemPrompt('English');
    expect(prompt).toContain('Output ONLY the translated text');
    expect(prompt).toContain('no explanations');
  });

  it('handles all supported target languages', () => {
    expect(buildTranslateSystemPrompt('English')).toContain('English');
    expect(buildTranslateSystemPrompt('German')).toContain('German');
    expect(buildTranslateSystemPrompt('Romanian')).toContain('Romanian');
    expect(buildTranslateSystemPrompt('Spanish')).toContain('Spanish');
    expect(buildTranslateSystemPrompt('Italian')).toContain('Italian');
  });

  it('instructs no-diacritics output only for the Romanian (no diacritics) target', () => {
    expect(buildTranslateSystemPrompt('Romanian (no diacritics)')).toContain('WITHOUT diacritics');
    expect(buildTranslateSystemPrompt('Romanian')).not.toContain('WITHOUT diacritics');
    expect(buildTranslateSystemPrompt('English')).not.toContain('WITHOUT diacritics');
    expect(buildTranslateSystemPrompt('German')).not.toContain('WITHOUT diacritics');
    expect(buildTranslateSystemPrompt('Spanish')).not.toContain('WITHOUT diacritics');
  });

  it('instructs proper diacritics for the plain Romanian target', () => {
    expect(buildTranslateSystemPrompt('Romanian')).toContain('WITH proper diacritics');
    expect(buildTranslateSystemPrompt('Romanian (no diacritics)')).not.toContain('WITH proper diacritics');
  });

  it('both Romanian targets instruct translation into Romanian', () => {
    expect(buildTranslateSystemPrompt('Romanian')).toContain('Translate the text to Romanian');
    expect(buildTranslateSystemPrompt('Romanian (no diacritics)')).toContain('Translate the text to Romanian');
  });

  it('German target mirrors the source form of address (informal -> du, formal -> Sie)', () => {
    // Translating into German must not force the formal "Sie": informal source
    // text comes back with "du"; "Sie" only for clearly formal sources.
    const prompt = buildTranslateSystemPrompt('German');
    expect(prompt).toMatch(/form of address/i);
    expect(prompt).toContain('"du"');
    expect(prompt).toContain('"Sie"');
  });

  it('non-German targets carry no German form-of-address rule', () => {
    for (const lang of ['English', 'Romanian', 'Romanian (no diacritics)', 'Spanish', 'Italian'] as const) {
      expect(buildTranslateSystemPrompt(lang)).not.toMatch(/form of address/i);
    }
  });
});

// ============================================================
// buildReformulateSystemPrompt
// ============================================================

describe('buildReformulateSystemPrompt', () => {
  it('returns a non-empty string for every tone', () => {
    for (const tone of ['keep', 'professional', 'friendly', 'natural'] as const) {
      const prompt = buildReformulateSystemPrompt(tone, true);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    }
  });

  it('always includes the core reformulation constraints', () => {
    const prompt = buildReformulateSystemPrompt('keep', true);
    // Core: preserve language
    expect(prompt).toContain('preserve the original language');
    // Core: preserve meaning
    expect(prompt).toContain('preserve the original meaning');
    // Core: output only
    expect(prompt).toContain('Output ONLY the reformulated text');
  });

  it('instructs to identify the dominant input language and respond in it for every tone', () => {
    // Regression guard for the bug where Romanian text reformulated to English.
    // Every tone shares REFORMULATE_CORE, so the instruction must be present in all.
    for (const tone of ['keep', 'professional', 'friendly', 'natural'] as const) {
      const prompt = buildReformulateSystemPrompt(tone, true);
      expect(prompt).toContain('dominant language');
      expect(prompt).toContain('same dominant language');
      expect(prompt).toMatch(/never translate .* into english/i);
    }
  });

  it('explains that mixed-language input still has one dominant language', () => {
    // Regression guard: with mixed-language input the model used to pick the
    // minority ("second") language. The core must state that borrowed foreign
    // words do not change the dominant language.
    for (const tone of ['keep', 'professional', 'friendly', 'natural'] as const) {
      const prompt = buildReformulateSystemPrompt(tone, true);
      expect(prompt).toMatch(/mix(es)? languages/i);
      expect(prompt).toMatch(/minority language/i);
    }
  });

  it('locks the output language to the dominant input language for every tone (no translation)', () => {
    // Regression guard for the inverse bug: English text reformulated with the
    // "professional" tone drifted into Romanian. The language lock must be
    // present for all tones and must state that tone changes never change the
    // language.
    for (const tone of ['keep', 'professional', 'friendly', 'natural'] as const) {
      const prompt = buildReformulateSystemPrompt(tone, true);
      expect(prompt).toContain('output language is locked to the dominant language of the input');
      expect(prompt).toMatch(/NEVER means changing its language/);
      expect(prompt).toContain('overrides every tone');
    }
  });

  it('the language lock never contradicts keep-terminology (no absolute single-language demand)', () => {
    // Regression guard for the terminology-folding bug: the lock previously
    // demanded the output be written "in that exact same language and in no
    // other language", which silently overrode the keep-terminology rule and
    // made the model translate English CS terms into the dominant language.
    const prompt = buildReformulateSystemPrompt('professional', true);
    expect(prompt).not.toContain('in no other language');
  });

  it('includes a terminology exception in the lock only when keepTerminology is true', () => {
    const withKeep = buildReformulateSystemPrompt('professional', true);
    const withoutKeep = buildReformulateSystemPrompt('professional', false);
    expect(withKeep).toMatch(/technical terms.*original language/is);
    // Without keep-terminology there must be no carve-out the model could use
    // to justify leaving foreign words untranslated.
    expect(withoutKeep).not.toMatch(/The ONLY exception/);
  });

  it('enumerates every supported language in the language lock', () => {
    const prompt = buildReformulateSystemPrompt('professional', true);
    for (const lang of ['English', 'German', 'Romanian', 'Spanish', 'Italian']) {
      expect(prompt).toContain(`the output is ${lang}`);
    }
  });

  it('places the language lock after the tone block so it is the final instruction', () => {
    // The lock is only effective if the model reads it last, after the tone
    // instruction that biases language switching.
    const prompt = buildReformulateSystemPrompt('professional', true);
    const toneIdx = prompt.indexOf('professional, formal, and official');
    const lockIdx = prompt.indexOf('output language is locked to the dominant language of the input');
    expect(toneIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeGreaterThan(toneIdx);
  });

  it('keep tone prompt instructs minimal deviation from original phrasing', () => {
    const prompt = buildReformulateSystemPrompt('keep', true);
    expect(prompt).toContain('same tone and register');
    expect(prompt).toContain('Deviate as little as possible');
  });

  it('professional tone prompt instructs formal and official language', () => {
    const prompt = buildReformulateSystemPrompt('professional', true);
    expect(prompt).toContain('professional, formal, and official');
    expect(prompt).toContain('business correspondence');
  });

  it('friendly tone prompt instructs warm and approachable language', () => {
    const prompt = buildReformulateSystemPrompt('friendly', true);
    expect(prompt).toContain('warm, friendly, and approachable');
  });

  it('natural tone prompt instructs native-speaker fluency', () => {
    const prompt = buildReformulateSystemPrompt('natural', true);
    expect(prompt).toContain('native speaker');
    expect(prompt).toContain('idiomatic');
  });

  it('includes terminology-keep clause when keepTerminology is true', () => {
    const prompt = buildReformulateSystemPrompt('keep', true);
    expect(prompt).toContain('dominant language');
    expect(prompt).toContain('domain-specific term');
  });

  it('terminology-keep clause names computer-science vocabulary as keep-in-English examples', () => {
    // The user's core use case: English CS terms ("best practices", "code
    // review", "pull request") inside a non-English message must stay English.
    const prompt = buildReformulateSystemPrompt('keep', true);
    expect(prompt).toContain('best practices');
    expect(prompt).toContain('code review');
    expect(prompt).toContain('pull request');
  });

  it('mirrors the German form of address (du/Sie) for every tone, including professional', () => {
    // German T-V distinction: input using informal "du" must come back with
    // "du" even under the professional tone; "Sie" only when the input uses
    // "Sie". A professional tone changes vocabulary, never the form of address.
    for (const tone of ['keep', 'professional', 'friendly', 'natural'] as const) {
      const prompt = buildReformulateSystemPrompt(tone, true);
      expect(prompt).toMatch(/German form of address/i);
      expect(prompt).toContain('"du"');
      expect(prompt).toContain('"Sie"');
      expect(prompt).toContain("never the form of address");
    }
  });

  it('includes terminology-free clause when keepTerminology is false', () => {
    const prompt = buildReformulateSystemPrompt('keep', false);
    expect(prompt).toContain('dominant language of the text');
    // The keep-terminology specific clause should not be present.
    expect(prompt).not.toContain('domain-specific term');
  });

  it('produces different prompts for different tones', () => {
    const keep = buildReformulateSystemPrompt('keep', true);
    const professional = buildReformulateSystemPrompt('professional', true);
    const friendly = buildReformulateSystemPrompt('friendly', true);
    const natural = buildReformulateSystemPrompt('natural', true);
    const all = [keep, professional, friendly, natural];
    const unique = new Set(all);
    expect(unique.size).toBe(4);
  });

  it('produces different prompts for keepTerminology true vs false', () => {
    const withKeep = buildReformulateSystemPrompt('professional', true);
    const withoutKeep = buildReformulateSystemPrompt('professional', false);
    expect(withKeep).not.toBe(withoutKeep);
  });
});

// ============================================================
// buildSummarizeSystemPrompt
// ============================================================

describe('buildSummarizeSystemPrompt', () => {
  it('returns a non-empty string for every length', () => {
    for (const length of ['brief', 'standard', 'detailed'] as const) {
      const prompt = buildSummarizeSystemPrompt(length);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    }
  });

  it('always includes the core summarization constraints', () => {
    const prompt = buildSummarizeSystemPrompt('standard');
    expect(prompt).toContain('summarization assistant');
    expect(prompt).toContain('Output ONLY the summary');
    expect(prompt).toContain('detect the language');
  });

  it('locks the output language to the input language for every length', () => {
    // Regression guard: summarizing must never translate (mirrors reformulate).
    for (const length of ['brief', 'standard', 'detailed'] as const) {
      const prompt = buildSummarizeSystemPrompt(length);
      expect(prompt).toContain('output language is locked to the language of the input');
      expect(prompt).toMatch(/Summarizing NEVER means translating/);
    }
  });

  it('uses a length-specific instruction', () => {
    expect(buildSummarizeSystemPrompt('brief')).toContain('single concise sentence');
    expect(buildSummarizeSystemPrompt('standard')).toContain('two to four sentences');
    expect(buildSummarizeSystemPrompt('detailed')).toContain('one paragraph');
  });

  it('produces a different prompt for each length', () => {
    const all = [
      buildSummarizeSystemPrompt('brief'),
      buildSummarizeSystemPrompt('standard'),
      buildSummarizeSystemPrompt('detailed'),
    ];
    expect(new Set(all).size).toBe(3);
  });
});
