// playwright.config.ts
// Playwright configuration for the Correct & Translate Chrome extension E2E test suite.
//
// Design decisions:
// - Runs headless via Chrome's new headless mode. The browser is launched with
//   headless:false + the --headless=new arg: Chrome runs windowless and the new
//   headless mode loads MV3 extensions, while Playwright's own headless:true
//   path -- which does not load extensions in a persistent context -- is avoided.
// - No parallelism (workers: 1). The extension ID is resolved once at process startup.
//   Parallel workers would each spin up their own browser context with a potentially
//   different extension ID, breaking any cached ID assumptions.
// - Timeout: 180 seconds per test. Tests use the real Ollama server with qwen3:14b.
//   A cold-load inference call can take 90+ seconds; the extension's own AbortController
//   fires at 60 s. We allow 3x the extension timeout to cover the full
//   loading + inference + overlay-render round trip.
// - testDir points to tests/e2e only -- Vitest owns tests/unit and tests/mocks.
// - globalSetup resolves the extension ID, starts the HTTP test-page server, and
//   writes both to temp files so all test workers can read them without re-launching
//   the browser. globalSetup also verifies that Ollama is reachable and the model
//   is present before any test runs.
//
// Build:
//   Tests load dist-test/ (the test build) instead of dist/ (the production build).
//   dist-test/ is identical to dist/ except its manifest.json also grants
//   'http://localhost/*' so chrome.scripting.executeScript can inject the content
//   script into HTTP-served test pages without needing activeTab.
//   Production dist/ and public/manifest.json are NEVER modified.

// @ts-check
import { defineConfig } from '@playwright/test';
import { resolve } from 'path';

// Test build -- NOT the production dist/
const DIST_TEST_PATH = resolve(import.meta.dirname, 'dist-test');

export default defineConfig({
  testDir: './tests/e2e',
  // Up to 5 files in parallel. Each test gets its own isolated browser context
  // with a unique Chrome profile directory, so there are no shared-state races.
  // The extension ID is resolved once by globalSetup and written to a file that
  // all workers read — it is deterministic (same path → same ID) across profiles.
  workers: 5,
  // fullyParallel: false means tests within a file are also run sequentially
  // (important for the overlay singleton -- only one overlay at a time).
  fullyParallel: false,
  // Each test: 180 s. Real Ollama calls to qwen3:14b take 5-90 seconds
  // depending on model load state. We allow 3x the extension timeout (60 s).
  timeout: 180_000,
  // Each expect assertion: 15 s (overlay transitions, React render settle time,
  // real Ollama health check round-trip).
  expect: {
    timeout: 15_000,
  },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    // headless:false + the --headless=new arg below -- windowless, extensions load.
    headless: false,
    // slowMo can be raised to watch UI transitions when debugging.
    launchOptions: {
      slowMo: 0,
      args: [
        `--disable-extensions-except=${DIST_TEST_PATH}`,
        `--load-extension=${DIST_TEST_PATH}`,
        // New headless mode: windowless, and unlike old headless it loads extensions.
        '--headless=new',
        // Suppress Chrome's "Chrome is being controlled by automated test software" bar.
        '--disable-infobars',
        // Required for extension service workers to function in automated mode.
        '--no-sandbox',
      ],
    },
    // Viewport large enough that overlay positioning tests behave predictably.
    viewport: { width: 1280, height: 800 },
    // Screenshot on failure only.
    screenshot: 'only-on-failure',
    // Trace on failure for post-mortem debugging.
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        channel: 'chromium',
      },
    },
  ],
  // globalSetup resolves the extension ID and starts the HTTP server once for the
  // entire run. Returns a teardown function that shuts the server down.
  globalSetup: './tests/e2e/fixtures/global-setup.ts',
  outputDir: 'test-results',
});
