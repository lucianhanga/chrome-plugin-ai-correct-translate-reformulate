// src/popup/components/ToneSelector.tsx
// Reusable reformulate tone dropdown component.

import React from 'react';
import type { ReformulateTone } from '../../shared/types.ts';
import { REFORMULATE_TONES, REFORMULATE_TONE_LABELS } from '../../shared/constants.ts';

interface ToneSelectorProps {
  value: ReformulateTone;
  onChange: (value: ReformulateTone) => void;
  disabled?: boolean;
}

export function ToneSelector({
  value,
  onChange,
  disabled = false,
}: ToneSelectorProps): React.ReactElement {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    onChange(e.target.value as ReformulateTone);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide">
        Tone
      </label>
      <select
        value={value}
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
        {REFORMULATE_TONES.map((tone) => (
          <option key={tone} value={tone}>
            {REFORMULATE_TONE_LABELS[tone]}
          </option>
        ))}
      </select>
    </div>
  );
}
