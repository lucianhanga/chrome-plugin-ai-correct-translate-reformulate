// src/content/overlay.ts
// Shadow DOM overlay for loading, language-confirm, result, and error states.
// Only one overlay exists at a time -- creating a new one removes any existing one.

import type { ActionType, ErrorCode, SupportedLanguage } from '../shared/types.ts';
import { COLORS, SUPPORTED_LANGUAGES } from '../shared/constants.ts';
import { ERROR_COLORS } from '../shared/errors.ts';

// ============================================================
// Types
// ============================================================

export type OverlayState = 'loading' | 'confirm' | 'result' | 'error';

export interface OverlayResultData {
  action: ActionType;
  originalText: string;
  resultText: string;
  targetLanguage?: string;
  /** Translate only: whether Replace/Append can be applied (selection is editable). */
  editable?: boolean;
}

export interface OverlayErrorData {
  errorCode: ErrorCode;
  errorMessage: string;
}

export interface OverlayCallbacks {
  /** Grammar-correction primary action: replace the selection with the result. */
  onAccept?: (resultText: string) => void;
  /** Translate: replace the original text with the translation. */
  onReplace?: (resultText: string) => void;
  /** Translate: append the translation immediately after the original text. */
  onAppend?: (resultText: string) => void;
  /** Dismiss the overlay without applying anything. */
  onReject: () => void;
}

export interface OverlayLanguageConfirmData {
  originalText: string;
  detectedLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
}

export interface LanguageConfirmCallbacks {
  /** Called with the (possibly user-corrected) source language. */
  onConfirm: (sourceLanguage: SupportedLanguage) => void;
  /** Called when the user cancels before translating. */
  onCancel: () => void;
}

// ============================================================
// Singleton host tracking
// ============================================================

let currentHostElement: HTMLElement | null = null;
let currentShadowRoot: ShadowRoot | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
// The action the Enter key triggers in the current overlay state, if any.
let primaryKeyAction: (() => void) | null = null;

// ============================================================
// Public API
// ============================================================

/** Show the loading state ("Correcting…" / "Translating…"). */
export function showLoading(action: ActionType, _originalText: string): void {
  const position = getSelectionPosition();
  const root = createOrReplaceOverlay();
  renderLoading(root, action === 'correct' ? 'Correcting…' : 'Translating…');
  positionOverlay(currentHostElement!, position);
}

/** Show the "Detecting language…" state (first step of the translate flow). */
export function showDetecting(): void {
  const position = getSelectionPosition();
  const root = createOrReplaceOverlay();
  renderLoading(root, 'Detecting language…');
  positionOverlay(currentHostElement!, position);
}

/** Show the language-confirmation step: detected language is editable before translating. */
export function showLanguageConfirm(
  data: OverlayLanguageConfirmData,
  callbacks: LanguageConfirmCallbacks,
): void {
  const position = getSelectionPosition();
  const root = currentShadowRoot ?? createOrReplaceOverlay();
  renderLanguageConfirm(root, data, callbacks);
  positionOverlay(currentHostElement!, position);
}

/** Transition the overlay (or create one) to the result state. */
export function showResult(data: OverlayResultData, callbacks: OverlayCallbacks): void {
  const position = getSelectionPosition();
  const root = currentShadowRoot ?? createOrReplaceOverlay();
  renderResult(root, buildResultTitle(data), data, callbacks);
  positionOverlay(currentHostElement!, position);
  focusPrimaryButton(root);
}

/** Transition the overlay (or create one) to the error state. */
export function showError(data: OverlayErrorData): void {
  const position = getSelectionPosition();
  const root = currentShadowRoot ?? createOrReplaceOverlay();
  renderError(root, data);
  positionOverlay(currentHostElement!, position);
  removeKeyboardHandler();
  primaryKeyAction = null;
}

/** Remove the overlay from the DOM entirely. */
export function dismissOverlay(): void {
  cleanup();
}

// ============================================================
// Overlay Creation
// ============================================================

function createOrReplaceOverlay(): ShadowRoot {
  cleanup();

  const host = document.createElement('div');
  host.setAttribute('data-ct-overlay-host', '');
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  const styleEl = document.createElement('style');
  styleEl.textContent = getOverlayCSS();
  shadow.appendChild(styleEl);

  currentHostElement = host;
  currentShadowRoot = shadow;

  return shadow;
}

function cleanup(): void {
  removeKeyboardHandler();
  primaryKeyAction = null;
  if (currentHostElement) {
    currentHostElement.remove();
    currentHostElement = null;
  }
  currentShadowRoot = null;
}

// ============================================================
// Renderers
// ============================================================

function renderLoading(root: ShadowRoot, title: string): void {
  removeKeyboardHandler();
  primaryKeyAction = null;

  const overlay = buildOverlayShell(root, title);
  const body = overlay.querySelector('.ct-overlay-body') as HTMLElement;

  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'ct-overlay-loading';

  const spinner = document.createElement('div');
  spinner.className = 'ct-spinner';

  const label = document.createElement('span');
  label.textContent = title;

  loadingDiv.appendChild(spinner);
  loadingDiv.appendChild(label);
  body.appendChild(loadingDiv);
}

function renderLanguageConfirm(
  root: ShadowRoot,
  data: OverlayLanguageConfirmData,
  callbacks: LanguageConfirmCallbacks,
): void {
  const overlay = buildOverlayShell(root, `Translate to ${data.targetLanguage}`);
  const body = overlay.querySelector('.ct-overlay-body') as HTMLElement;

  const confirmDiv = document.createElement('div');
  confirmDiv.className = 'ct-overlay-confirm';

  // Original text (dimmed)
  const originalBlock = document.createElement('div');
  originalBlock.className = 'ct-original';
  const originalLabel = document.createElement('span');
  originalLabel.className = 'ct-original-label';
  originalLabel.textContent = 'Original';
  const originalText = document.createElement('span');
  originalText.textContent = data.originalText;
  originalBlock.appendChild(originalLabel);
  originalBlock.appendChild(originalText);

  // Detected-language row with an editable select
  const langRow = document.createElement('div');
  langRow.className = 'ct-lang-row';

  const langLabel = document.createElement('span');
  langLabel.className = 'ct-lang-label';
  langLabel.textContent = 'Detected language';

  const select = document.createElement('select');
  select.className = 'ct-lang-select';
  select.setAttribute('data-ct-lang-select', '');
  for (const lang of SUPPORTED_LANGUAGES) {
    const opt = document.createElement('option');
    opt.value = lang;
    opt.textContent = lang;
    if (lang === data.detectedLanguage) opt.selected = true;
    select.appendChild(opt);
  }

  langRow.appendChild(langLabel);
  langRow.appendChild(select);

  confirmDiv.appendChild(originalBlock);
  confirmDiv.appendChild(langRow);
  body.appendChild(confirmDiv);

  // Actions footer
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'ct-overlay-actions';

  const translateBtn = document.createElement('button');
  translateBtn.className = 'ct-btn ct-btn-accept';
  translateBtn.textContent = 'Translate';
  translateBtn.setAttribute('data-ct-confirm', '');
  const doConfirm = (): void => {
    callbacks.onConfirm(select.value as SupportedLanguage);
  };
  translateBtn.addEventListener('click', doConfirm);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'ct-btn ct-btn-reject';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    callbacks.onCancel();
    cleanup();
  });

  actionsDiv.appendChild(translateBtn);
  actionsDiv.appendChild(cancelBtn);
  overlay.appendChild(actionsDiv);

  primaryKeyAction = doConfirm;
  setupKeyboardHandler(() => {
    callbacks.onCancel();
  });
  translateBtn.focus();
}

function renderResult(
  root: ShadowRoot,
  title: string,
  data: OverlayResultData,
  callbacks: OverlayCallbacks,
): void {
  const overlay = buildOverlayShell(root, title);
  const body = overlay.querySelector('.ct-overlay-body') as HTMLElement;

  const resultDiv = document.createElement('div');
  resultDiv.className = 'ct-overlay-result';

  // Original text (dimmed)
  const originalBlock = document.createElement('div');
  originalBlock.className = 'ct-original';
  const originalLabel = document.createElement('span');
  originalLabel.className = 'ct-original-label';
  originalLabel.textContent = 'Original';
  const originalText = document.createElement('span');
  originalText.textContent = data.originalText;
  originalBlock.appendChild(originalLabel);
  originalBlock.appendChild(originalText);

  // Result text (prominent)
  const resultBlock = document.createElement('div');
  resultBlock.className = 'ct-result';
  const resultLabel = document.createElement('span');
  resultLabel.className = 'ct-result-label';
  resultLabel.textContent = data.action === 'correct' ? 'Corrected' : 'Translation';
  const resultText = document.createElement('span');
  resultText.textContent = data.resultText;
  resultBlock.appendChild(resultLabel);
  resultBlock.appendChild(resultText);

  resultDiv.appendChild(originalBlock);
  resultDiv.appendChild(resultBlock);

  // Translate results are auto-copied to the clipboard; show a hint.
  if (data.action === 'translate') {
    const hint = document.createElement('div');
    hint.className = 'ct-copied-hint';
    hint.textContent = 'Copied to clipboard';
    resultDiv.appendChild(hint);
  }

  body.appendChild(resultDiv);

  // Actions footer
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'ct-overlay-actions';

  if (data.action === 'translate') {
    if (data.editable === true) {
      const replaceBtn = document.createElement('button');
      replaceBtn.className = 'ct-btn ct-btn-accept';
      replaceBtn.textContent = 'Replace';
      replaceBtn.setAttribute('data-ct-replace', '');
      const doReplace = (): void => {
        callbacks.onReplace?.(data.resultText);
        cleanup();
      };
      replaceBtn.addEventListener('click', doReplace);

      const appendBtn = document.createElement('button');
      appendBtn.className = 'ct-btn ct-btn-secondary';
      appendBtn.textContent = 'Append';
      appendBtn.setAttribute('data-ct-append', '');
      appendBtn.addEventListener('click', () => {
        callbacks.onAppend?.(data.resultText);
        cleanup();
      });

      actionsDiv.appendChild(replaceBtn);
      actionsDiv.appendChild(appendBtn);
      primaryKeyAction = doReplace;
    } else {
      primaryKeyAction = null;
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ct-btn ct-btn-dismiss';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => {
      callbacks.onReject();
      cleanup();
    });
    actionsDiv.appendChild(closeBtn);
  } else {
    // Grammar correction: Accept / Reject
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'ct-btn ct-btn-accept';
    acceptBtn.textContent = 'Accept';
    acceptBtn.setAttribute('data-ct-accept', '');
    const doAccept = (): void => {
      callbacks.onAccept?.(data.resultText);
      cleanup();
    };
    acceptBtn.addEventListener('click', doAccept);

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'ct-btn ct-btn-reject';
    rejectBtn.textContent = 'Reject';
    rejectBtn.addEventListener('click', () => {
      callbacks.onReject();
      cleanup();
    });

    actionsDiv.appendChild(acceptBtn);
    actionsDiv.appendChild(rejectBtn);
    primaryKeyAction = doAccept;
  }

  overlay.appendChild(actionsDiv);
  setupKeyboardHandler(callbacks.onReject);
}

function renderError(root: ShadowRoot, data: OverlayErrorData): void {
  const overlay = buildOverlayShell(root, 'Error');
  const body = overlay.querySelector('.ct-overlay-body') as HTMLElement;

  const errorDiv = document.createElement('div');
  errorDiv.className = 'ct-overlay-error';

  const iconSpan = document.createElement('span');
  iconSpan.className = 'ct-error-icon';
  iconSpan.textContent = '!';

  const color = ERROR_COLORS[data.errorCode];
  if (color === COLORS.FAILURE) {
    iconSpan.style.background = COLORS.FAILURE;
  }

  const msgSpan = document.createElement('span');
  msgSpan.className = 'ct-error-message';
  msgSpan.textContent = data.errorMessage;

  errorDiv.appendChild(iconSpan);
  errorDiv.appendChild(msgSpan);
  body.appendChild(errorDiv);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'ct-overlay-actions';

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'ct-btn ct-btn-dismiss';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.addEventListener('click', () => {
    cleanup();
  });

  actionsDiv.appendChild(dismissBtn);
  overlay.appendChild(actionsDiv);
}

// ============================================================
// Shell Builder
// ============================================================

function buildOverlayShell(root: ShadowRoot, title: string): HTMLElement {
  const existing = root.querySelector('.ct-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'ct-overlay';

  const header = document.createElement('div');
  header.className = 'ct-overlay-header';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'ct-overlay-title';
  titleSpan.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ct-overlay-close';
  closeBtn.textContent = 'X';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.addEventListener('click', () => {
    cleanup();
  });

  header.appendChild(titleSpan);
  header.appendChild(closeBtn);
  overlay.appendChild(header);

  const body = document.createElement('div');
  body.className = 'ct-overlay-body';
  overlay.appendChild(body);

  root.appendChild(overlay);
  return overlay;
}

// ============================================================
// Positioning
// ============================================================

interface Position {
  top: number;
  left: number;
  anchorBottom: number;
}

function getSelectionPosition(): Position {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { top: 80, left: 80, anchorBottom: 100 };
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  return {
    top: rect.bottom + window.scrollY + 8,
    left: rect.left + window.scrollX,
    anchorBottom: rect.bottom + window.scrollY,
  };
}

function positionOverlay(host: HTMLElement, pos: Position): void {
  const OVERLAY_MAX_WIDTH = 480;
  const OVERLAY_MAX_HEIGHT = 320;
  const MARGIN = 12;

  const vpWidth = window.innerWidth;
  const vpHeight = window.innerHeight;

  let left = pos.left;
  if (left + OVERLAY_MAX_WIDTH > vpWidth - MARGIN) {
    left = vpWidth - OVERLAY_MAX_WIDTH - MARGIN;
  }
  if (left < MARGIN) left = MARGIN;

  const spaceBelow = vpHeight - (pos.anchorBottom - window.scrollY);
  let top: number;

  if (spaceBelow >= OVERLAY_MAX_HEIGHT + 8) {
    top = pos.top;
  } else {
    top = pos.anchorBottom - window.scrollY - OVERLAY_MAX_HEIGHT - 8 + window.scrollY;
    if (top < window.scrollY + MARGIN) {
      top = pos.top;
    }
  }

  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.top = `${top - window.scrollY}px`;
  host.style.left = `${left}px`;
  host.style.pointerEvents = 'none';
}

// ============================================================
// Keyboard Handler
// ============================================================

function setupKeyboardHandler(onEscape: () => void): void {
  removeKeyboardHandler();

  keydownHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape();
      cleanup();
    } else if (e.key === 'Enter') {
      const active = document.activeElement;
      // With a closed shadow root, document.activeElement reports the host
      // element when a control inside the overlay is focused.
      const isOverlayFocused =
        !active ||
        active === document.body ||
        active === document.documentElement ||
        active === currentHostElement;
      if (isOverlayFocused && primaryKeyAction) {
        e.preventDefault();
        primaryKeyAction();
      }
    }
  };

  document.addEventListener('keydown', keydownHandler, true);
}

function removeKeyboardHandler(): void {
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler, true);
    keydownHandler = null;
  }
}

// ============================================================
// Helpers
// ============================================================

function buildResultTitle(data: OverlayResultData): string {
  if (data.action === 'correct') return 'Correction';
  if (data.targetLanguage) return `Translation to ${data.targetLanguage}`;
  return 'Translation';
}

function focusPrimaryButton(root: ShadowRoot): void {
  const btn = root.querySelector(
    '[data-ct-accept], [data-ct-replace]',
  ) as HTMLButtonElement | null;
  btn?.focus();
}

// ============================================================
// Inline CSS
// The CSS file is inlined at build time via the ?inline import in content.ts.
// ============================================================

let _cachedCSS: string | null = null;

/** Set the CSS string to be injected into Shadow DOM. Call before showing any overlay. */
export function setOverlayCSS(css: string): void {
  _cachedCSS = css;
}

function getOverlayCSS(): string {
  return _cachedCSS ?? '';
}

// ============================================================
// Copied Toast
// ============================================================

/**
 * Show a brief "Copied!" confirmation toast appended to document.body.
 * The toast self-removes after the animation completes (~1.6s).
 */
export function showCopiedToast(): void {
  const toastHost = document.createElement('div');
  toastHost.setAttribute('data-ct-toast-host', '');
  toastHost.style.cssText =
    'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;';
  document.body.appendChild(toastHost);

  const shadow = toastHost.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .ct-copied-toast {
      background: #313244;
      color: #22c55e;
      font-size: 13px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 6px 16px;
      border-radius: 20px;
      border: 1px solid #22c55e;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      white-space: nowrap;
      animation: ct-toast-in 0.15s ease-out, ct-toast-out 0.2s ease-in 1.4s forwards;
    }
    @keyframes ct-toast-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes ct-toast-out {
      to { opacity: 0; transform: translateY(8px); }
    }
  `;
  shadow.appendChild(style);

  const toast = document.createElement('div');
  toast.className = 'ct-copied-toast';
  toast.textContent = 'Copied!';
  shadow.appendChild(toast);

  setTimeout(() => {
    toastHost.remove();
  }, 1700);
}
