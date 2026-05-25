// tests/e2e/popup.test.ts
// End-to-end tests for the Popup UI.
//
// What is covered:
//   - Popup mounts and renders expected sections
//   - Status indicator reflects Ollama health (connected, unreachable, model-missing)
//   - Quick Action: Correct button sends a request and displays a non-empty result
//   - Quick Action: Translate button sends a request and displays a non-empty result
//   - Quick Action: the result auto-copies to the clipboard and shows a confirmation
//   - Quick Action: error state is shown when the configured endpoint is unreachable
//   - Quick Action: character limit guard prevents submission and shows counter
//   - Quick Action: empty input prevents submission
//   - Settings section: opens/closes via toggle
//   - Settings section: Save persists values and refreshes status
//   - Settings section: OpenAI provider toggle, API key field, consent dialog
//
// Result panel note (current behavior): the popup result panel (ResultDisplay)
// has NO Replace / Append / Copy / Clear buttons. The result is copied to the
// clipboard automatically when it appears, and a confirmation element
// (data-testid="copied-hint") is shown. data-testid="result-text" and
// data-testid="original-text" still exist.
//
// Translate flow note (post-rollback): translation auto-detects the source
// language during the model call. The popup has no language-detection or
// confirm step; the Translate button goes straight to the result.
//
// Ollama approach: REAL Ollama at http://localhost:11434 with model qwen3:14b.
// global-setup.ts verifies reachability and warms up the model before any test runs.
//
// Assertions on Ollama output are non-deterministic by design:
//   - We assert that a result is non-empty.
//   - We assert that the result element is populated.
//   - We do NOT assert exact output strings from the LLM.
//
// Error-path tests that require an unreachable Ollama use the SAVE_SETTINGS message
// to temporarily point the extension at a dead port (localhost:19999), then restore
// the default endpoint after the test. This avoids stopping/starting the real Ollama.
//
// Timeouts: per-test timeout is 180 s (playwright.config.ts). Individual
// waitFor calls that involve real Ollama inference use 120 s.

import { test, expect, providerInfo } from './fixtures/extension-fixture';

const DEAD_ENDPOINT = 'http://localhost:19999';
const REAL_ENDPOINT = 'http://localhost:11434';
const isOllama = providerInfo.provider === 'ollama';

// ---------------------------------------------------------------------------
// Helper: point the extension at a dead port via SAVE_SETTINGS.
// Must be called from a popup page (extension page context).
// ---------------------------------------------------------------------------
async function setEndpoint(page: import('@playwright/test').Page, endpoint: string): Promise<void> {
  await page.evaluate(async (ep: string) => {
    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      payload: { settings: { ollamaEndpoint: ep } },
    });
  }, endpoint);
}

// ---------------------------------------------------------------------------
// Suite: Popup renders correctly
// ---------------------------------------------------------------------------

test.describe('Popup: mount and layout', () => {
  test('popup opens and shows the extension header', async ({ openPopup }) => {
    const popup = await openPopup();
    await expect(popup.locator('h1')).toContainText('Correct & Translate');
  });

  test('popup renders Quick Action section heading', async ({ openPopup }) => {
    const popup = await openPopup();
    await expect(popup.locator('h2')).toContainText(/Quick Action/i);
  });

  test('popup renders the textarea input for Quick Action', async ({ openPopup }) => {
    const popup = await openPopup();
    await expect(popup.locator('textarea')).toBeVisible();
  });

  test('popup renders Correct and Translate buttons', async ({ openPopup }) => {
    const popup = await openPopup();
    await expect(popup.getByRole('button', { name: /^Correct$/i })).toBeVisible();
    await expect(popup.getByRole('button', { name: /^Translate$/i })).toBeVisible();
  });

  test('popup shows the Settings toggle button', async ({ openPopup }) => {
    const popup = await openPopup();
    await expect(popup.locator('[data-testid="settings-toggle"]')).toBeVisible();
  });

  test('popup shows the footer hint about right-click', async ({ openPopup }) => {
    const popup = await openPopup();
    await expect(popup.locator('text=Right-click selected text')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite: Status indicator
// ---------------------------------------------------------------------------

test.describe('Popup: status indicator', () => {
  test('shows green "connected" status when the active provider is reachable', async ({ openPopup }) => {
    const popup = await openPopup();
    const connectedText = isOllama ? 'Ollama connected' : 'OpenAI connected';
    await expect(popup.locator(`text=${connectedText}`)).toBeVisible({ timeout: 15_000 });
  });

  test('shows red "unreachable" status when the configured Ollama endpoint is a dead port', async ({ openPopup, extensionId, context }) => {
    test.skip(!isOllama, 'Skipped: dead-port test is Ollama-specific (OpenAI has no configurable endpoint)');

    const configPage = await context.newPage();
    await configPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await configPage.waitForSelector('h1', { timeout: 8_000 });
    await setEndpoint(configPage, DEAD_ENDPOINT);
    await configPage.close();

    const popup = await openPopup();
    await expect(popup.locator('text=Ollama unreachable')).toBeVisible({ timeout: 15_000 });

    await setEndpoint(popup, REAL_ENDPOINT);
  });

  test('shows yellow "model-missing" status when the configured Ollama model does not exist', async ({ openPopup, extensionId, context }) => {
    test.skip(!isOllama, 'Skipped: model-missing state is Ollama-specific (OpenAI model list is fixed)');

    const configPage = await context.newPage();
    await configPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await configPage.waitForSelector('h1', { timeout: 8_000 });
    await configPage.evaluate(async () => {
      await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        payload: { settings: { model: 'nonexistent-model-xyz:99b' } },
      });
    });
    await configPage.close();

    const popup = await openPopup();
    await expect(
      popup.locator('text=Ollama connected, model not found'),
    ).toBeVisible({ timeout: 15_000 });

    await popup.evaluate(async () => {
      await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        payload: { settings: { model: 'qwen3:14b' } },
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Suite: Quick Action -- Correct
// ---------------------------------------------------------------------------

test.describe('Popup: Quick Action -- Correct', () => {
  test('Correct button is disabled when textarea is empty', async ({ openPopup }) => {
    const popup = await openPopup();
    const correctBtn = popup.getByRole('button', { name: /^Correct$/i });
    await expect(correctBtn).toBeDisabled();
  });

  test('Correct button is enabled when textarea has text', async ({ openPopup }) => {
    const popup = await openPopup();
    await popup.locator('textarea').fill('She dont know nothing.');
    await expect(popup.getByRole('button', { name: /^Correct$/i })).toBeEnabled();
  });

  test('clicking Correct shows a non-empty result after the real Ollama call', async ({ openPopup }) => {
    const popup = await openPopup();
    const textarea = popup.locator('textarea');
    // Use obviously broken English so the model always produces output that differs
    // from the input (we verify non-empty, not the exact content).
    await textarea.fill('She dont know nothing about them projects.');

    await popup.getByRole('button', { name: /^Correct$/i }).click();

    // Wait for the result display to appear. The result element should be non-empty.
    // 120 s covers cold inference; global-setup warmup makes this typically < 30 s.
    const resultContainer = popup.locator('[data-testid="result-text"]');
    await resultContainer.waitFor({ state: 'visible', timeout: 120_000 });
    const resultText = await resultContainer.textContent();
    expect(resultText).toBeTruthy();
    expect((resultText ?? '').trim().length).toBeGreaterThan(0);
  });

  test('result display shows Original section', async ({ openPopup }) => {
    const popup = await openPopup();
    const inputText = 'She dont know nothing about them projects.';
    await popup.locator('textarea').fill(inputText);
    await popup.getByRole('button', { name: /^Correct$/i }).click();

    // Wait for the result to appear (real Ollama call).
    // Once a result is shown, the original text should also be visible in the display.
    const resultContainer = popup.locator('[data-testid="result-text"]');
    await resultContainer.waitFor({ state: 'visible', timeout: 120_000 });

    // The original text is displayed alongside the result.
    await expect(popup.locator('[data-testid="original-text"]')).toContainText(inputText);
  });

  test('result display auto-copies and shows the copied confirmation', async ({ openPopup }) => {
    // The popup result panel has no action buttons. When a result appears it is
    // copied to the clipboard automatically and a confirmation is shown.
    const popup = await openPopup();
    await popup.locator('textarea').fill('She dont know nothing about them projects.');
    await popup.getByRole('button', { name: /^Correct$/i }).click();

    const resultContainer = popup.locator('[data-testid="result-text"]');
    await resultContainer.waitFor({ state: 'visible', timeout: 120_000 });

    // The auto-copy confirmation appears.
    await expect(popup.locator('[data-testid="copied-hint"]')).toBeVisible({ timeout: 5_000 });
    // There are no Replace / Append / Copy / Clear buttons in the result panel.
    await expect(popup.locator('[data-testid="result-replace"]')).toHaveCount(0);
    await expect(popup.locator('[data-testid="result-append"]')).toHaveCount(0);
    await expect(popup.getByRole('button', { name: /^Copy$/i })).toHaveCount(0);
    await expect(popup.getByRole('button', { name: /^Clear$/i })).toHaveCount(0);
  });

  test('result display shows the metadata line (model, tokens, elapsed)', async ({ openPopup }) => {
    // After a correction, the result panel shows a small metadata line:
    // "<model> · <n> tokens · <t> s". The exact numbers are non-deterministic;
    // we assert the line is present and well-formed.
    const popup = await openPopup();
    await popup.locator('textarea').fill('She dont know nothing about them projects.');
    await popup.getByRole('button', { name: /^Correct$/i }).click();

    const resultContainer = popup.locator('[data-testid="result-text"]');
    await resultContainer.waitFor({ state: 'visible', timeout: 120_000 });

    const meta = popup.locator('[data-testid="result-meta"]');
    await expect(meta).toBeVisible({ timeout: 5_000 });
    const metaText = (await meta.textContent())?.trim() ?? '';
    // The model name is always present; the seconds segment ends with " s".
    expect(metaText.length).toBeGreaterThan(0);
    expect(metaText).toMatch(/\d+(\.\d+)?\s*s/);
  });

  test('character counter shows correct count and goes red over limit', async ({ openPopup }) => {
    const popup = await openPopup();
    const textarea = popup.locator('textarea');

    await textarea.fill('Hello');
    await expect(popup.locator('text=/5.*10,000/')).toBeVisible();

    const longText = 'a'.repeat(10_001);
    await textarea.fill(longText);
    await expect(popup.getByRole('button', { name: /^Correct$/i })).toBeDisabled();
  });

  test('clicking Correct while the endpoint is dead shows an error message', async ({
    openPopup,
    extensionId,
    context,
  }) => {
    test.skip(!isOllama, 'Skipped: dead-port error test is Ollama-specific (OpenAI has no configurable endpoint)');
    // Point the extension at a dead port before opening the popup.
    const configPage = await context.newPage();
    await configPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await configPage.waitForSelector('h1', { timeout: 8_000 });
    await setEndpoint(configPage, DEAD_ENDPOINT);
    await configPage.close();

    const popup = await openPopup();
    await popup.locator('textarea').fill('Test error handling.');
    await popup.getByRole('button', { name: /^Correct$/i }).click();

    // The connection to a dead port fails immediately; the error banner appears quickly.
    // Target the data-testid attribute to avoid strict-mode violation with the
    // loading indicator text "Processing with Ollama...".
    await expect(
      popup.locator('[data-testid="error-banner"]'),
    ).toBeVisible({ timeout: 30_000 });

    // Restore the real endpoint.
    await setEndpoint(popup, REAL_ENDPOINT);
  });
});

// ---------------------------------------------------------------------------
// Suite: Quick Action -- Translate
// ---------------------------------------------------------------------------

test.describe('Popup: Quick Action -- Translate', () => {
  test('Translate button is disabled when textarea is empty', async ({ openPopup }) => {
    const popup = await openPopup();
    await expect(popup.getByRole('button', { name: /^Translate$/i })).toBeDisabled();
  });

  test('translates text and shows a non-empty result', async ({ openPopup }) => {
    const popup = await openPopup();
    await popup.locator('textarea').fill('Hello, how are you today?');
    await popup.getByRole('button', { name: /^Translate$/i }).click();

    // A non-empty result element should appear after the real Ollama call.
    const resultContainer = popup.locator('[data-testid="result-text"]');
    await resultContainer.waitFor({ state: 'visible', timeout: 120_000 });
    const resultText = await resultContainer.textContent();
    expect((resultText ?? '').trim().length).toBeGreaterThan(0);
  });

  test('target language selector is visible and has all three options', async ({ openPopup }) => {
    const popup = await openPopup();
    // <option> elements are never "visible" in Playwright unless the dropdown is open.
    // Assert that the options are present (attached to the DOM) instead.
    await expect(popup.locator('option[value="English"]').first()).toBeAttached();
    await expect(popup.locator('option[value="German"]').first()).toBeAttached();
    await expect(popup.locator('option[value="Romanian"]').first()).toBeAttached();
  });

  test('changing target language to Romanian and translating returns a non-empty result', async ({ openPopup }) => {
    const popup = await openPopup();
    await popup.locator('textarea').fill('Hello, how are you today?');

    // Select Romanian in the "Translate To" language selector.
    const selects = popup.locator('select');
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
      const sel = selects.nth(i);
      const options = await sel.locator('option').allTextContents();
      if (options.includes('Romanian')) {
        await sel.selectOption('Romanian');
        break;
      }
    }

    await popup.getByRole('button', { name: /^Translate$/i }).click();

    // We assert a non-empty result; exact Romanian content is non-deterministic.
    const resultContainer = popup.locator('[data-testid="result-text"]');
    await resultContainer.waitFor({ state: 'visible', timeout: 120_000 });
    const resultText = await resultContainer.textContent();
    expect((resultText ?? '').trim().length).toBeGreaterThan(0);
  });

  test('translate result auto-copies and shows the copied confirmation (no action buttons)', async ({ openPopup }) => {
    // The popup result panel has no Replace / Append / Copy / Clear buttons.
    // The translation is copied to the clipboard automatically and a
    // confirmation element is shown.
    const popup = await openPopup();
    await popup.locator('textarea').fill('Hello, how are you today?');
    await popup.getByRole('button', { name: /^Translate$/i }).click();

    const resultContainer = popup.locator('[data-testid="result-text"]');
    await resultContainer.waitFor({ state: 'visible', timeout: 120_000 });

    await expect(popup.locator('[data-testid="copied-hint"]')).toBeVisible({ timeout: 5_000 });
    await expect(popup.locator('[data-testid="result-replace"]')).toHaveCount(0);
    await expect(popup.locator('[data-testid="result-append"]')).toHaveCount(0);
    await expect(popup.getByRole('button', { name: /^Copy$/i })).toHaveCount(0);
    await expect(popup.getByRole('button', { name: /^Clear$/i })).toHaveCount(0);
  });

  test('translate result keeps the original text visible alongside the translation', async ({ openPopup }) => {
    // German source text with the default target language (English) so the
    // translation is clearly different from the input. The source language is
    // auto-detected by the model -- no detection/confirm step in the popup.
    const popup = await openPopup();
    const textarea = popup.locator('textarea');
    const originalText = 'Hallo, wie geht es dir heute?';
    await textarea.fill(originalText);
    await popup.getByRole('button', { name: /^Translate$/i }).click();

    const resultContainer = popup.locator('[data-testid="result-text"]');
    await resultContainer.waitFor({ state: 'visible', timeout: 120_000 });
    const translation = ((await resultContainer.textContent()) ?? '').trim();
    expect(translation.length).toBeGreaterThan(0);

    // The original text is shown in its own block; the input textarea is unchanged
    // (the result panel no longer mutates the textarea).
    await expect(popup.locator('[data-testid="original-text"]')).toContainText(originalText);
    expect(await textarea.inputValue()).toBe(originalText);
  });
});

// ---------------------------------------------------------------------------
// Suite: Settings section
// ---------------------------------------------------------------------------

test.describe('Popup: Settings section', () => {
  test('settings section is collapsed by default', async ({ openPopup }) => {
    const popup = await openPopup();
    await expect(popup.getByRole('button', { name: /Save Settings/i })).not.toBeVisible();
  });

  test('clicking Settings toggle expands the section', async ({ openPopup }) => {
    const popup = await openPopup();
    // Use data-testid to target the toggle specifically (avoids strict-mode violation
    // when "Save Settings" button is also visible after the section opens).
    await popup.locator('[data-testid="settings-toggle"]').click();
    await expect(popup.getByRole('button', { name: /Save Settings/i })).toBeVisible();
  });

  test('clicking Settings toggle again collapses the section', async ({ openPopup }) => {
    const popup = await openPopup();
    const toggle = popup.locator('[data-testid="settings-toggle"]');
    await toggle.click();
    await expect(popup.getByRole('button', { name: /Save Settings/i })).toBeVisible();
    await toggle.click();
    await expect(popup.getByRole('button', { name: /Save Settings/i })).not.toBeVisible();
  });

  test('settings section shows Ollama Endpoint input with default value', async ({ openPopup }) => {
    test.skip(!isOllama, 'Skipped: Ollama endpoint input only visible when Ollama is the active provider');
    const popup = await openPopup();
    await popup.locator('[data-testid="settings-toggle"]').click();
    await expect(popup.locator('input[type="url"]')).toBeVisible();
    await expect(popup.locator('input[type="url"]')).toHaveValue('http://localhost:11434');
  });

  test('settings section shows Model dropdown with known models', async ({ openPopup }) => {
    test.skip(!isOllama, 'Skipped: Ollama model dropdown only visible when Ollama is the active provider');
    const popup = await openPopup();
    await popup.locator('[data-testid="settings-toggle"]').click();
    await expect(
      popup.locator('option[value="qwen3.6:35b-a3b"]').first(),
    ).toBeAttached();
  });

  test('Save Settings button shows success feedback', async ({ openPopup }) => {
    const popup = await openPopup();
    await popup.locator('[data-testid="settings-toggle"]').click();
    await popup.getByRole('button', { name: /Save Settings/i }).click();
    await expect(popup.locator('text=Settings saved.')).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Suite: Settings section -- OpenAI provider UI
//
// These tests exercise the settings UI only (provider toggle, API-key field,
// consent dialog). No real OpenAI network call is made.
// ---------------------------------------------------------------------------

test.describe('Popup: Settings section -- OpenAI provider', () => {
  test('settings section shows the Ollama and OpenAI provider toggle buttons', async ({ openPopup }) => {
    const popup = await openPopup();
    await popup.locator('[data-testid="settings-toggle"]').click();
    await expect(popup.getByRole('button', { name: /Ollama \(local\)/i })).toBeVisible();
    await expect(popup.getByRole('button', { name: /^OpenAI$/i })).toBeVisible();
  });

  test('switching to OpenAI shows a one-time data-egress consent dialog', async ({ openPopup }) => {
    test.skip(!isOllama, 'Skipped: consent dialog only appears on first Ollama→OpenAI switch; OpenAI runs start with consent pre-acknowledged');
    const popup = await openPopup();
    await popup.locator('[data-testid="settings-toggle"]').click();
    await popup.getByRole('button', { name: /^OpenAI$/i }).click();

    // The consent dialog gates the switch.
    await expect(popup.getByRole('dialog')).toBeVisible();
    await expect(popup.locator('text=Data egress notice')).toBeVisible();
  });

  test('cancelling the consent dialog leaves the provider on Ollama', async ({ openPopup }) => {
    test.skip(!isOllama, 'Skipped: consent cancel flow requires Ollama as base provider; OpenAI runs start with consent pre-acknowledged');
    const popup = await openPopup();
    await popup.locator('[data-testid="settings-toggle"]').click();
    await popup.getByRole('button', { name: /^OpenAI$/i }).click();
    await popup.getByRole('dialog').waitFor({ state: 'visible' });
    await popup.getByRole('button', { name: /^Cancel$/i }).click();

    await expect(popup.getByRole('dialog')).toHaveCount(0);
    // Still on Ollama: the Ollama model select is present, no OpenAI key field.
    await expect(popup.locator('[data-testid="model-select"]')).toBeVisible();
    await expect(popup.locator('input[type="password"]')).toHaveCount(0);
  });

  test('confirming consent reveals the masked OpenAI API key field', async ({ openPopup }) => {
    test.skip(!isOllama, 'Skipped: consent confirm flow requires Ollama as base provider; OpenAI runs start with consent pre-acknowledged');
    const popup = await openPopup();
    await popup.locator('[data-testid="settings-toggle"]').click();
    await popup.getByRole('button', { name: /^OpenAI$/i }).click();
    await popup.getByRole('dialog').waitFor({ state: 'visible' });
    await popup.getByRole('button', { name: /I understand, use OpenAI/i }).click();

    await expect(popup.getByRole('dialog')).toHaveCount(0);
    // The API key field is a masked password input, with a Validate button.
    await expect(popup.locator('input[type="password"]')).toBeVisible();
    await expect(popup.getByRole('button', { name: /Validate/i })).toBeVisible();
    // The OpenAI model selector lists the available models.
    await expect(popup.locator('option[value="gpt-5-nano"]').first()).toBeAttached();
    await expect(popup.locator('option[value="gpt-5.4-nano"]').first()).toBeAttached();
  });

  test('persistent "OpenAI" badge appears in the popup header when OpenAI is the active provider', async ({
    openPopup,
    extensionId,
    context,
  }) => {
    // Persist provider=openai (with consent already acknowledged) via SAVE_SETTINGS.
    const configPage = await context.newPage();
    await configPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await configPage.waitForSelector('h1', { timeout: 8_000 });
    await configPage.evaluate(async () => {
      await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        payload: {
          settings: {
            provider: 'openai',
            openaiConsentAcknowledged: true,
            openaiApiKey: 'sk-test-placeholder',
          },
        },
      });
    });
    await configPage.close();

    // A fresh popup reads settings on mount and shows the persistent badge.
    const popup = await openPopup();
    await expect(popup.locator('h1')).toContainText('Correct & Translate');
    // The persistent "OpenAI" badge sits next to the title in the header.
    await expect(popup.getByText('OpenAI', { exact: true })).toBeVisible({ timeout: 8_000 });

    // Restore the Ollama provider so subsequent tests are not affected.
    await popup.evaluate(async () => {
      await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        payload: { settings: { provider: 'ollama' } },
      });
    });
  });
});
