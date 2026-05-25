/// <reference types="node" />
// tests/helpers/provider-check.ts
// Reads the availability flags set by unit-global-setup and exports skip helpers
// for tests that require a specific backend to be present.

export const ollamaAvailable: boolean = process.env.OLLAMA_AVAILABLE === 'true';
export const openAIKeyAvailable: boolean = process.env.OPENAI_KEY_AVAILABLE === 'true';

// Use with it.skipIf / describe.skipIf:
//   it.skipIf(needsOllama)('my test', ...)
//
// Skips with a console warning when Ollama is not reachable.
// All current unit tests mock the network, so in practice this flag is only
// needed for future integration tests that hit a real Ollama instance.
export const needsOllama: boolean = !ollamaAvailable;

// Use with it.skipIf / describe.skipIf for tests that require a real OpenAI key.
export const needsOpenAIKey: boolean = !openAIKeyAvailable;
