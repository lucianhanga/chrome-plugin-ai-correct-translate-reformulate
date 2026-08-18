// tests/e2e/german-address-form.test.ts
// End-to-end regression tests for German form-of-address (T-V) mirroring.
//
// Reported problem: reformulating a German message that uses the informal
// "du" -- or translating an informal message into German -- came back with
// the formal "Sie", especially under the professional tone. The fix adds a
// German form-of-address rule to the reformulate prompts (all tones) and to
// the German translation prompt: mirror the input -- "du" stays "du", "Sie"
// only when the input uses "Sie".
//
// Like language-preservation.test.ts, these tests drive a REAL model call
// through the popup quick-action path and assert on address-form markers
// instead of exact strings.

import { test, expect } from './fixtures/extension-fixture';
import type { Page } from '@playwright/test';

// Informal markers: the pronoun "du" and its forms, plus du-conjugated verbs.
const DU_MARKERS = /\b(du|dich|dir|dein\w*|kannst|musst|sollst|hast|bist|gibst|nimmst|schickst)\b/i;
// Formal markers: capitalized "Sie" / "Ihnen" (formal address is always
// capitalized in German).
const SIE_MARKERS = /\b(Sie|Ihnen)\b/;

async function readResult(popup: Page): Promise<string> {
  const resultContainer = popup.locator('[data-testid="result-text"]');
  await resultContainer.waitFor({ state: 'visible', timeout: 120_000 });
  const text = (await resultContainer.textContent())?.trim() ?? '';
  expect(text.length).toBeGreaterThan(0);
  return text;
}

test.describe('German form of address: Reformulate mirrors du/Sie', () => {
  test('reformulate (professional tone) of a German "du" message stays with "du"', async ({
    openPopup,
  }) => {
    const popup = await openPopup();

    // Clearly informal German: addresses the reader with "du" throughout.
    const input =
      'Hallo, kannst du dir das bitte morgen anschauen? Es waere gut, wenn du mir bis Freitag eine kurze Rueckmeldung gibst.';
    await popup.locator('textarea').fill(input);

    const toneSelect = popup
      .locator('select')
      .filter({ has: popup.locator('option[value="professional"]') });
    await toneSelect.selectOption('professional');

    await popup.getByRole('button', { name: /^Reformulate$/i }).click();

    const result = await readResult(popup);

    expect(
      DU_MARKERS.test(result),
      `Expected informal "du" forms but got: ${result}`,
    ).toBe(true);
    expect(
      SIE_MARKERS.test(result),
      `Professional tone switched "du" to formal "Sie": ${result}`,
    ).toBe(false);
  });

  test('reformulate (professional tone) of a German "Sie" message stays with "Sie"', async ({
    openPopup,
  }) => {
    const popup = await openPopup();

    const input =
      'Sehr geehrte Damen und Herren, koennen Sie mir bitte den aktuellen Stand des Projekts mitteilen? Ich bitte Sie um eine Rueckmeldung bis Freitag.';
    await popup.locator('textarea').fill(input);

    const toneSelect = popup
      .locator('select')
      .filter({ has: popup.locator('option[value="professional"]') });
    await toneSelect.selectOption('professional');

    await popup.getByRole('button', { name: /^Reformulate$/i }).click();

    const result = await readResult(popup);

    expect(
      SIE_MARKERS.test(result),
      `Expected formal "Sie" forms but got: ${result}`,
    ).toBe(true);
  });
});

test.describe('German form of address: Translate mirrors register', () => {
  test('informal English translated to German uses "du", not "Sie"', async ({ openPopup }) => {
    const popup = await openPopup();

    const input =
      "Hey, can you take a look at this tomorrow? It'd be great if you could send me your feedback by Friday.";
    await popup.locator('textarea').fill(input);

    // Pick German as the translate target.
    const languageSelect = popup
      .locator('select')
      .filter({ has: popup.locator('option[value="German"]') });
    await languageSelect.selectOption('German');

    await popup.getByRole('button', { name: /^Translate$/i }).click();

    const result = await readResult(popup);

    expect(
      DU_MARKERS.test(result),
      `Expected informal "du" forms but got: ${result}`,
    ).toBe(true);
    expect(
      SIE_MARKERS.test(result),
      `Informal source was translated with formal "Sie": ${result}`,
    ).toBe(false);
  });
});
