// src/popup/components/QuickAction.tsx
// Text area + action buttons for quick correction or translation from the popup.

import React, { useState } from 'react';
import type { LLMProvider, SupportedLanguage } from '../../shared/types.ts';
import type {
  SuccessResponse,
  ErrorResponse,
  ServiceWorkerResponse,
} from '../../shared/messages.ts';
import { MAX_INPUT_LENGTH } from '../../shared/constants.ts';
import { LanguageSelector } from './LanguageSelector.tsx';
import { ResultDisplay } from './ResultDisplay.tsx';

interface QuickActionProps {
  defaultTargetLanguage: SupportedLanguage;
  provider: LLMProvider;
}

interface ResultState {
  originalText: string;
  resultText: string;
  model: string;
  totalTokens: number | null;
  elapsedMs: number;
}

export function QuickAction({
  defaultTargetLanguage,
  provider,
}: QuickActionProps): React.ReactElement {
  const [inputText, setInputText] = useState('');
  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguage>(defaultTargetLanguage);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const charCount = inputText.length;
  const overLimit = charCount > MAX_INPUT_LENGTH;
  const isEmpty = inputText.trim() === '';

  const handleCorrect = async (): Promise<void> => {
    if (isEmpty || overLimit || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CORRECT_GRAMMAR',
        payload: { text: inputText },
      }) as ServiceWorkerResponse;

      if (isSuccessResponse(response)) {
        setResult({
          originalText: inputText,
          resultText: response.result,
          model: response.model,
          totalTokens: response.totalTokens,
          elapsedMs: response.elapsedMs,
        });
      } else if (isErrorResponse(response)) {
        setError(response.error);
      } else {
        setError('Unexpected response from service worker.');
      }
    } catch (err) {
      setError('Failed to communicate with extension service worker.');
      console.error('[QuickAction] correct error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Translate. The source language is always auto-detected by the model.
  const handleTranslate = async (): Promise<void> => {
    if (isEmpty || overLimit || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        payload: { text: inputText, targetLanguage },
      }) as ServiceWorkerResponse;

      if (isSuccessResponse(response)) {
        setResult({
          originalText: inputText,
          resultText: response.result,
          model: response.model,
          totalTokens: response.totalTokens,
          elapsedMs: response.elapsedMs,
        });
      } else if (isErrorResponse(response)) {
        setError(response.error);
      } else {
        setError('Unexpected response from service worker.');
      }
    } catch (err) {
      setError('Failed to communicate with extension service worker.');
      console.error('[QuickAction] translate error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Text input */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide">
          Input Text
        </label>
        <textarea
          value={inputText}
          disabled={loading}
          onChange={(e) => {
            setInputText(e.target.value);
            setResult(null);
            setError(null);
          }}
          placeholder="Paste or type text here..."
          rows={4}
          className="
            w-full bg-[#181825] text-[#cdd6f4] border border-[#313244]
            rounded-md px-2 py-2 text-sm resize-none
            focus:outline-none focus:ring-2 focus:ring-[#22c55e] focus:border-transparent
            placeholder:text-[#45475a]
            disabled:opacity-60 disabled:cursor-not-allowed
          "
        />
        {/* Character count */}
        <div className="flex justify-end">
          <span
            className="text-xs"
            style={{ color: overLimit ? '#ef4444' : charCount > MAX_INPUT_LENGTH * 0.9 ? '#eab308' : '#585b70' }}
          >
            {charCount.toLocaleString()} / {MAX_INPUT_LENGTH.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Target language for translation */}
      <LanguageSelector
        label="Translate To"
        value={targetLanguage}
        onChange={(v) => {
          if (v !== null) setTargetLanguage(v);
        }}
        includeAutoDetect={false}
        disabled={loading}
      />

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            handleCorrect().catch((err: unknown) => {
              console.error('[QuickAction] handleCorrect unhandled:', err);
            });
          }}
          disabled={isEmpty || overLimit || loading}
          className="
            flex-1 py-2 rounded-md text-sm font-semibold
            bg-[#313244] text-[#cdd6f4]
            hover:bg-[#45475a] active:brightness-90
            transition-colors duration-100
            focus:outline-none focus:ring-2 focus:ring-[#89b4fa] focus:ring-offset-1 focus:ring-offset-[#1e1e2e]
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          {loading ? 'Processing...' : 'Correct'}
        </button>
        <button
          onClick={() => {
            handleTranslate().catch((err: unknown) => {
              console.error('[QuickAction] handleTranslate unhandled:', err);
            });
          }}
          disabled={isEmpty || overLimit || loading}
          className="
            flex-1 py-2 rounded-md text-sm font-semibold
            bg-[#313244] text-[#cdd6f4]
            hover:bg-[#45475a] active:brightness-90
            transition-colors duration-100
            focus:outline-none focus:ring-2 focus:ring-[#89b4fa] focus:ring-offset-1 focus:ring-offset-[#1e1e2e]
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          {loading ? 'Processing...' : 'Translate'}
        </button>
      </div>

      {/* Processing indicator */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-2">
          <div
            className="w-4 h-4 rounded-full border-2 border-[#313244] border-t-[#22c55e] animate-spin"
            aria-label="Loading"
          />
          <span className="text-xs text-[#a6adc8]">
            Processing with {provider === 'openai' ? 'OpenAI' : 'Ollama'}...
          </span>
        </div>
      )}

      {/* Error display */}
      {error && !loading && (
        <div
          data-testid="error-banner"
          className="flex items-start gap-2 p-2 rounded-md border text-sm"
          style={{ borderColor: '#eab308', background: 'rgba(234,179,8,0.08)', color: '#eab308' }}
        >
          <span className="font-bold flex-shrink-0">!</span>
          <span>{error}</span>
        </div>
      )}

      {/* Result display */}
      {result && !loading && (
        <ResultDisplay
          originalText={result.originalText}
          resultText={result.resultText}
          model={result.model}
          totalTokens={result.totalTokens}
          elapsedMs={result.elapsedMs}
        />
      )}
    </div>
  );
}

// ============================================================
// Type narrowing helpers
// ============================================================

function isSuccessResponse(r: ServiceWorkerResponse): r is SuccessResponse {
  return r.success === true && 'result' in r && typeof (r as SuccessResponse).result === 'string';
}

function isErrorResponse(r: ServiceWorkerResponse): r is ErrorResponse {
  return r.success === false;
}
