// tests/unit/popup-components.test.tsx
// Unit tests for popup React components.
// Uses jsdom environment for DOM rendering.

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, within, waitFor, cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest'; // augments vitest Assertion with jest-dom matchers
import { expect as vitestExpect } from 'vitest';
import { installChromeMock, resetChromeMock } from '../mocks/chrome.ts';

// Extend vitest's expect with jest-dom matchers (without requiring globals: true)
vitestExpect.extend(matchers);

// ============================================================
// Setup / teardown
// ============================================================

beforeAll(() => {
  installChromeMock();
});

beforeEach(() => {
  resetChromeMock();
});

afterEach(() => {
  cleanup();
});

// ============================================================
// LanguageSelector
// ============================================================

describe('LanguageSelector', () => {
  it('renders label and all language options when includeAutoDetect is false', async () => {
    const { LanguageSelector } = await import('../../src/popup/components/LanguageSelector.tsx');

    const { container } = render(
      <LanguageSelector
        label="Target Language"
        value="English"
        onChange={() => undefined}
        includeAutoDetect={false}
      />,
    );

    expect(within(container).getByText('Target Language')).toBeInTheDocument();
    const select = within(container).getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('English');

    const options = within(container).getAllByRole('option');
    const optionValues = options.map((o) => (o as HTMLOptionElement).value);
    expect(optionValues).toContain('English');
    expect(optionValues).toContain('German');
    expect(optionValues).toContain('Romanian');
    expect(optionValues).not.toContain('auto');
  });

  it('renders Auto-detect option when includeAutoDetect is true', async () => {
    const { LanguageSelector } = await import('../../src/popup/components/LanguageSelector.tsx');

    const { container } = render(
      <LanguageSelector
        label="Source"
        value={null}
        onChange={() => undefined}
        includeAutoDetect={true}
      />,
    );

    const select = within(container).getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('auto');

    const options = within(container).getAllByRole('option');
    const optionValues = options.map((o) => (o as HTMLOptionElement).value);
    expect(optionValues).toContain('auto');
  });

  it('calls onChange with null when Auto-detect is selected', async () => {
    const { LanguageSelector } = await import('../../src/popup/components/LanguageSelector.tsx');

    let received: string | null = 'English';
    const { container } = render(
      <LanguageSelector
        label="Source"
        value="English"
        onChange={(v) => { received = v; }}
        includeAutoDetect={true}
      />,
    );

    fireEvent.change(within(container).getByRole('combobox'), { target: { value: 'auto' } });
    expect(received).toBe(null);
  });

  it('calls onChange with the selected language string', async () => {
    const { LanguageSelector } = await import('../../src/popup/components/LanguageSelector.tsx');

    let received: string | null = null;
    const { container } = render(
      <LanguageSelector
        label="Target"
        value="English"
        onChange={(v) => { received = v; }}
        includeAutoDetect={false}
      />,
    );

    fireEvent.change(within(container).getByRole('combobox'), { target: { value: 'Romanian' } });
    expect(received).toBe('Romanian');
  });
});

// ============================================================
// ResultDisplay
// ============================================================

describe('ResultDisplay', () => {
  it('renders original and result text', async () => {
    const { ResultDisplay } = await import('../../src/popup/components/ResultDisplay.tsx');

    const { container } = render(
      <ResultDisplay
        originalText="She dont know."
        resultText="She does not know."
      />,
    );

    expect(within(container).getByText('She dont know.')).toBeInTheDocument();
    expect(within(container).getByText('She does not know.')).toBeInTheDocument();
  });

  it('auto-copies the result and shows the copied confirmation (no action buttons)', async () => {
    const { ResultDisplay } = await import('../../src/popup/components/ResultDisplay.tsx');

    const { container } = render(
      <ResultDisplay originalText="test" resultText="result" />,
    );

    // The result is copied automatically; a confirmation is shown.
    expect(within(container).getByTestId('copied-hint')).toBeInTheDocument();
    // There are no Replace / Append / Copy / Clear buttons.
    expect(within(container).queryByRole('button')).toBeNull();
  });

  it('renders the metadata line (model, tokens, elapsed) when metadata is supplied', async () => {
    const { ResultDisplay } = await import('../../src/popup/components/ResultDisplay.tsx');

    const { container } = render(
      <ResultDisplay
        originalText="test"
        resultText="result"
        model="qwen3:14b"
        totalTokens={142}
        elapsedMs={2400}
      />,
    );

    const meta = within(container).getByTestId('result-meta');
    expect(meta).toHaveTextContent('qwen3:14b');
    expect(meta).toHaveTextContent('142 tokens');
    // 2400 ms is formatted as "2.4 s".
    expect(meta).toHaveTextContent('2.4 s');
  });

  it('omits the metadata line entirely when no model is supplied', async () => {
    const { ResultDisplay } = await import('../../src/popup/components/ResultDisplay.tsx');

    const { container } = render(
      <ResultDisplay originalText="test" resultText="result" />,
    );

    expect(within(container).queryByTestId('result-meta')).toBeNull();
  });

  it('drops the token segment when totalTokens is null but still shows model and time', async () => {
    const { ResultDisplay } = await import('../../src/popup/components/ResultDisplay.tsx');

    const { container } = render(
      <ResultDisplay
        originalText="test"
        resultText="result"
        model="qwen3:14b"
        totalTokens={null}
        elapsedMs={1500}
      />,
    );

    const meta = within(container).getByTestId('result-meta');
    expect(meta).toHaveTextContent('qwen3:14b');
    expect(meta).not.toHaveTextContent('tokens');
    expect(meta).toHaveTextContent('1.5 s');
  });
});

// ============================================================
// ToneSelector
// ============================================================

describe('ToneSelector', () => {
  it('renders all four tone options', async () => {
    const { ToneSelector } = await import('../../src/popup/components/ToneSelector.tsx');

    const { container } = render(
      <ToneSelector value="keep" onChange={() => undefined} />,
    );

    const options = within(container).getAllByRole('option') as HTMLOptionElement[];
    const values = options.map((o) => o.value);
    expect(values).toContain('keep');
    expect(values).toContain('professional');
    expect(values).toContain('friendly');
    expect(values).toContain('natural');
    expect(values).toHaveLength(4);
  });

  it('shows the correct selected value', async () => {
    const { ToneSelector } = await import('../../src/popup/components/ToneSelector.tsx');

    const { container } = render(
      <ToneSelector value="professional" onChange={() => undefined} />,
    );

    const select = within(container).getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('professional');
  });

  it('calls onChange with the selected tone when changed', async () => {
    const { ToneSelector } = await import('../../src/popup/components/ToneSelector.tsx');

    let received = '';
    const { container } = render(
      <ToneSelector value="keep" onChange={(v) => { received = v; }} />,
    );

    fireEvent.change(within(container).getByRole('combobox'), { target: { value: 'natural' } });
    expect(received).toBe('natural');
  });
});

// ============================================================
// QuickAction -- provider-aware loading text and result metadata
// ============================================================

describe('QuickAction', () => {
  it('shows "Processing with Ollama..." while a request is in flight when provider is ollama', async () => {
    const { chromeMock } = await import('../mocks/chrome.ts');
    // Keep the request pending so the loading indicator stays visible.
    let resolveSend: ((value: unknown) => void) | undefined;
    chromeMock.runtime.sendMessage.mockReturnValue(
      new Promise((resolve) => { resolveSend = resolve; }),
    );

    const { QuickAction } = await import('../../src/popup/components/QuickAction.tsx');
    const { container } = render(
      <QuickAction
        defaultTargetLanguage="English"
        provider="ollama"
        defaultReformulateTone="keep"
        keepTerminology={true}
      />,
    );

    fireEvent.change(within(container).getByPlaceholderText(/Paste or type/i), {
      target: { value: 'She dont know.' },
    });
    fireEvent.click(within(container).getByRole('button', { name: /^Correct$/i }));

    expect(await within(container).findByText(/Processing with Ollama/i)).toBeInTheDocument();
    resolveSend?.({ success: true, result: 'ok', model: 'qwen3:14b', totalTokens: 10, elapsedMs: 100 });
  });

  it('shows "Processing with OpenAI..." while a request is in flight when provider is openai', async () => {
    const { chromeMock } = await import('../mocks/chrome.ts');
    let resolveSend: ((value: unknown) => void) | undefined;
    chromeMock.runtime.sendMessage.mockReturnValue(
      new Promise((resolve) => { resolveSend = resolve; }),
    );

    const { QuickAction } = await import('../../src/popup/components/QuickAction.tsx');
    const { container } = render(
      <QuickAction
        defaultTargetLanguage="English"
        provider="openai"
        defaultReformulateTone="keep"
        keepTerminology={true}
      />,
    );

    fireEvent.change(within(container).getByPlaceholderText(/Paste or type/i), {
      target: { value: 'She dont know.' },
    });
    fireEvent.click(within(container).getByRole('button', { name: /^Correct$/i }));

    expect(await within(container).findByText(/Processing with OpenAI/i)).toBeInTheDocument();
    resolveSend?.({ success: true, result: 'ok', model: 'gpt-5-nano', totalTokens: 10, elapsedMs: 100 });
  });

  it('renders the result metadata line after a successful correction', async () => {
    const { chromeMock } = await import('../mocks/chrome.ts');
    chromeMock.runtime.sendMessage.mockResolvedValue({
      success: true,
      result: 'She does not know.',
      model: 'qwen3:14b',
      totalTokens: 142,
      elapsedMs: 2400,
    });

    const { QuickAction } = await import('../../src/popup/components/QuickAction.tsx');
    const { container } = render(
      <QuickAction
        defaultTargetLanguage="English"
        provider="ollama"
        defaultReformulateTone="keep"
        keepTerminology={true}
      />,
    );

    fireEvent.change(within(container).getByPlaceholderText(/Paste or type/i), {
      target: { value: 'She dont know.' },
    });
    fireEvent.click(within(container).getByRole('button', { name: /^Correct$/i }));

    const meta = await within(container).findByTestId('result-meta');
    expect(meta).toHaveTextContent('qwen3:14b');
    expect(meta).toHaveTextContent('142 tokens');
    expect(meta).toHaveTextContent('2.4 s');
  });

  it('renders the Reformulate button', async () => {
    const { QuickAction } = await import('../../src/popup/components/QuickAction.tsx');
    const { container } = render(
      <QuickAction
        defaultTargetLanguage="English"
        provider="ollama"
        defaultReformulateTone="keep"
        keepTerminology={true}
      />,
    );
    expect(within(container).getByRole('button', { name: /^Reformulate$/i })).toBeInTheDocument();
  });

  it('renders the ToneSelector with the default tone', async () => {
    const { QuickAction } = await import('../../src/popup/components/QuickAction.tsx');
    const { container } = render(
      <QuickAction
        defaultTargetLanguage="English"
        provider="ollama"
        defaultReformulateTone="professional"
        keepTerminology={true}
      />,
    );
    // The tone select should be present and have 'professional' as selected value.
    const selects = within(container).getAllByRole('combobox') as HTMLSelectElement[];
    const toneSelect = selects.find((s) => s.value === 'professional');
    expect(toneSelect).toBeDefined();
  });

  it('sends SAVE_SETTINGS when the tone is changed', async () => {
    const { chromeMock } = await import('../mocks/chrome.ts');
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });

    const { QuickAction } = await import('../../src/popup/components/QuickAction.tsx');
    const { container } = render(
      <QuickAction
        defaultTargetLanguage="English"
        provider="ollama"
        defaultReformulateTone="keep"
        keepTerminology={true}
      />,
    );

    // Find the tone selector (value 'keep') and change it to 'friendly'.
    const selects = within(container).getAllByRole('combobox') as HTMLSelectElement[];
    const toneSelect = selects.find((s) => s.value === 'keep');
    fireEvent.change(toneSelect!, { target: { value: 'friendly' } });

    await waitFor(() => {
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SAVE_SETTINGS',
          payload: expect.objectContaining({
            settings: expect.objectContaining({ defaultReformulateTone: 'friendly' }),
          }),
        }),
      );
    });
  });

  it('sends SAVE_SETTINGS when the keep-terminology checkbox is toggled', async () => {
    const { chromeMock } = await import('../mocks/chrome.ts');
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });

    const { QuickAction } = await import('../../src/popup/components/QuickAction.tsx');
    const { container } = render(
      <QuickAction
        defaultTargetLanguage="English"
        provider="ollama"
        defaultReformulateTone="keep"
        keepTerminology={true}
      />,
    );

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SAVE_SETTINGS',
          payload: expect.objectContaining({
            settings: expect.objectContaining({ keepTerminology: false }),
          }),
        }),
      );
    });
  });

  it('sends a REFORMULATE message when Reformulate is clicked', async () => {
    const { chromeMock } = await import('../mocks/chrome.ts');
    chromeMock.runtime.sendMessage.mockResolvedValue({
      success: true,
      result: 'Reformulated text.',
      model: 'qwen3:14b',
      totalTokens: 55,
      elapsedMs: 900,
    });

    const { QuickAction } = await import('../../src/popup/components/QuickAction.tsx');
    const { container } = render(
      <QuickAction
        defaultTargetLanguage="English"
        provider="ollama"
        defaultReformulateTone="professional"
        keepTerminology={false}
      />,
    );

    fireEvent.change(within(container).getByPlaceholderText(/Paste or type/i), {
      target: { value: 'Original text.' },
    });
    fireEvent.click(within(container).getByRole('button', { name: /^Reformulate$/i }));

    await waitFor(() => {
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REFORMULATE',
          payload: expect.objectContaining({
            text: 'Original text.',
            tone: 'professional',
            keepTerminology: false,
          }),
        }),
      );
    });
  });
});

// ============================================================
// StatusIndicator
// ============================================================

describe('StatusIndicator', () => {
  it('renders without crashing', async () => {
    const { StatusIndicator } = await import('../../src/popup/components/StatusIndicator.tsx');

    const { container } = render(<StatusIndicator provider="ollama" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('initially shows "Checking Ollama..." when provider is ollama', async () => {
    const { StatusIndicator } = await import('../../src/popup/components/StatusIndicator.tsx');

    const { container } = render(<StatusIndicator provider="ollama" />);
    expect(within(container).getByText(/Checking Ollama/i)).toBeInTheDocument();
  });

  it('initially shows "Checking OpenAI..." when provider is openai', async () => {
    const { StatusIndicator } = await import('../../src/popup/components/StatusIndicator.tsx');

    const { container } = render(<StatusIndicator provider="openai" />);
    expect(within(container).getByText(/Checking OpenAI/i)).toBeInTheDocument();
  });
});

// ============================================================
// SettingsSection -- provider toggle, OpenAI key field, consent dialog
// ============================================================

describe('SettingsSection', () => {
  const baseSettings = {
    ollamaEndpoint: 'http://localhost:11434',
    model: 'qwen3:14b',
    defaultTargetLanguage: 'English' as const,
    provider: 'ollama' as const,
    openaiModel: 'gpt-5-nano' as const,
    openaiApiKey: '',
    openaiConsentAcknowledged: false,
    keepTerminology: true,
    defaultReformulateTone: 'keep' as const,
  };

  it('renders the Ollama and OpenAI provider toggle buttons', async () => {
    const { SettingsSection } = await import('../../src/popup/components/SettingsSection.tsx');
    const { container } = render(
      <SettingsSection settings={baseSettings} onSaved={() => undefined} />,
    );
    expect(within(container).getByRole('button', { name: /Ollama \(local\)/i })).toBeInTheDocument();
    expect(within(container).getByRole('button', { name: /^OpenAI$/i })).toBeInTheDocument();
  });

  it('shows Ollama fields by default and no OpenAI API key field', async () => {
    const { SettingsSection } = await import('../../src/popup/components/SettingsSection.tsx');
    const { container } = render(
      <SettingsSection settings={baseSettings} onSaved={() => undefined} />,
    );
    expect(within(container).getByTestId('model-select')).toBeInTheDocument();
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it('shows the consent dialog when switching to OpenAI without prior acknowledgement', async () => {
    const { SettingsSection } = await import('../../src/popup/components/SettingsSection.tsx');
    const { container } = render(
      <SettingsSection settings={baseSettings} onSaved={() => undefined} />,
    );
    fireEvent.click(within(container).getByRole('button', { name: /^OpenAI$/i }));
    // The data-egress consent dialog gates the switch.
    expect(within(container).getByRole('dialog')).toBeInTheDocument();
    expect(within(container).getByText(/Data egress notice/i)).toBeInTheDocument();
    // The OpenAI key field is not shown yet -- the switch has not been confirmed.
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it('cancelling the consent dialog leaves the provider on Ollama', async () => {
    const { SettingsSection } = await import('../../src/popup/components/SettingsSection.tsx');
    const { container } = render(
      <SettingsSection settings={baseSettings} onSaved={() => undefined} />,
    );
    fireEvent.click(within(container).getByRole('button', { name: /^OpenAI$/i }));
    fireEvent.click(within(container).getByRole('button', { name: /^Cancel$/i }));
    expect(within(container).queryByRole('dialog')).toBeNull();
    // Still on Ollama: the Ollama model select is present, no key field.
    expect(within(container).getByTestId('model-select')).toBeInTheDocument();
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it('confirming the consent dialog reveals the OpenAI model and masked key field', async () => {
    const { SettingsSection } = await import('../../src/popup/components/SettingsSection.tsx');
    const { container } = render(
      <SettingsSection settings={baseSettings} onSaved={() => undefined} />,
    );
    fireEvent.click(within(container).getByRole('button', { name: /^OpenAI$/i }));
    fireEvent.click(
      within(container).getByRole('button', { name: /I understand, use OpenAI/i }),
    );
    expect(within(container).queryByRole('dialog')).toBeNull();
    // The API key field is a password input (masked).
    const keyField = container.querySelector('input[type="password"]');
    expect(keyField).not.toBeNull();
    // The Validate button accompanies the key field.
    expect(within(container).getByRole('button', { name: /Validate/i })).toBeInTheDocument();
  });

  it('does not show the consent dialog when consent was already acknowledged', async () => {
    const { SettingsSection } = await import('../../src/popup/components/SettingsSection.tsx');
    const { container } = render(
      <SettingsSection
        settings={{ ...baseSettings, openaiConsentAcknowledged: true }}
        onSaved={() => undefined}
      />,
    );
    fireEvent.click(within(container).getByRole('button', { name: /^OpenAI$/i }));
    // No dialog -- switch happens immediately.
    expect(within(container).queryByRole('dialog')).toBeNull();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('starts on the OpenAI provider when settings.provider is openai', async () => {
    const { SettingsSection } = await import('../../src/popup/components/SettingsSection.tsx');
    const { container } = render(
      <SettingsSection
        settings={{ ...baseSettings, provider: 'openai', openaiConsentAcknowledged: true }}
        onSaved={() => undefined}
      />,
    );
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('shows a "key is saved" hint when a redacted key sentinel is present', async () => {
    const { SettingsSection } = await import('../../src/popup/components/SettingsSection.tsx');
    const { container } = render(
      <SettingsSection
        settings={{
          ...baseSettings,
          provider: 'openai',
          openaiConsentAcknowledged: true,
          openaiApiKey: '__SET__',
        }}
        onSaved={() => undefined}
      />,
    );
    expect(within(container).getByText(/A key is saved/i)).toBeInTheDocument();
  });

  it('sends a SAVE_SETTINGS message when Save Settings is clicked', async () => {
    const { chromeMock } = await import('../mocks/chrome.ts');
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });

    const { SettingsSection } = await import('../../src/popup/components/SettingsSection.tsx');
    const onSaved = vi.fn();
    const { container } = render(
      <SettingsSection settings={baseSettings} onSaved={onSaved} />,
    );
    fireEvent.click(within(container).getByRole('button', { name: /Save Settings/i }));

    await waitFor(() => {
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SAVE_SETTINGS' }),
      );
    });
  });

  it('sends a VALIDATE_OPENAI_KEY message when a typed key is validated', async () => {
    const { chromeMock } = await import('../mocks/chrome.ts');
    chromeMock.runtime.sendMessage.mockResolvedValue({
      success: true,
      valid: true,
      modelFound: true,
      error: null,
    });

    const { SettingsSection } = await import('../../src/popup/components/SettingsSection.tsx');
    const { container } = render(
      <SettingsSection
        settings={{ ...baseSettings, provider: 'openai', openaiConsentAcknowledged: true }}
        onSaved={() => undefined}
      />,
    );
    const keyField = container.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(keyField, { target: { value: 'sk-typed-key' } });
    fireEvent.click(within(container).getByRole('button', { name: /Validate/i }));

    await waitFor(() => {
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'VALIDATE_OPENAI_KEY',
          payload: expect.objectContaining({ key: 'sk-typed-key' }),
        }),
      );
    });
  });
});

// ============================================================
// Popup root (smoke test)
// ============================================================

describe('Popup', () => {
  it('renders heading and Quick Action section', async () => {
    // Mock GET_SETTINGS to return settings immediately
    const { chromeMock } = await import('../mocks/chrome.ts');
    chromeMock.runtime.sendMessage.mockResolvedValue({
      success: true,
      settings: {
        ollamaEndpoint: 'http://localhost:11434',
        model: 'qwen3.6:35b-a3b',
        defaultTargetLanguage: 'English',
      },
    });

    const { Popup } = await import('../../src/popup/Popup.tsx');
    const { container } = render(<Popup />);

    // Header title should be present
    expect(within(container).getByText('Correct & Translate')).toBeInTheDocument();
    // Quick Action section label
    expect(within(container).getByText('Quick Action')).toBeInTheDocument();
    // Settings toggle button
    expect(within(container).getByText('Settings')).toBeInTheDocument();
  });
});
