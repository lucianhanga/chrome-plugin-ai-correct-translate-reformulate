// tests/e2e/fixtures/global-setup.ts
// Playwright globalSetup: runs once before any test file.
//
// Responsibilities:
//   1. Verify that the real Ollama server is reachable at http://localhost:11434.
//   2. Verify that qwen3:14b is listed in /api/tags (model is pulled).
//   3. Send a warmup call (/v1/chat/completions) so the model is loaded into
//      memory before the first test. Cold-loading a 23 GB model can take 90+ s.
//      The warmup runs in global-setup so that timeout budget is not charged to
//      individual test timeouts.
//   4. Start a local HTTP static server that serves tests/e2e/fixtures/ -- this
//      allows the extension to inject content scripts into test pages over HTTP
//      (file:// URLs require <all_urls> permission; http://localhost/* is narrower).
//      The server port is written to a temp file so fixtures can read it.
//   5. Launch a throwaway Chromium instance with the TEST BUILD (dist-test/)
//      loaded, read the extension ID from the background service worker URL,
//      write it to a temp file, then tear the instance down.
//
// Preconditions (fail fast with a clear message if not met):
//   - Ollama is running:          ollama serve
//   - Model is pulled:            ollama pull qwen3:14b
//   - OLLAMA_ORIGINS is set:      export OLLAMA_ORIGINS="chrome-extension://*"
//   - Test build exists:          pnpm build:test   (or pnpm test:e2e which does it)
//
// The extension ID is stable within one OS user profile directory. Playwright's
// persistent context creates a fresh profile per run, so the ID is random each
// time but consistent within the run.

import { chromium } from '@playwright/test';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { startTestServer } from './test-server';

// dist-test/ is the test build: same JS as dist/ but manifest has http://localhost/*
const DIST_TEST_PATH = resolve(process.cwd(), 'dist-test');
// Temp file path -- read by the extension fixture.
export const EXT_ID_FILE = resolve(process.cwd(), 'test-results', '.extension-id');
// Temp file for the HTTP server port -- read by overlay/context-menu tests.
export const TEST_SERVER_PORT_FILE = resolve(process.cwd(), 'test-results', '.test-server-port');

const OLLAMA_BASE = 'http://localhost:11434';
const EXPECTED_MODEL = 'qwen3:14b';
// Warmup timeout: allow up to 5 minutes for a cold model load.
const WARMUP_TIMEOUT_MS = 300_000;
// Health check network timeout: short, because Ollama must already be up.
const HEALTH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Ollama preflight checks
// ---------------------------------------------------------------------------

async function checkOllamaReachable(): Promise<void> {
  let res: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
  } catch (err) {
    throw new Error(
      `[global-setup] Ollama is not reachable at ${OLLAMA_BASE}.\n` +
      `Start it with: ollama serve\n` +
      `Original error: ${String(err)}`,
      { cause: err },
    );
  }
  if (!res.ok) {
    throw new Error(
      `[global-setup] Ollama /api/tags returned HTTP ${res.status}. ` +
      `Expected 200. Is Ollama healthy?`,
    );
  }
}

async function checkModelPresent(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal });
  clearTimeout(timer);

  if (!res.ok) {
    throw new Error(`[global-setup] /api/tags returned HTTP ${res.status}.`);
  }

  const json = (await res.json()) as { models?: Array<{ name: string }> };
  const models = json.models ?? [];
  const found = models.some((m) => m.name === EXPECTED_MODEL || m.name.startsWith(EXPECTED_MODEL));
  if (!found) {
    const names = models.map((m) => m.name).join(', ') || '(none)';
    throw new Error(
      `[global-setup] Model "${EXPECTED_MODEL}" is not present in Ollama.\n` +
      `Pull it with: ollama pull ${EXPECTED_MODEL}\n` +
      `Models currently available: ${names}`,
    );
  }
  console.log(`[global-setup] Model "${EXPECTED_MODEL}" found in Ollama.`);
}

async function warmupModel(): Promise<void> {
  console.log(
    `[global-setup] Sending warmup call to load "${EXPECTED_MODEL}" into memory. ` +
    `This may take several minutes on a cold start...`,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: EXPECTED_MODEL,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Reply with a single word: ready' },
        ],
        temperature: 0,
        max_tokens: 5,
        // Disable chain-of-thought so the warmup is fast once loaded.
        options: { think: false },
      }),
    });
    clearTimeout(timer);
  } catch (err) {
    clearTimeout(timer);
    throw new Error(
      `[global-setup] Warmup call to Ollama failed or timed out after ${WARMUP_TIMEOUT_MS / 1000} s.\n` +
      `Ensure the model is fully pulled and Ollama has enough memory.\n` +
      `Original error: ${String(err)}`,
      { cause: err },
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `[global-setup] Warmup call returned HTTP ${res.status}.\n` +
      `Response body: ${body}`,
    );
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const reply = json.choices?.[0]?.message?.content ?? '';
  console.log(`[global-setup] Warmup complete. Model reply: "${reply.trim()}"`);
}

// ---------------------------------------------------------------------------
// Extension ID resolution (uses dist-test/ -- the test build)
// ---------------------------------------------------------------------------

async function resolveExtensionId(): Promise<string> {
  const userDataDir = resolve(process.cwd(), 'test-results', '.chrome-profile');
  mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    // headless:false + --headless=new -- windowless, but loads the extension.
    // See tests/e2e/fixtures/extension-fixture.ts for the rationale.
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

  // The service worker URL encodes the extension ID:
  // chrome-extension://<id>/service-worker.js
  let extensionId = '';

  // Wait for the service worker to register. It may take a second on first load.
  for (let attempt = 0; attempt < 20; attempt++) {
    const workers = context.serviceWorkers();
    const sw = workers.find((w) => w.url().includes('service-worker.js'));
    if (sw) {
      const match = /chrome-extension:\/\/([a-z]{32})\//.exec(sw.url());
      if (match?.[1]) {
        extensionId = match[1];
        break;
      }
    }
    await new Promise<void>((res) => setTimeout(res, 300));
  }

  await context.close();

  if (!extensionId) {
    throw new Error(
      '[global-setup] Could not resolve extension ID. ' +
      'Make sure dist-test/ exists (run: pnpm build:test) and the extension loads without errors. ' +
      'Check chrome://extensions for load errors.',
    );
  }

  return extensionId;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// Store the server so global-teardown can close it.
let _serverClose: (() => Promise<void>) | null = null;

export default async function globalSetup(): Promise<() => Promise<void>> {
  mkdirSync(resolve(process.cwd(), 'test-results'), { recursive: true });

  // Step 1: fail fast if Ollama is down or model is missing.
  await checkOllamaReachable();
  await checkModelPresent();

  // Step 2: warm up the model so it is resident in memory for all tests.
  await warmupModel();

  // Step 3: start the local HTTP static server for test pages.
  const server = await startTestServer();
  _serverClose = server.close;
  writeFileSync(TEST_SERVER_PORT_FILE, String(server.port), 'utf8');
  console.log(`[global-setup] Test page server listening on port ${server.port}.`);

  // Step 4: resolve the extension ID from the test build.
  const extensionId = await resolveExtensionId();
  writeFileSync(EXT_ID_FILE, extensionId, 'utf8');
  console.log(`[global-setup] Extension ID: ${extensionId}`);
  console.log('[global-setup] Preconditions satisfied. Starting tests.');

  // Return teardown function -- Playwright calls it after all tests complete.
  return async () => {
    if (_serverClose) {
      await _serverClose();
      _serverClose = null;
    }
  };
}
