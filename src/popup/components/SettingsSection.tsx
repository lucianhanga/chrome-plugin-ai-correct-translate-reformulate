// src/popup/components/SettingsSection.tsx
// Settings form: Ollama endpoint, model selector, default target language, source language override.

import React, { useState } from 'react';
import type { ExtensionSettings, SupportedLanguage } from '../../shared/types.ts';
import { SUPPORTED_LANGUAGES, DEFAULT_OLLAMA_ENDPOINT } from '../../shared/constants.ts';
import { LanguageSelector } from './LanguageSelector.tsx';

const AVAILABLE_MODELS = [
  'qwen3.6:35b-a3b',
  'qwen3:14b',
] as const;

interface SettingsSectionProps {
  settings: ExtensionSettings;
  onSaved: () => void;
}

export function SettingsSection({ settings, onSaved }: SettingsSectionProps): React.ReactElement {
  const [endpoint, setEndpoint] = useState(settings.ollamaEndpoint);
  const [model, setModel] = useState(settings.model);
  const [defaultTargetLanguage, setDefaultTargetLanguage] = useState<SupportedLanguage>(
    settings.defaultTargetLanguage,
  );
  const [sourceLanguageOverride, setSourceLanguageOverride] = useState<SupportedLanguage | null>(
    settings.sourceLanguageOverride,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        payload: {
          settings: {
            ollamaEndpoint: endpoint.trim() || DEFAULT_OLLAMA_ENDPOINT,
            model,
            defaultTargetLanguage,
            sourceLanguageOverride,
          },
        },
      });
      setSaveSuccess(true);
      onSaved();
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setSaveError('Failed to save settings. Please try again.');
      console.error('[SettingsSection] save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Ollama Endpoint */}
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

      {/* Model */}
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
          {AVAILABLE_MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          {/* Allow custom model names not in the preset list */}
          {!AVAILABLE_MODELS.includes(model as typeof AVAILABLE_MODELS[number]) && model && (
            <option value={model}>{model}</option>
          )}
        </select>
      </div>

      {/* Default Target Language */}
      <LanguageSelector
        label="Default Target Language"
        value={defaultTargetLanguage}
        onChange={(v) => {
          if (v !== null) setDefaultTargetLanguage(v);
        }}
        includeAutoDetect={false}
      />

      {/* Source Language Override */}
      <div className="flex flex-col gap-1">
        <LanguageSelector
          label="Source Language Override"
          value={sourceLanguageOverride}
          onChange={setSourceLanguageOverride}
          includeAutoDetect={true}
        />
        <p className="text-[11px] text-[#585b70]">
          Set to Auto-detect to let the model identify the source language automatically.
        </p>
      </div>

      {/* Source Language quick-select (non-selector buttons) */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide">
          Source Language Quick-Set
        </span>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setSourceLanguageOverride(null)}
            className={`
              px-2 py-1 rounded text-xs font-medium border transition-colors duration-100
              focus:outline-none focus:ring-2 focus:ring-[#22c55e]
              ${sourceLanguageOverride === null
                ? 'bg-[#22c55e] border-[#22c55e] text-[#1e1e2e]'
                : 'bg-transparent border-[#45475a] text-[#a6adc8] hover:border-[#cdd6f4]'}
            `}
          >
            Auto
          </button>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang}
              onClick={() => setSourceLanguageOverride(lang)}
              className={`
                px-2 py-1 rounded text-xs font-medium border transition-colors duration-100
                focus:outline-none focus:ring-2 focus:ring-[#22c55e]
                ${sourceLanguageOverride === lang
                  ? 'bg-[#22c55e] border-[#22c55e] text-[#1e1e2e]'
                  : 'bg-transparent border-[#45475a] text-[#a6adc8] hover:border-[#cdd6f4]'}
              `}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

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
