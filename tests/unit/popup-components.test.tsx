// tests/unit/popup-components.test.tsx
// Unit tests for popup React components.
// Uses jsdom environment for DOM rendering.

// @vitest-environment jsdom

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, within, cleanup } from '@testing-library/react';
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
        sourceLanguageOverride: null,
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
