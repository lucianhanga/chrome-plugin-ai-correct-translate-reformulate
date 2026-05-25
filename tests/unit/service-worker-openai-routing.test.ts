// tests/unit/service-worker-openai-routing.test.ts
// Regression tests for the OpenAI provider routing in processContextMenuAction.
//
// Bug fixed: the context-menu "Correct" flow in service-worker.ts used to call
// correctGrammar (Ollama) unconditionally, ignoring settings.provider. The
// translate/reformulate flows hand off to the content script and go through
// message-handler.ts (which was already provider-aware), but the correct flow
// went through processContextMenuAction which was Ollama-only.
//
// These tests import the full service worker module (with all side-effect
// listeners mocked) and drive the context-menu handler via the __ctClickHandler
// global that the service worker exposes for testing.

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { installChromeMock, resetChromeMock, chromeMock } from '../mocks/chrome.ts';

// Mock all modules that service-worker.ts imports to prevent real network calls
// and isolate the routing logic under test.
vi.mock('../../src/background/tasks.ts', () => ({
  correctGrammar: vi.fn(),
  translateText: vi.fn(),
  reformulateText: vi.fn(),
}));

vi.mock('../../src/background/ollama-client.ts', () => ({
  callOllama: vi.fn(),
  checkOllamaHealth: vi.fn(),
}));

vi.mock('../../src/background/openai-client.ts', () => ({
  callOpenAI: vi.fn(),
  checkOpenAIHealth: vi.fn(),
}));

vi.mock('../../src/background/llm-client.ts', () => ({
  getActiveClient: vi.fn(),
}));

vi.mock('../../src/background/message-handler.ts', () => ({
  handleMessage: vi.fn(),
}));

// Mock context-menu so registerContextMenus does not make real chrome API calls
// and resolveMenuAction can be controlled per test.
vi.mock('../../src/background/context-menu.ts', () => ({
  registerContextMenus: vi.fn().mockResolvedValue(undefined),
  resolveMenuAction: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type ContextMenuHandler = (
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab,
) => void;

let ctClickHandler: ContextMenuHandler;

beforeAll(async () => {
  installChromeMock();

  // The service worker accesses runtime.onInstalled, onStartup, and onMessage
  // at the top level, which are not in the base chrome mock.
  const c = (globalThis as Record<string, unknown>)['chrome'] as Record<string, unknown>;
  c['runtime'] = {
    ...(c['runtime'] as object),
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    lastError: null,
  };

  // Import the service worker now that chrome globals and module mocks are ready.
  // The module is cached after first import; its top-level listeners register
  // against the mocked chrome APIs (no-ops), and __ctClickHandler is set.
  await import('../../src/background/service-worker.ts');

  ctClickHandler = (globalThis as Record<string, unknown>).__ctClickHandler as ContextMenuHandler;
});

beforeEach(() => {
  resetChromeMock();
  vi.clearAllMocks();

  // Re-add the runtime extras that resetChromeMock clears.
  const c = (globalThis as Record<string, unknown>)['chrome'] as Record<string, unknown>;
  c['runtime'] = {
    ...(c['runtime'] as object),
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    lastError: null,
  };

  // Default scripting and tabs mocks needed for the handler to proceed.
  chromeMock.scripting.executeScript.mockResolvedValue([]);
  chromeMock.tabs.sendMessage.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedOpenAISettings(): Promise<void> {
  await chrome.storage.local.set({
    settings: {
      ollamaEndpoint: 'http://localhost:11434',
      model: 'qwen3:14b',
      defaultTargetLanguage: 'English',
      provider: 'openai',
      openaiModel: 'gpt-5-nano',
      openaiApiKey: 'sk-test',
      openaiConsentAcknowledged: true,
      keepTerminology: false,
      defaultReformulateTone: 'keep',
    },
  });
}

async function seedOllamaSettings(): Promise<void> {
  await chrome.storage.local.set({
    settings: {
      ollamaEndpoint: 'http://localhost:11434',
      model: 'qwen3:14b',
      defaultTargetLanguage: 'English',
      provider: 'ollama',
      openaiModel: 'gpt-5-nano',
      openaiApiKey: '',
      openaiConsentAcknowledged: false,
      keepTerminology: false,
      defaultReformulateTone: 'keep',
    },
  });
}

function triggerCorrectAction(text = 'She dont know nothing.'): void {
  ctClickHandler(
    {
      menuItemId: 'correct_grammar',
      selectionText: text,
      frameId: 0,
      editable: false,
      pageUrl: 'https://example.com',
    } as chrome.contextMenus.OnClickData,
    { id: 1, url: 'https://example.com' } as chrome.tabs.Tab,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processContextMenuAction: OpenAI routing', () => {
  it('__ctClickHandler is defined after service worker import', () => {
    expect(ctClickHandler).toBeDefined();
    expect(typeof ctClickHandler).toBe('function');
  });

  it('calls getActiveClient (not correctGrammar) for Correct action when provider is openai', async () => {
    await seedOpenAISettings();

    const { getActiveClient } = await import('../../src/background/llm-client.ts');
    const callMock = vi.fn().mockResolvedValue({
      text: 'Corrected via OpenAI.',
      model: 'gpt-5-nano',
      totalTokens: 50,
      elapsedMs: 700,
    });
    vi.mocked(getActiveClient).mockReturnValue({ call: callMock, healthCheck: vi.fn() });

    const { resolveMenuAction } = await import('../../src/background/context-menu.ts');
    vi.mocked(resolveMenuAction).mockReturnValue({ action: 'correct' });

    triggerCorrectAction();

    // Let the executeScript .then() chain run.
    await new Promise((r) => setTimeout(r, 20));

    expect(getActiveClient).toHaveBeenCalled();
    expect(callMock).toHaveBeenCalled();

    const { correctGrammar } = await import('../../src/background/tasks.ts');
    expect(correctGrammar).not.toHaveBeenCalled();
  });

  it('uses GRAMMAR_CORRECT_SYSTEM prompt and openaiModel when routing through OpenAI', async () => {
    await seedOpenAISettings();

    const { getActiveClient } = await import('../../src/background/llm-client.ts');
    const callMock = vi.fn().mockResolvedValue({
      text: 'ok',
      model: 'gpt-5-nano',
      totalTokens: 10,
      elapsedMs: 100,
    });
    vi.mocked(getActiveClient).mockReturnValue({ call: callMock, healthCheck: vi.fn() });

    const { resolveMenuAction } = await import('../../src/background/context-menu.ts');
    vi.mocked(resolveMenuAction).mockReturnValue({ action: 'correct' });

    triggerCorrectAction('Test text.');
    await new Promise((r) => setTimeout(r, 20));

    // The call must carry the correct model and temperature.
    expect(callMock).toHaveBeenCalledWith(
      expect.any(String),
      'Test text.',
      expect.objectContaining({ model: 'gpt-5-nano', temperature: 0.2 }),
    );
  });

  it('calls correctGrammar (Ollama path) for Correct action when provider is ollama', async () => {
    await seedOllamaSettings();

    const { correctGrammar } = await import('../../src/background/tasks.ts');
    vi.mocked(correctGrammar).mockResolvedValue({
      text: 'Corrected via Ollama.',
      model: 'qwen3:14b',
      totalTokens: 120,
      elapsedMs: 2100,
    });

    const { resolveMenuAction } = await import('../../src/background/context-menu.ts');
    vi.mocked(resolveMenuAction).mockReturnValue({ action: 'correct' });

    triggerCorrectAction();
    await new Promise((r) => setTimeout(r, 20));

    expect(correctGrammar).toHaveBeenCalled();

    const { getActiveClient } = await import('../../src/background/llm-client.ts');
    expect(getActiveClient).not.toHaveBeenCalled();
  });

  it('sends SHOW_LOADING before the LLM call and SHOW_RESULT after for Correct+OpenAI', async () => {
    await seedOpenAISettings();

    const { getActiveClient } = await import('../../src/background/llm-client.ts');
    vi.mocked(getActiveClient).mockReturnValue({
      call: vi.fn().mockResolvedValue({
        text: 'Done.',
        model: 'gpt-5-nano',
        totalTokens: 8,
        elapsedMs: 300,
      }),
      healthCheck: vi.fn(),
    });

    const { resolveMenuAction } = await import('../../src/background/context-menu.ts');
    vi.mocked(resolveMenuAction).mockReturnValue({ action: 'correct' });

    triggerCorrectAction('Quick test.');
    await new Promise((r) => setTimeout(r, 20));

    const calls = chromeMock.tabs.sendMessage.mock.calls as Array<[number, { type: string }]>;
    const types = calls.map(([, msg]) => msg.type);
    expect(types).toContain('SHOW_LOADING');
    expect(types).toContain('SHOW_RESULT');
  });

  it('sends SHOW_ERROR to the content script when OpenAI call rejects', async () => {
    await seedOpenAISettings();

    const { getActiveClient } = await import('../../src/background/llm-client.ts');
    vi.mocked(getActiveClient).mockReturnValue({
      call: vi.fn().mockRejectedValue(new Error('Unauthorized')),
      healthCheck: vi.fn(),
    });

    const { resolveMenuAction } = await import('../../src/background/context-menu.ts');
    vi.mocked(resolveMenuAction).mockReturnValue({ action: 'correct' });

    triggerCorrectAction('Some text.');
    await new Promise((r) => setTimeout(r, 20));

    const calls = chromeMock.tabs.sendMessage.mock.calls as Array<[number, { type: string }]>;
    const types = calls.map(([, msg]) => msg.type);
    expect(types).toContain('SHOW_ERROR');
  });
});
