/// <reference types="node" />
// tests/setup/unit-global-setup.ts
// Vitest globalSetup: runs once in the main process before any test worker starts.
// Sets process.env flags that tests can read to decide whether to skip provider-specific paths.

const OLLAMA_BASE = 'http://localhost:11434';

async function probeOllama(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<void> {
  const ollamaReachable = await probeOllama();
  process.env.OLLAMA_AVAILABLE = ollamaReachable ? 'true' : 'false';

  const openAIKeySet = !!process.env.OPENAI_API_KEY;
  process.env.OPENAI_KEY_AVAILABLE = openAIKeySet ? 'true' : 'false';

  if (!ollamaReachable) {
    console.warn(
      '\n[unit-global-setup] WARNING: Ollama is not reachable at ' + OLLAMA_BASE + '.\n' +
      '  Tests tagged as Ollama-only will be skipped.\n' +
      '  To enable them: start Ollama with `ollama serve`.\n',
    );
  }
  if (!openAIKeySet) {
    console.warn(
      '[unit-global-setup] WARNING: OPENAI_API_KEY is not set.\n' +
      '  Tests that need a real OpenAI key will be skipped.\n' +
      '  To enable them: export OPENAI_API_KEY=sk-...\n',
    );
  }
}
