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
});

// ============================================================
// StatusIndicator
// ============================================================

describe('StatusIndicator', () => {
  it('renders without crashing', async () => {
    const { StatusIndicator } = await import('../../src/popup/components/StatusIndicator.tsx');

    const { container } = render(<StatusIndicator />);
    // Should render some element
    expect(container.firstChild).toBeTruthy();
  });

  it('initially shows "Checking Ollama..." status', async () => {
    const { StatusIndicator } = await import('../../src/popup/components/StatusIndicator.tsx');

    const { container } = render(<StatusIndicator />);
    // Before the async health check resolves, it shows "checking" state
    expect(within(container).getByText(/checking/i)).toBeInTheDocument();
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
