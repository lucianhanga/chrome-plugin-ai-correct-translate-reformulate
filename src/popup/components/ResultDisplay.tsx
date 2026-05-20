// src/popup/components/ResultDisplay.tsx
// Displays the result of a quick action (correction or translation).
// Shows original and result text side by side with a Copy button.

import React, { useState } from 'react';

interface ResultDisplayProps {
  originalText: string;
  resultText: string;
  onClear: () => void;
}

export function ResultDisplay({
  originalText,
  resultText,
  onClear,
}: ResultDisplayProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = (): void => {
    navigator.clipboard.writeText(resultText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {
      // Fallback copy using textarea
      const ta = document.createElement('textarea');
      ta.value = resultText;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="flex flex-col gap-3 mt-2">
      {/* Original */}
      <div>
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#585b70] mb-1">
          Original
        </span>
        <div
          data-testid="original-text"
          className="
            text-xs text-[#6c7086] bg-[#181825] border-l-2 border-[#45475a]
            rounded-r px-2 py-1.5 whitespace-pre-wrap break-words
          "
        >
          {originalText}
        </div>
      </div>

      {/* Result */}
      <div>
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#22c55e] mb-1 opacity-80">
          Result
        </span>
        <div
          data-testid="result-text"
          className="
            text-sm text-[#cdd6f4] bg-[#181825] border-l-2 border-[#22c55e]
            rounded-r px-2 py-1.5 whitespace-pre-wrap break-words
          "
        >
          {resultText}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="
            flex-1 py-1.5 rounded-md text-sm font-semibold
            border border-[#22c55e] text-[#22c55e]
            hover:bg-[#22c55e] hover:text-[#1e1e2e]
            transition-colors duration-100
            focus:outline-none focus:ring-2 focus:ring-[#22c55e] focus:ring-offset-1 focus:ring-offset-[#1e1e2e]
          "
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={onClear}
          className="
            flex-1 py-1.5 rounded-md text-sm font-semibold
            border border-[#45475a] text-[#a6adc8]
            hover:bg-[#313244] hover:text-[#cdd6f4]
            transition-colors duration-100
            focus:outline-none focus:ring-2 focus:ring-[#585b70] focus:ring-offset-1 focus:ring-offset-[#1e1e2e]
          "
        >
          Clear
        </button>
      </div>
    </div>
  );
}
