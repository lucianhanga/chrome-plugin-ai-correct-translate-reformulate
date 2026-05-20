// tests/unit/prompts.test.ts
import { describe, it, expect } from 'vitest';
import {
  GRAMMAR_CORRECT_SYSTEM,
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

  it('handles all three target languages', () => {
    expect(buildTranslateSystemPrompt('English')).toContain('English');
    expect(buildTranslateSystemPrompt('German')).toContain('German');
    expect(buildTranslateSystemPrompt('Romanian')).toContain('Romanian');
  });
});
