// src/popup/components/QuickAction.tsx
// Text area + action buttons for quick correction or translation from the popup.
// Translation is a multi-step flow: detect language -> confirm/correct it -> translate.

import React, { useState } from 'react';
import type { SupportedLanguage, ActionType } from '../../shared/types.ts';
import type {
  SuccessResponse,
  ErrorResponse,
  DetectLanguageResponse,
  ServiceWorkerResponse,
} from '../../shared/messages.ts';
import { MAX_INPUT_LENGTH } from '../../shared/constants.ts';
import { LanguageSelector } from './LanguageSelector.tsx';
import { ResultDisplay } from './ResultDisplay.tsx';

interface QuickActionProps {
  defaultTargetLanguage: SupportedLanguage;
  sourceLanguageOverride: SupportedLanguage | null;
}

interface ResultState {
  originalText: string;
  resultText: string;
  action: ActionType;
}

// idle -> detecting -> confirm -> translating -> idle
type TranslatePhase = 'idle' | 'detecting' | 'confirm' | 'translating';

export function QuickAction({
  defaultTargetLanguage,
  sourceLanguageOverride,
}: QuickActionProps): React.ReactElement {
  const [inputText, setInputText] = useState('');
  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguage>(defaultTargetLanguage);
  const [loading, setLoading] = useState(false);
  const [translatePhase, setTranslatePhase] = useState<TranslatePhase>('idle');
  const [detectedLanguage, setDetectedLanguage] = useState<SupportedLanguage | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const charCount = inputText.length;
  const overLimit = charCount > MAX_INPUT_LENGTH;
  const isEmpty = inputText.trim() === '';
  const busy = loading || translatePhase !== 'idle';

  const handleCorrect = async (): Promise<void> => {
    if (isEmpty || overLimit || busy) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CORRECT_GRAMMAR',
        payload: { text: inputText },
      }) as ServiceWorkerResponse;

      if (isSuccessResponse(response)) {
        setResult({ originalText: inputText, resultText: response.result, action: 'correct' });
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

  // Translate step 1: detect the source language (or use a pinned override).
  const handleTranslate = async (): Promise<void> => {
    if (isEmpty || overLimit || busy) return;
    setError(null);
    setResult(null);

    // A pinned source-language override skips detection.
    if (sourceLanguageOverride !== null) {
      setDetectedLanguage(sourceLanguageOverride);
      setTranslatePhase('confirm');
      return;
    }

    setDetectedLanguage(null);
    setTranslatePhase('detecting');
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DETECT_LANGUAGE',
        payload: { text: inputText },
      }) as ServiceWorkerResponse;

      if (isDetectLanguageResponse(response)) {
        setDetectedLanguage(response.detectedLanguage);
        setTranslatePhase('confirm');
      } else if (isErrorResponse(response)) {
        setError(response.error);
        setTranslatePhase('idle');
      } else {
        setError('Unexpected response from service worker.');
        setTranslatePhase('idle');
      }
    } catch (err) {
      setError('Failed to communicate with extension service worker.');
      setTranslatePhase('idle');
      console.error('[QuickAction] detect error:', err);
    }
  };

  // Translate step 2: translate with the confirmed source language.
  const handleConfirmTranslate = async (): Promise<void> => {
    if (detectedLanguage === null) return;
    setTranslatePhase('translating');
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        payload: { text: inputText, targetLanguage, sourceLanguage: detectedLanguage },
      }) as ServiceWorkerResponse;

      if (isSuccessResponse(response)) {
        setResult({ originalText: inputText, resultText: response.result, action: 'translate' });
      } else if (isErrorResponse(response)) {
        setError(response.error);
      } else {
        setError('Unexpected response from service worker.');
      }
    } catch (err) {
      setError('Failed to communicate with extension service worker.');
      console.error('[QuickAction] translate error:', err);
    } finally {
      setTranslatePhase('idle');
    }
  };

  const handleCancelTranslate = (): void => {
    setTranslatePhase('idle');
    setDetectedLanguage(null);
  };

  const handleClear = (): void => {
    setResult(null);
    setError(null);
  };

  // Translate result: replace the input text with the translation.
  const handleReplace = (): void => {
    if (!result) return;
    setInputText(result.resultText);
    setResult(null);
    setError(null);
  };

  // Translate result: append the translation after the original text.
  const handleAppend = (): void => {
    if (!result) return;
    setInputText(`${result.originalText} ${result.resultText}`);
    setResult(null);
    setError(null);
  };

  const inFlightLabel = translatePhase !== 'idle' ? 'Translating...' : 'Translate';

  return (
    <div className="flex flex-col gap-3">
      {/* Text input */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide">
          Input Text
        </label>
        <textarea
          value={inputText}
          disabled={busy}
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
        disabled={busy}
      />

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            handleCorrect().catch((err: unknown) => {
              console.error('[QuickAction] handleCorrect unhandled:', err);
            });
          }}
          disabled={isEmpty || overLimit || busy}
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
          disabled={isEmpty || overLimit || busy}
          className="
            flex-1 py-2 rounded-md text-sm font-semibold
            bg-[#313244] text-[#cdd6f4]
            hover:bg-[#45475a] active:brightness-90
            transition-colors duration-100
            focus:outline-none focus:ring-2 focus:ring-[#89b4fa] focus:ring-offset-1 focus:ring-offset-[#1e1e2e]
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          {inFlightLabel}
        </button>
      </div>

      {/* Detecting indicator */}
      {translatePhase === 'detecting' && (
        <div className="flex items-center justify-center gap-2 py-2">
          <div
            className="w-4 h-4 rounded-full border-2 border-[#313244] border-t-[#22c55e] animate-spin"
            aria-label="Loading"
          />
          <span className="text-xs text-[#a6adc8]">Detecting language...</span>
        </div>
      )}

      {/* Language confirmation step */}
      {translatePhase === 'confirm' && detectedLanguage !== null && (
        <div
          data-testid="language-confirm"
          className="flex flex-col gap-2 p-2 rounded-md border border-[#313244] bg-[#181825]"
        >
          <LanguageSelector
            label="Detected language"
            value={detectedLanguage}
            onChange={(v) => {
              if (v !== null) setDetectedLanguage(v);
            }}
            includeAutoDetect={false}
          />
          <div className="flex gap-2">
            <button
              data-testid="confirm-translate"
              onClick={() => {
                handleConfirmTranslate().catch((err: unknown) => {
                  console.error('[QuickAction] handleConfirmTranslate unhandled:', err);
                });
              }}
              className="
                flex-1 py-1.5 rounded-md text-sm font-semibold
                bg-[#22c55e] text-[#1e1e2e]
                hover:brightness-110 active:brightness-90
                transition-all duration-100
                focus:outline-none focus:ring-2 focus:ring-[#22c55e] focus:ring-offset-1 focus:ring-offset-[#1e1e2e]
              "
            >
              Translate
            </button>
            <button
              onClick={handleCancelTranslate}
              className="
                flex-1 py-1.5 rounded-md text-sm font-semibold
                border border-[#45475a] text-[#a6adc8]
                hover:bg-[#313244] hover:text-[#cdd6f4]
                transition-colors duration-100
                focus:outline-none focus:ring-2 focus:ring-[#585b70] focus:ring-offset-1 focus:ring-offset-[#1e1e2e]
              "
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Processing indicator */}
      {(loading || translatePhase === 'translating') && (
        <div className="flex items-center justify-center gap-2 py-2">
          <div
            className="w-4 h-4 rounded-full border-2 border-[#313244] border-t-[#22c55e] animate-spin"
            aria-label="Loading"
          />
          <span className="text-xs text-[#a6adc8]">Processing with Ollama...</span>
        </div>
      )}

      {/* Error display */}
      {error && !busy && (
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
      {result && !busy && (
        <ResultDisplay
          originalText={result.originalText}
          resultText={result.resultText}
          onClear={handleClear}
          action={result.action}
          {...(result.action === 'translate'
            ? { onReplace: handleReplace, onAppend: handleAppend }
            : {})}
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

function isDetectLanguageResponse(r: ServiceWorkerResponse): r is DetectLanguageResponse {
  return r.success === true && 'detectedLanguage' in r;
}
