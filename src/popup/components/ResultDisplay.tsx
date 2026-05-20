// src/popup/components/ResultDisplay.tsx
// Displays the result of a quick action (correction or translation).
// The result is copied to the clipboard automatically; there are no action buttons.

import React, { useEffect, useState } from 'react';

interface ResultDisplayProps {
  originalText: string;
  resultText: string;
  model?: string;
  totalTokens?: number | null;
  elapsedMs?: number;
}

export function ResultDisplay({
  originalText,
  resultText,
  model,
  totalTokens,
  elapsedMs,
}: ResultDisplayProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  // Copy the result to the clipboard automatically when it appears.
  useEffect(() => {
    let cancelled = false;
    const markCopied = (): void => {
      if (!cancelled) setCopied(true);
    };
    const fallbackCopy = (): void => {
      // Best-effort copy for contexts where the async clipboard API is unavailable.
      try {
        const ta = document.createElement('textarea');
        ta.value = resultText;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        if (typeof document.execCommand === 'function') {
          document.execCommand('copy');
        }
        ta.remove();
      } catch {
        // Ignore -- copy is best-effort.
      }
      markCopied();
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(resultText).then(markCopied).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
    return () => {
      cancelled = true;
    };
  }, [resultText]);

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

      {/* Auto-copy confirmation */}
      {copied && (
        <span
          data-testid="copied-hint"
          className="text-[11px] font-semibold text-[#22c55e]"
        >
          Copied to clipboard
        </span>
      )}

      {/* Metadata line: model · tokens · elapsed */}
      {model && (
        <span
          data-testid="result-meta"
          className="text-[10px] text-[#585b70] leading-tight"
        >
          {[
            model,
            typeof totalTokens === 'number' && totalTokens > 0
              ? `${totalTokens} tokens`
              : null,
            typeof elapsedMs === 'number' && elapsedMs > 0
              ? `${(elapsedMs / 1000).toFixed(1)} s`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
    </div>
  );
}
