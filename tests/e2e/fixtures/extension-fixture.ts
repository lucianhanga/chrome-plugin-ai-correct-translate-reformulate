// tests/e2e/fixtures/extension-fixture.ts
// Playwright test fixture that:
//   1. Launches a persistent Chromium context with the TEST BUILD (dist-test/) loaded.
//   2. Exposes the resolved extension ID and a helper to open the popup page.
//   3. Provides a helper page (test-page.html) served over HTTP for content
//      script / overlay tests (file:// is not injectable without <all_urls>).
//
// Each test file should import { test, expect } from this module instead of
// directly from @playwright/test.

import { test as base, chromium, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { EXT_ID_FILE, TEST_SERVER_PORT_FILE } from './global-setup';

// Test build: same compiled JS as dist/ but manifest has http://localhost/*
const DIST_TEST_PATH = resolve(process.cwd(), 'dist-test');

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

  context: async ({ extensionId: _id }, use) => {
    // Each test gets its own isolated persistent context so settings / storage
    // changes in one test do not bleed into the next.
    const userDataDir = resolve(
      process.cwd(),
      'test-results',
      `.chrome-profile-${Date.now()}`,
    );

    const ctx = await chromium.launchPersistentContext(userDataDir, {
      // headless:false + --headless=new: Chrome runs windowless via its new
      // headless mode, which loads MV3 extensions. Playwright's headless:true
      // path does not load extensions in a persistent context, so it stays false.
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

    // Wait for the service worker to register before yielding to the test.
    let ready = false;
    for (let i = 0; i < 30; i++) {
      const workers = ctx.serviceWorkers();
      if (workers.some((w) => w.url().includes('service-worker.js'))) {
        ready = true;
        break;
      }
      await new Promise<void>((r) => setTimeout(r, 300));
    }
    if (!ready) {
      throw new Error('[fixture] Service worker did not register within 9 seconds.');
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
      // Wait for React to mount: the header "Correct & Translate" must be visible.
      await pg.waitForSelector('h1', { timeout: 8_000 });
      return pg;
    };
    await use(open);
  },
});

export { expect };
