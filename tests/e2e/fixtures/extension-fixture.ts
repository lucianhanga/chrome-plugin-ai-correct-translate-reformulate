// tests/e2e/fixtures/extension-fixture.ts
// Playwright test fixture that:
//   1. Launches a persistent Chromium context with the TEST BUILD (dist-test/) loaded.
//   2. Exposes the resolved extension ID and a helper to open the popup page.
//   3. Provides a helper page (test-page.html) served over HTTP for content
//      script / overlay tests (file:// is not injectable without <all_urls>).
//   4. Exposes `activeProvider` so tests can skip provider-specific assertions.
//   5. When the active provider is OpenAI, automatically seeds the extension's
//      chrome.storage.local with the OpenAI settings after the service worker starts,
//      so all LLM tests work without per-test provider setup.

import { test as base, chromium, expect } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { EXT_ID_FILE, TEST_SERVER_PORT_FILE, PROVIDER_INFO_FILE } from './global-setup';
import type { ProviderInfo } from './global-setup';

const DIST_TEST_PATH = resolve(process.cwd(), 'dist-test');

// Read provider info written by globalSetup. Falls back to Ollama defaults so
// the fixture is safe to import even outside a full test run (e.g. type-check).
function readProviderInfo(): ProviderInfo {
  try {
    return JSON.parse(readFileSync(PROVIDER_INFO_FILE, 'utf8')) as ProviderInfo;
  } catch {
    return { provider: 'ollama', endpoint: 'http://localhost:11434', model: 'qwen3:14b' };
  }
}

export const providerInfo = readProviderInfo();

// Shape of the extended fixture.
export interface ExtensionFixtures {
  /** Resolved extension ID (stable within one test run). */
  extensionId: string;
  /** Persistent browser context with the extension loaded. */
  context: BrowserContext;
  /** A blank page in the extension context for content script tests. */
  page: Page;
  /** Open the extension popup as a full tab (chrome-extension://.../popup.html). */
  openPopup: () => Promise<Page>;
  /** Base URL of the local HTTP server serving test pages (e.g. http://localhost:PORT). */
  testServerBaseUrl: string;
  /** Active LLM provider for this test run ('ollama' or 'openai'). */
  activeProvider: 'ollama' | 'openai';
}

// Configure the extension's chrome.storage.local with OpenAI settings.
// Called once per context after the service worker is ready.
async function seedOpenAISettings(sw: Worker): Promise<void> {
  const apiKey = process.env['OPENAI_API_KEY'] ?? '';
  const model = providerInfo.provider === 'openai' ? providerInfo.model : 'gpt-5-nano';
  await sw.evaluate(
    async ({ key, mdl }: { key: string; mdl: string }) => {
      const result = await chrome.storage.local.get('settings');
      const current = (result['settings'] as Record<string, unknown>) ?? {};
      await chrome.storage.local.set({
        settings: {
          ...current,
          provider: 'openai',
          openaiApiKey: key,
          openaiModel: mdl,
          openaiConsentAcknowledged: true,
        },
      });
    },
    { key: apiKey, mdl: model },
  );
}

export const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern
  extensionId: async ({}, use) => {
    const id = readFileSync(EXT_ID_FILE, 'utf8').trim();
    await use(id);
  },

  // eslint-disable-next-line no-empty-pattern
  testServerBaseUrl: async ({}, use) => {
    const port = readFileSync(TEST_SERVER_PORT_FILE, 'utf8').trim();
    await use(`http://localhost:${port}`);
  },

  // eslint-disable-next-line no-empty-pattern
  activeProvider: async ({}, use) => {
    await use(providerInfo.provider);
  },

  context: async ({ extensionId: _id }, use) => {
    const userDataDir = resolve(
      process.cwd(),
      'test-results',
      `.chrome-profile-${Date.now()}`,
    );

    const ctx = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${DIST_TEST_PATH}`,
        `--load-extension=${DIST_TEST_PATH}`,
        '--headless=new',
        '--disable-infobars',
        '--no-sandbox',
      ],
      viewport: { width: 1280, height: 800 },
    });

    // Wait for the service worker to register.
    let sw: Worker | undefined;
    for (let i = 0; i < 30; i++) {
      sw = ctx.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
      if (sw) break;
      await new Promise<void>((r) => setTimeout(r, 300));
    }
    if (!sw) {
      throw new Error('[fixture] Service worker did not register within 9 seconds.');
    }

    // When running with OpenAI, seed the extension's storage so every test
    // in this context uses OpenAI without needing per-test setup.
    if (providerInfo.provider === 'openai') {
      await seedOpenAISettings(sw);
    }

    await use(ctx);
    await ctx.close();
  },

  page: async ({ context }, use) => {
    const pg = await context.newPage();
    await use(pg);
  },

  openPopup: async ({ context, extensionId }, use) => {
    const open = async (): Promise<Page> => {
      const pg = await context.newPage();
      await pg.goto(`chrome-extension://${extensionId}/popup.html`);
      await pg.waitForSelector('h1', { timeout: 8_000 });
      return pg;
    };
    await use(open);
  },
});

export { expect };
