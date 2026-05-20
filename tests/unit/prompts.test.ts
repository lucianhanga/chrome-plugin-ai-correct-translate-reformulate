// tests/unit/prompts.test.ts
import { describe, it, expect } from 'vitest';
import {
  GRAMMAR_CORRECT_SYSTEM,
  buildTranslateAutoSystemPrompt,
  buildTranslateExplicitSystemPrompt,
  buildTranslateSystemPrompt,
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

  it('handles empty input instruction', () => {
    expect(GRAMMAR_CORRECT_SYSTEM).toContain('empty');
  });
});

describe('buildTranslateAutoSystemPrompt', () => {
  it('produces a prompt that mentions the target language', () => {
    const prompt = buildTranslateAutoSystemPrompt('Romanian');
    expect(prompt).toContain('Romanian');
  });

  it('instructs to auto-detect source language', () => {
    const prompt = buildTranslateAutoSystemPrompt('German');
    expect(prompt).toContain('Detect');
  });

  it('contains the clean-output constraint', () => {
    const prompt = buildTranslateAutoSystemPrompt('English');
    expect(prompt).toContain('Output ONLY the translated text');
    expect(prompt).toContain('no explanations');
  });

  it('handles all three target languages', () => {
    expect(buildTranslateAutoSystemPrompt('English')).toContain('English');
    expect(buildTranslateAutoSystemPrompt('German')).toContain('German');
    expect(buildTranslateAutoSystemPrompt('Romanian')).toContain('Romanian');
  });
});

describe('buildTranslateExplicitSystemPrompt', () => {
  it('includes both source and target language', () => {
    const prompt = buildTranslateExplicitSystemPrompt('English', 'Romanian');
    expect(prompt).toContain('English');
    expect(prompt).toContain('Romanian');
  });

  it('contains the clean-output constraint', () => {
    const prompt = buildTranslateExplicitSystemPrompt('German', 'English');
    expect(prompt).toContain('Output ONLY the translated text');
  });

  it('does not say auto-detect when explicit source given', () => {
    const prompt = buildTranslateExplicitSystemPrompt('Romanian', 'German');
    expect(prompt).not.toContain('Detect');
  });
});

describe('buildTranslateSystemPrompt', () => {
  it('uses auto-detect prompt when sourceLanguage is null', () => {
    const prompt = buildTranslateSystemPrompt('Romanian', null);
    expect(prompt).toContain('Detect');
    expect(prompt).toContain('Romanian');
  });

  it('uses explicit prompt when sourceLanguage is provided', () => {
    const prompt = buildTranslateSystemPrompt('German', 'English');
    expect(prompt).not.toContain('Detect');
    expect(prompt).toContain('English');
    expect(prompt).toContain('German');
  });
});
