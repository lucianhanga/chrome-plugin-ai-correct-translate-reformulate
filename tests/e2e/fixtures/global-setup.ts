// tests/e2e/fixtures/global-setup.ts
// Playwright globalSetup: runs once before any test file.
//
// Provider selection (in priority order):
//   1. Ollama at http://localhost:11434 — check reachability + model presence, warm up.
//   2. OpenAI — if OPENAI_API_KEY is set and Ollama is not available, validate the
//      key and use gpt-5-nano as the E2E provider.
//   3. Neither — fail fast with a clear message.
//
// What is written to disk for each run:
//   test-results/.extension-id        (extension ID resolved from the test build)
//   test-results/.test-server-port    (HTTP server port for test pages)
//   test-results/.provider-info.json  (active provider + config, read by fixture)
//
// Preconditions for Ollama path:
//   - Ollama is running:          ollama serve
//   - Model is pulled:            ollama pull qwen3:14b
//   - OLLAMA_ORIGINS is set:      export OLLAMA_ORIGINS="chrome-extension://*"
//   - Test build exists:          pnpm build:test
//
// Preconditions for OpenAI path:
//   - OPENAI_API_KEY env var is set with a valid key
//   - Test build exists:          pnpm build:test

import { chromium } from '@playwright/test';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { startTestServer } from './test-server';

const DIST_TEST_PATH = resolve(process.cwd(), 'dist-test');
export const EXT_ID_FILE = resolve(process.cwd(), 'test-results', '.extension-id');
export const TEST_SERVER_PORT_FILE = resolve(process.cwd(), 'test-results', '.test-server-port');
export const PROVIDER_INFO_FILE = resolve(process.cwd(), 'test-results', '.provider-info.json');

const OLLAMA_BASE = 'http://localhost:11434';
const OLLAMA_MODEL = 'qwen3:14b';
const OPENAI_MODEL = 'gpt-5-nano';
const WARMUP_TIMEOUT_MS = 300_000;
const HEALTH_TIMEOUT_MS = 10_000;

export type ProviderInfo =
  | { provider: 'ollama'; endpoint: string; model: string }
  | { provider: 'openai'; model: string };

// ---------------------------------------------------------------------------
// Ollama helpers
// ---------------------------------------------------------------------------

async function probeOllama(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function checkOllamaModel(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal });
  clearTimeout(timer);

  if (!res.ok) throw new Error(`[global-setup] /api/tags returned HTTP ${res.status}.`);

  const json = (await res.json()) as { models?: Array<{ name: string }> };
  const found = (json.models ?? []).some(
    (m) => m.name === OLLAMA_MODEL || m.name.startsWith(OLLAMA_MODEL),
  );
  if (!found) {
    const names = (json.models ?? []).map((m) => m.name).join(', ') || '(none)';
    throw new Error(
      `[global-setup] Model "${OLLAMA_MODEL}" is not present in Ollama.\n` +
      `Pull it with: ollama pull ${OLLAMA_MODEL}\n` +
      `Models currently available: ${names}`,
    );
  }
  console.log(`[global-setup] Ollama: model "${OLLAMA_MODEL}" found.`);
}

async function warmupOllama(): Promise<void> {
  console.log(
    `[global-setup] Warming up "${OLLAMA_MODEL}" (may take several minutes on cold start)...`,
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
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Reply with a single word: ready' },
        ],
        temperature: 0,
        max_tokens: 5,
        options: { think: false },
      }),
    });
    clearTimeout(timer);
  } catch (err) {
    clearTimeout(timer);
    throw new Error(
      `[global-setup] Ollama warmup failed or timed out after ${WARMUP_TIMEOUT_MS / 1000} s.\n` +
      `Original error: ${String(err)}`,
      { cause: err },
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[global-setup] Warmup returned HTTP ${res.status}. Body: ${body}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const reply = json.choices?.[0]?.message?.content ?? '';
  console.log(`[global-setup] Ollama warmup complete. Reply: "${reply.trim()}"`);
}

// ---------------------------------------------------------------------------
// OpenAI helpers
// ---------------------------------------------------------------------------

async function probeOpenAI(apiKey: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Extension ID resolution
// ---------------------------------------------------------------------------

async function resolveExtensionId(): Promise<string> {
  const userDataDir = resolve(process.cwd(), 'test-results', '.chrome-profile');
  mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
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

  let extensionId = '';
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
    await new Promise<void>((r) => setTimeout(r, 300));
  }

  await context.close();

  if (!extensionId) {
    throw new Error(
      '[global-setup] Could not resolve extension ID. ' +
      'Make sure dist-test/ exists (run: pnpm build:test) and the extension loads without errors.',
    );
  }

  return extensionId;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

let _serverClose: (() => Promise<void>) | null = null;

export default async function globalSetup(): Promise<() => Promise<void>> {
  mkdirSync(resolve(process.cwd(), 'test-results'), { recursive: true });

  let providerInfo: ProviderInfo;

  // --- Try Ollama first ---
  const ollamaReachable = await probeOllama();

  if (ollamaReachable) {
    await checkOllamaModel();
    await warmupOllama();
    providerInfo = { provider: 'ollama', endpoint: OLLAMA_BASE, model: OLLAMA_MODEL };
    console.log('[global-setup] Active E2E provider: Ollama');
  } else {
    // --- Ollama not available: try OpenAI ---
    console.warn(
      '\n[global-setup] WARNING: Ollama is not reachable at ' + OLLAMA_BASE + '.\n' +
      '  Ollama-specific tests will be skipped.\n' +
      '  Checking for OpenAI fallback (OPENAI_API_KEY)...\n',
    );

    const openAIKey = process.env['OPENAI_API_KEY'] ?? '';
    if (!openAIKey) {
      throw new Error(
        '[global-setup] Neither Ollama nor OpenAI is available.\n' +
        '  To use Ollama: run `ollama serve` and `ollama pull ' + OLLAMA_MODEL + '`\n' +
        '  To use OpenAI: export OPENAI_API_KEY=sk-...',
      );
    }

    const openAIReachable = await probeOpenAI(openAIKey);
    if (!openAIReachable) {
      throw new Error(
        '[global-setup] OPENAI_API_KEY is set but the key was rejected by api.openai.com.\n' +
        '  Verify the key is valid and has sufficient quota.',
      );
    }

    providerInfo = { provider: 'openai', model: OPENAI_MODEL };
    console.log(`[global-setup] Active E2E provider: OpenAI (${OPENAI_MODEL})`);
  }

  // Write provider info so fixtures and tests can read it.
  writeFileSync(PROVIDER_INFO_FILE, JSON.stringify(providerInfo), 'utf8');

  // Start the local HTTP static server for test pages.
  const server = await startTestServer();
  _serverClose = server.close;
  writeFileSync(TEST_SERVER_PORT_FILE, String(server.port), 'utf8');
  console.log(`[global-setup] Test page server listening on port ${server.port}.`);

  // Resolve extension ID from the test build.
  const extensionId = await resolveExtensionId();
  writeFileSync(EXT_ID_FILE, extensionId, 'utf8');
  console.log(`[global-setup] Extension ID: ${extensionId}`);
  console.log('[global-setup] Preconditions satisfied. Starting tests.');

  return async () => {
    if (_serverClose) {
      await _serverClose();
      _serverClose = null;
    }
  };
}
