// src/popup/components/SettingsSection.tsx
// Settings form: provider selector, Ollama endpoint + model, OpenAI key + model,
// default target language.

import React, { useState } from 'react';
import type { ExtensionSettings, SupportedLanguage, LLMProvider, OpenAIModel } from '../../shared/types.ts';
import {
  DEFAULT_OLLAMA_ENDPOINT,
  AVAILABLE_OPENAI_MODELS,
} from '../../shared/constants.ts';
import { LanguageSelector } from './LanguageSelector.tsx';

const AVAILABLE_OLLAMA_MODELS = [
  'qwen3.6:35b-a3b',
  'qwen3:14b',
] as const;

// Sentinel returned by GET_SETTINGS when a key is stored but redacted.
const KEY_SET_SENTINEL = '__SET__';
// Masked placeholder shown in the password field when a key is already saved.
const MASKED_PLACEHOLDER = '••••••••••••••••';

interface SettingsSectionProps {
  settings: ExtensionSettings;
  onSaved: () => void;
}

export function SettingsSection({ settings, onSaved }: SettingsSectionProps): React.ReactElement {
  const [provider, setProvider] = useState<LLMProvider>(settings.provider);

  // Ollama fields
  const [endpoint, setEndpoint] = useState(settings.ollamaEndpoint);
  const [model, setModel] = useState(settings.model);

  // OpenAI fields
  // The key from settings is the __SET__ sentinel (or ''). We track whether a
  // key is already saved, and let the user type a new one (stored in apiKeyInput).
  const keyAlreadySaved = settings.openaiApiKey === KEY_SET_SENTINEL || settings.openaiApiKey.length > 0;
  const [openaiModel, setOpenaiModel] = useState<OpenAIModel>(settings.openaiModel);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyDirty, setApiKeyDirty] = useState(false); // user has typed into the key field
  const [keyValidating, setKeyValidating] = useState(false);
  const [keyValidResult, setKeyValidResult] = useState<{ valid: boolean; error: string | null } | null>(null);

  // Language fields
  const [defaultTargetLanguage, setDefaultTargetLanguage] = useState<SupportedLanguage>(
    settings.defaultTargetLanguage,
  );

  // Consent dialog state
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<LLMProvider | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ============================================================
  // Provider selection (consent gate for OpenAI)
  // ============================================================

  const handleProviderChange = (newProvider: LLMProvider): void => {
    if (newProvider === 'openai' && !settings.openaiConsentAcknowledged) {
      // Gate: show consent dialog before switching
      setPendingProvider(newProvider);
      setShowConsentDialog(true);
    } else {
      setProvider(newProvider);
    }
  };

  const handleConsentConfirm = (): void => {
    if (pendingProvider !== null) {
      setProvider(pendingProvider);
    }
    setShowConsentDialog(false);
    setPendingProvider(null);
  };

  const handleConsentCancel = (): void => {
    setShowConsentDialog(false);
    setPendingProvider(null);
    // Provider selector stays on its current value (Ollama).
  };

  // ============================================================
  // Key validation (validate without saving)
  // ============================================================

  const handleValidateKey = async (): Promise<void> => {
    const keyToValidate = apiKeyDirty ? apiKeyInput.trim() : '';
    if (!keyToValidate) {
      setKeyValidResult({ valid: false, error: 'Enter an API key to validate.' });
      return;
    }
    setKeyValidating(true);
    setKeyValidResult(null);
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'VALIDATE_OPENAI_KEY',
        payload: { key: keyToValidate, model: openaiModel },
      }) as { success: boolean; valid?: boolean; modelFound?: boolean; error?: string | null };

      if (resp.success && resp.valid) {
        setKeyValidResult({ valid: true, error: null });
      } else {
        setKeyValidResult({ valid: false, error: resp.error ?? 'Key validation failed.' });
      }
    } catch {
      setKeyValidResult({ valid: false, error: 'Could not reach the extension service worker.' });
    } finally {
      setKeyValidating(false);
    }
  };

  // ============================================================
  // Save
  // ============================================================

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Build the partial settings to save.
      const partialSettings: Partial<ExtensionSettings> = {
        ollamaEndpoint: endpoint.trim() || DEFAULT_OLLAMA_ENDPOINT,
        model,
        defaultTargetLanguage,
        provider,
        openaiModel,
        // Only save the key if the user has typed a new one.
        // Sending the sentinel means "do not overwrite" (handled in message-handler).
        openaiApiKey: apiKeyDirty && apiKeyInput.trim() ? apiKeyInput.trim() : KEY_SET_SENTINEL,
      };

      // Acknowledge consent if the user is switching to OpenAI.
      if (provider === 'openai') {
        partialSettings.openaiConsentAcknowledged = true;
      }

      await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        payload: { settings: partialSettings },
      });

      setSaveSuccess(true);
      // Clear the dirty key field after a successful save.
      setApiKeyDirty(false);
      setApiKeyInput('');
      setKeyValidResult(null);
      onSaved();
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setSaveError('Failed to save settings. Please try again.');
      console.error('[SettingsSection] save error:', err);
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="flex flex-col gap-3">

      {/* Consent dialog (modal) */}
      {showConsentDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          aria-modal="true"
          role="dialog"
          aria-labelledby="consent-title"
        >
          <div
            className="mx-4 rounded-lg border border-[#313244] p-5 flex flex-col gap-4"
            style={{ backgroundColor: '#1e1e2e', maxWidth: '340px' }}
          >
            <h3
              id="consent-title"
              className="text-sm font-bold text-[#cdd6f4]"
            >
              Data egress notice
            </h3>
            <p className="text-xs text-[#a6adc8]">
              When using OpenAI, your selected text will be sent over the internet
              to OpenAI for processing. This text leaves your machine and is subject
              to{' '}
              <a
                href="https://openai.com/policies/api-data-usage-policies/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-[#89b4fa]"
              >
                OpenAI's API data usage policy
              </a>
              .
            </p>
            <p className="text-xs text-[#a6adc8]">
              Ollama remains available and keeps all text local. You can switch back
              at any time.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleConsentCancel}
                className="
                  px-3 py-1.5 rounded text-xs font-medium border border-[#45475a]
                  text-[#a6adc8] hover:border-[#cdd6f4]
                  focus:outline-none focus:ring-2 focus:ring-[#22c55e]
                "
              >
                Cancel
              </button>
              <button
                onClick={handleConsentConfirm}
                className="
                  px-3 py-1.5 rounded text-xs font-medium
                  bg-[#eab308] text-[#1e1e2e] font-semibold
                  hover:brightness-110
                  focus:outline-none focus:ring-2 focus:ring-[#eab308]
                "
              >
                I understand, use OpenAI
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provider Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide">
          Provider
        </label>
        <div className="flex gap-2">
          {(['ollama', 'openai'] as const).map((p) => (
            <button
              key={p}
              onClick={() => handleProviderChange(p)}
              className={`
                flex-1 py-1.5 rounded text-xs font-semibold border transition-colors duration-100
                focus:outline-none focus:ring-2 focus:ring-[#22c55e]
                ${provider === p
                  ? 'bg-[#22c55e] border-[#22c55e] text-[#1e1e2e]'
                  : 'bg-transparent border-[#45475a] text-[#a6adc8] hover:border-[#cdd6f4]'}
              `}
            >
              {p === 'ollama' ? 'Ollama (local)' : 'OpenAI'}
            </button>
          ))}
        </div>
      </div>

      {/* Ollama Settings */}
      {provider === 'ollama' && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide">
              Ollama Endpoint
            </label>
            <input
              type="url"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder={DEFAULT_OLLAMA_ENDPOINT}
              className="
                bg-[#181825] text-[#cdd6f4] border border-[#313244]
                rounded-md px-2 py-1.5 text-sm
                focus:outline-none focus:ring-2 focus:ring-[#22c55e] focus:border-transparent
                placeholder:text-[#45475a]
              "
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide">
              Model
            </label>
            <select
              data-testid="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="
                bg-[#181825] text-[#cdd6f4] border border-[#313244]
                rounded-md px-2 py-1.5 text-sm
                focus:outline-none focus:ring-2 focus:ring-[#22c55e] focus:border-transparent
                cursor-pointer
              "
            >
              {AVAILABLE_OLLAMA_MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
              {!AVAILABLE_OLLAMA_MODELS.includes(model as typeof AVAILABLE_OLLAMA_MODELS[number]) && model && (
                <option value={model}>{model}</option>
              )}
            </select>
          </div>
        </>
      )}

      {/* OpenAI Settings */}
      {provider === 'openai' && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide">
              OpenAI Model
            </label>
            <select
              value={openaiModel}
              onChange={(e) => setOpenaiModel(e.target.value as OpenAIModel)}
              className="
                bg-[#181825] text-[#cdd6f4] border border-[#313244]
                rounded-md px-2 py-1.5 text-sm
                focus:outline-none focus:ring-2 focus:ring-[#22c55e] focus:border-transparent
                cursor-pointer
              "
            >
              {AVAILABLE_OPENAI_MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide">
              OpenAI API Key
            </label>
            <div className="flex gap-1">
              <input
                type="password"
                value={apiKeyDirty ? apiKeyInput : ''}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setApiKeyDirty(true);
                  setKeyValidResult(null);
                }}
                placeholder={keyAlreadySaved ? MASKED_PLACEHOLDER : 'sk-...'}
                autoComplete="off"
                className="
                  flex-1 bg-[#181825] text-[#cdd6f4] border border-[#313244]
                  rounded-md px-2 py-1.5 text-sm
                  focus:outline-none focus:ring-2 focus:ring-[#22c55e] focus:border-transparent
                  placeholder:text-[#45475a]
                "
              />
              <button
                onClick={() => {
                  handleValidateKey().catch((err: unknown) => {
                    console.error('[SettingsSection] validate key error:', err);
                  });
                }}
                disabled={keyValidating || (!apiKeyDirty && !keyAlreadySaved)}
                className="
                  px-2 py-1.5 rounded-md text-xs font-semibold border border-[#313244]
                  text-[#a6adc8] hover:border-[#cdd6f4]
                  disabled:opacity-40 disabled:cursor-not-allowed
                  focus:outline-none focus:ring-2 focus:ring-[#22c55e]
                  whitespace-nowrap
                "
              >
                {keyValidating ? 'Checking...' : 'Validate'}
              </button>
            </div>
            {keyAlreadySaved && !apiKeyDirty && (
              <p className="text-[11px] text-[#585b70]">
                A key is saved. Enter a new key to replace it.
              </p>
            )}
            {keyValidResult !== null && (
              <p
                className="text-[11px]"
                style={{ color: keyValidResult.valid ? '#22c55e' : '#ef4444' }}
              >
                {keyValidResult.valid
                  ? 'Key is valid and model is accessible.'
                  : (keyValidResult.error ?? 'Validation failed.')}
              </p>
            )}
          </div>
        </>
      )}

      {/* Default Target Language */}
      <LanguageSelector
        label="Default Target Language"
        value={defaultTargetLanguage}
        onChange={(v) => {
          if (v !== null) setDefaultTargetLanguage(v);
        }}
        includeAutoDetect={false}
      />

      {/* Save button + feedback */}
      <div className="flex flex-col gap-1">
        <button
          onClick={() => {
            handleSave().catch((err: unknown) => {
              console.error('[SettingsSection] handleSave error:', err);
            });
          }}
          disabled={saving}
          className="
            w-full py-2 rounded-md text-sm font-semibold
            bg-[#22c55e] text-[#1e1e2e]
            hover:brightness-110 active:brightness-90
            transition-all duration-100
            focus:outline-none focus:ring-2 focus:ring-[#22c55e] focus:ring-offset-1 focus:ring-offset-[#1e1e2e]
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {saveSuccess && (
          <p className="text-xs text-center" style={{ color: '#22c55e' }}>
            Settings saved.
          </p>
        )}
        {saveError && (
          <p className="text-xs text-center" style={{ color: '#ef4444' }}>
            {saveError}
          </p>
        )}
      </div>
    </div>
  );
}
