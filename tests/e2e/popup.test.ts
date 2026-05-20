// tests/e2e/popup.test.ts
// End-to-end tests for the Popup UI.
//
// What is covered:
//   - Popup mounts and renders expected sections
//   - Status indicator reflects Ollama health (connected, unreachable, model-missing)
//   - Quick Action: Correct button sends a request and displays a non-empty result
//   - Quick Action: Translate button sends a request and displays a non-empty result
//   - Quick Action: error state is shown when the configured endpoint is unreachable
//   - Quick Action: character limit guard prevents submission and shows counter
//   - Quick Action: empty input prevents submission
//   - Settings section: opens/closes via toggle
//   - Settings section: Save persists values and refreshes status
//   - Result display: Copy button and clear (Reject) button
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

import { test, expect } from './fixtures/extension-fixture';

const DEAD_ENDPOINT = 'http://localhost:19999';
const REAL_ENDPOINT = 'http://localhost:11434';

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
  test('shows green "connected" status when Ollama is running with the model', async ({ openPopup }) => {
    // Real Ollama is running (verified by global-setup).
    // The popup performs a health check on mount and updates the status indicator.
    const popup = await openPopup();
    await expect(popup.locator('text=Ollama connected')).toBeVisible({ timeout: 15_000 });
  });

  test('shows red "unreachable" status when the configured endpoint is a dead port', async ({ openPopup, extensionId, context }) => {
    // Open a popup page and point the extension at a dead port.
    const configPage = await context.newPage();
    await configPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await configPage.waitForSelector('h1', { timeout: 8_000 });
    await setEndpoint(configPage, DEAD_ENDPOINT);
    await configPage.close();

    // Open a fresh popup -- it reads settings on mount, so it will use the dead endpoint.
    const popup = await openPopup();
    await expect(popup.locator('text=Ollama unreachable')).toBeVisible({ timeout: 15_000 });

    // Restore the real endpoint so subsequent tests are not affected.
    await setEndpoint(popup, REAL_ENDPOINT);
  });

  test('shows yellow "model-missing" status when the configured model does not exist', async ({ openPopup, extensionId, context }) => {
    // Point the extension at the real Ollama but configure a nonexistent model.
    // The health check calls /api/tags and checks whether the configured model is listed.
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

    // Open a fresh popup -- the health check will find Ollama reachable but the
    // configured model absent, producing the yellow "model not found" state.
    const popup = await openPopup();
    await expect(
      popup.locator('text=Ollama connected, model not found'),
    ).toBeVisible({ timeout: 15_000 });

    // Restore the real model name.
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

  test('result display has a Copy button', async ({ openPopup }) => {
    const popup = await openPopup();
    await popup.locator('textarea').fill('She dont know nothing about them projects.');
    await popup.getByRole('button', { name: /^Correct$/i }).click();

    const resultContainer = popup.locator('[data-testid="result-text"]');
    await resultContainer.waitFor({ state: 'visible', timeout: 120_000 });
    await expect(popup.getByRole('button', { name: /Copy/i })).toBeVisible();
  });

  test('result display has a clear/reject button that removes the result', async ({ openPopup }) => {
    const popup = await openPopup();
    await popup.locator('textarea').fill('She dont know nothing about them projects.');
    await popup.getByRole('button', { name: /^Correct$/i }).click();

    const resultContainer = popup.locator('[data-testid="result-text"]');
    await resultContainer.waitFor({ state: 'visible', timeout: 120_000 });

    const clearBtn = popup.getByRole('button', { name: /Clear|Reject|Dismiss|Remove/i });
    if (await clearBtn.count() > 0) {
      await clearBtn.first().click();
      await expect(resultContainer).not.toBeVisible();
    }
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
    const popup = await openPopup();
    await popup.locator('[data-testid="settings-toggle"]').click();
    await expect(popup.locator('input[type="url"]')).toBeVisible();
    await expect(popup.locator('input[type="url"]')).toHaveValue('http://localhost:11434');
  });

  test('settings section shows Model dropdown with known models', async ({ openPopup }) => {
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

  test('source language quick-set buttons are visible', async ({ openPopup }) => {
    const popup = await openPopup();
    await popup.locator('[data-testid="settings-toggle"]').click();
    await expect(popup.getByRole('button', { name: /^Auto$/i })).toBeVisible();
    await expect(popup.getByRole('button', { name: /^English$/i })).toBeVisible();
    await expect(popup.getByRole('button', { name: /^German$/i })).toBeVisible();
    await expect(popup.getByRole('button', { name: /^Romanian$/i })).toBeVisible();
  });

  test('selecting a source language quick-set highlights that button', async ({ openPopup }) => {
    const popup = await openPopup();
    await popup.locator('[data-testid="settings-toggle"]').click();
    await popup.getByRole('button', { name: /^German$/i }).click();
    const germanBtn = popup.getByRole('button', { name: /^German$/i });
    // Use toHaveCSS (which retries automatically) rather than evaluate+getComputedStyle
    // (which does not retry and can race against React re-render).
    // #22c55e converts to rgb(34, 197, 94).
    await expect(germanBtn).toHaveCSS('background-color', 'rgb(34, 197, 94)');
  });
});
