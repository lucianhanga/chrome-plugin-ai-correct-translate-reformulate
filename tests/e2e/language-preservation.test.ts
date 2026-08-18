// tests/e2e/language-preservation.test.ts
// End-to-end regression tests for the "output came back in English" bug.
//
// Reported problem: reformulating Romanian text (e.g. with the "Professional"
// tone) returned the result in English. The same risk applies to grammar
// correction. The fix strengthened GRAMMAR_CORRECT_SYSTEM and REFORMULATE_CORE
// (src/shared/prompts.ts) to make language detection an explicit first step:
// the model must detect the input language and respond in THAT language, never
// translating to English. Translation is intentionally exempt -- changing the
// language is its whole purpose.
//
// These tests drive a REAL model call through the popup quick-action path,
// because the popup result panel ([data-testid="result-text"]) is plain DOM and
// can be read directly -- unlike the in-page overlay, which uses a closed Shadow
// DOM. The active provider (Ollama by default, OpenAI fallback) is chosen by
// global-setup; language preservation must hold for whichever one runs.
//
// Timeouts: 120 s per result, matching the other real-model popup tests, to
// absorb warm inference latency.

import { test, expect } from './fixtures/extension-fixture';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Language heuristics
//
// We cannot assert an exact string (model output varies), so we assert the
// language of the result instead:
//   - It MUST look Romanian: contains Romanian diacritics OR distinctive
//     Romanian function words.
//   - It MUST NOT look English: contains none of a set of very common English
//     words that essentially never appear in Romanian prose.
// This is exactly the signal the bug produced: an English sentence full of
// "the/and/with/..." and free of Romanian diacritics.
// ---------------------------------------------------------------------------

const ROMANIAN_DIACRITICS = /[ăâîșțĂÂÎȘȚ]/;
const ROMANIAN_WORDS =
  /\b(și|să|este|sunt|pentru|aș|tău|mâine|nevoie|despre|vreau|discutăm|fiecare|interesante)\b/i;
const ENGLISH_WORDS = /\b(the|and|with|your|would|please|hello|need|every|new)\b/i;
// English computer-science terms that must survive reformulation unchanged
// when "Keep terminology" is on (the default).
const ENGLISH_CS_TERMS =
  /\b(code review|pull request|best practices|unit tests|merge|deadline|deployment|feature branch)\b/i;

function looksRomanian(text: string): boolean {
  return ROMANIAN_DIACRITICS.test(text) || ROMANIAN_WORDS.test(text);
}

function looksEnglish(text: string): boolean {
  return ENGLISH_WORDS.test(text);
}

async function readResult(popup: Page): Promise<string> {
  const resultContainer = popup.locator('[data-testid="result-text"]');
  await resultContainer.waitFor({ state: 'visible', timeout: 120_000 });
  const text = (await resultContainer.textContent())?.trim() ?? '';
  expect(text.length).toBeGreaterThan(0);
  return text;
}

// ---------------------------------------------------------------------------
// Reformulate -- the reported failing case
// ---------------------------------------------------------------------------

test.describe('Language preservation: Reformulate keeps Romanian', () => {
  test('reformulate (professional tone) of Romanian text returns Romanian, not English', async ({
    openPopup,
  }) => {
    const popup = await openPopup();

    // A clearly Romanian, slightly informal sentence so the professional tone
    // has real work to do (the original failing scenario).
    const input =
      'Salut, vreau să discutăm despre proiect mâine, e cam urgent și aș avea nevoie de ajutorul tău.';
    await popup.locator('textarea').fill(input);

    // Select the professional tone (the reported failing tone).
    const toneSelect = popup
      .locator('select')
      .filter({ has: popup.locator('option[value="professional"]') });
    await toneSelect.selectOption('professional');

    await popup.getByRole('button', { name: /^Reformulate$/i }).click();

    const result = await readResult(popup);

    expect(
      looksRomanian(result),
      `Expected a Romanian reformulation but got: ${result}`,
    ).toBe(true);
    expect(
      looksEnglish(result),
      `Reformulation drifted to English: ${result}`,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reformulate -- the inverse failing case (English drifting to Romanian)
//
// Reported follow-up bug: English text reformulated with the "professional"
// tone came back translated into Romanian. The language lock must hold in both
// directions, so the professional tone must keep English text in English.
// ---------------------------------------------------------------------------

test.describe('Language preservation: Reformulate keeps English', () => {
  test('reformulate (professional tone) of English text returns English, not Romanian', async ({
    openPopup,
  }) => {
    const popup = await openPopup();

    // A clearly English, informal sentence so the professional tone has real
    // work to do without any reason to switch languages.
    const input =
      "Hey, I wanna chat about the project tomorrow, it's kinda urgent and I'd need your help with it.";
    await popup.locator('textarea').fill(input);

    const toneSelect = popup
      .locator('select')
      .filter({ has: popup.locator('option[value="professional"]') });
    await toneSelect.selectOption('professional');

    await popup.getByRole('button', { name: /^Reformulate$/i }).click();

    const result = await readResult(popup);

    expect(
      looksEnglish(result),
      `Expected an English reformulation but got: ${result}`,
    ).toBe(true);
    expect(
      looksRomanian(result),
      `Reformulation drifted to Romanian: ${result}`,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mixed-language input -- dominant language wins, terminology stays English
//
// Reported follow-up bugs (v1.13.x):
//   1. Adjusting the tone of a mixed-language message sometimes translated the
//      whole message -- the output must stay in the DOMINANT language.
//   2. English computer-science terminology ("best practices", "code review",
//      "pull request", ...) inside a non-English message must stay in English;
//      only the surrounding prose is reformulated in the dominant language.
// Root cause: the reformulate language lock demanded output "in that exact
// same language and in no other language", which overrode the keep-terminology
// rule; and "the language of the input" was undefined for mixed-language text.
// ---------------------------------------------------------------------------

test.describe('Language preservation: mixed-language reformulate keeps dominant language and English terms', () => {
  test('reformulate (keep tone) of Romanian text with English CS terms returns Romanian with terms intact', async ({
    openPopup,
  }) => {
    const popup = await openPopup();

    // Romanian-dominant message full of English CS vocabulary.
    const input =
      'Salut, am lucrat azi la pull request-ul pentru feature-ul de caching. Best practices spun sa adaugam unit tests inainte de merge, dar deadline-ul e strans. Poti sa faci un code review maine dimineata?';
    await popup.locator('textarea').fill(input);

    await popup.getByRole('button', { name: /^Reformulate$/i }).click();

    const result = await readResult(popup);

    // The reformulation must stay Romanian...
    expect(
      looksRomanian(result),
      `Expected a Romanian reformulation but got: ${result}`,
    ).toBe(true);
    // ...and at least one English CS term must survive untranslated.
    expect(
      ENGLISH_CS_TERMS.test(result),
      `Expected English CS terminology to be kept, but it was folded away: ${result}`,
    ).toBe(true);
  });

  test('reformulate (professional tone) of Romanian text with an English sentence stays Romanian', async ({
    openPopup,
  }) => {
    const popup = await openPopup();

    // Romanian-dominant with a full English sentence in the middle: the
    // minority ("second") language must NOT become the output language.
    const input =
      'Salut, maine avem deadline pentru sprint si mai trebuie sa inchidem ticketele. The feature branch needs a rebase and a careful code review before we can merge the pull request into main. Te rog sa te uiti si pe unit tests cand ai timp.';
    await popup.locator('textarea').fill(input);

    const toneSelect = popup
      .locator('select')
      .filter({ has: popup.locator('option[value="professional"]') });
    await toneSelect.selectOption('professional');

    await popup.getByRole('button', { name: /^Reformulate$/i }).click();

    const result = await readResult(popup);

    expect(
      looksRomanian(result),
      `Expected the dominant language (Romanian) but got: ${result}`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Grammar correction -- same language-preservation guarantee
// ---------------------------------------------------------------------------

test.describe('Language preservation: Correct keeps Romanian', () => {
  test('grammar correction of Romanian text (no diacritics) returns Romanian, not English', async ({
    openPopup,
  }) => {
    const popup = await openPopup();

    // Romanian written without diacritics. A correct result restores diacritics
    // and stays Romanian; the bug would translate it to English.
    const input = 'imi place sa lucrez la proiecte noi si interesante in fiecare zi';
    await popup.locator('textarea').fill(input);

    await popup.getByRole('button', { name: /^Correct$/i }).click();

    const result = await readResult(popup);

    expect(
      looksRomanian(result),
      `Expected a Romanian correction but got: ${result}`,
    ).toBe(true);
    expect(
      looksEnglish(result),
      `Correction drifted to English: ${result}`,
    ).toBe(false);
  });
});
