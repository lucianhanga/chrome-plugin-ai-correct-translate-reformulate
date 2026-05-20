// src/popup/components/LanguageSelector.tsx
// Reusable language dropdown component.

import React from 'react';
import type { SupportedLanguage } from '../../shared/types.ts';
import { SUPPORTED_LANGUAGES } from '../../shared/constants.ts';

interface LanguageSelectorProps {
  label: string;
  value: SupportedLanguage | null;
  onChange: (value: SupportedLanguage | null) => void;
  includeAutoDetect: boolean;
  disabled?: boolean;
}

export function LanguageSelector({
  label,
  value,
  onChange,
  includeAutoDetect,
  disabled = false,
}: LanguageSelectorProps): React.ReactElement {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const v = e.target.value;
    if (v === 'auto') {
      onChange(null);
    } else {
      onChange(v as SupportedLanguage);
    }
  };

  const selectValue = value === null ? 'auto' : value;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide">
        {label}
      </label>
      <select
        value={selectValue}
        onChange={handleChange}
        disabled={disabled}
        className="
          bg-[#181825] text-[#cdd6f4] border border-[#313244]
          rounded-md px-2 py-1.5 text-sm
          focus:outline-none focus:ring-2 focus:ring-[#22c55e] focus:border-transparent
          disabled:opacity-50 disabled:cursor-not-allowed
          cursor-pointer
        "
      >
        {includeAutoDetect && (
          <option value="auto">Auto-detect</option>
        )}
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {lang}
          </option>
        ))}
      </select>
    </div>
  );
}
