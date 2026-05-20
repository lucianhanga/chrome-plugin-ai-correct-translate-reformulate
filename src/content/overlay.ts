// src/content/overlay.ts
// Shadow DOM overlay component for displaying loading, result, and error states.
// Only one overlay exists at a time -- creating a new one removes any existing one.

import type { ActionType } from '../shared/types.ts';
import type { ErrorCode } from '../shared/types.ts';
import { COLORS } from '../shared/constants.ts';
import { ERROR_COLORS } from '../shared/errors.ts';

// ============================================================
// Types
// ============================================================

export type OverlayState = 'loading' | 'result' | 'error';

export interface OverlayResultData {
  action: ActionType;
  originalText: string;
  resultText: string;
  targetLanguage?: string;
}

export interface OverlayErrorData {
  errorCode: ErrorCode;
  errorMessage: string;
}

export interface OverlayCallbacks {
  onAccept: (resultText: string) => void;
  onReject: () => void;
}

// ============================================================
// Singleton host tracking
// ============================================================

let currentHostElement: HTMLElement | null = null;
let currentShadowRoot: ShadowRoot | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let currentResultText: string | null = null;

// ============================================================
// Public API
// ============================================================

/**
 * Show the loading state overlay near the current text selection.
 */
export function showLoading(action: ActionType, originalText: string): void {
  const position = getSelectionPosition();
  const root = createOrReplaceOverlay();

  const title = action === 'correct' ? 'Correcting...' : 'Translating...';
  renderLoading(root, title, originalText);
  positionOverlay(currentHostElement!, position);
}

/**
 * Transition the existing overlay (or create a new one) to the result state.
 */
export function showResult(data: OverlayResultData, callbacks: OverlayCallbacks): void {
  const position = getSelectionPosition();
  const root = currentShadowRoot ?? createOrReplaceOverlay();

  currentResultText = data.resultText;

  const title = buildResultTitle(data);
  renderResult(root, title, data, callbacks);
  positionOverlay(currentHostElement!, position);
  setupKeyboardHandler(callbacks);
  focusAcceptButton(root);
}

/**
 * Transition the existing overlay (or create a new one) to the error state.
 */
export function showError(data: OverlayErrorData): void {
  const position = getSelectionPosition();
  const root = currentShadowRoot ?? createOrReplaceOverlay();

  currentResultText = null;
  renderError(root, data);
  positionOverlay(currentHostElement!, position);
  removeKeyboardHandler();
}

/**
 * Remove the overlay from the DOM entirely.
 */
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

  // Inject the stylesheet into the shadow root
  const styleEl = document.createElement('style');
  styleEl.textContent = getOverlayCSS();
  shadow.appendChild(styleEl);

  currentHostElement = host;
  currentShadowRoot = shadow;

  return shadow;
}

function cleanup(): void {
  removeKeyboardHandler();
  if (currentHostElement) {
    currentHostElement.remove();
    currentHostElement = null;
  }
  currentShadowRoot = null;
  currentResultText = null;
}

// ============================================================
// Renderers
// ============================================================

function renderLoading(root: ShadowRoot, title: string, _originalText: string): void {
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

  // No actions footer during loading
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
  body.appendChild(resultDiv);

  // Actions footer
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'ct-overlay-actions';

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'ct-btn ct-btn-accept';
  acceptBtn.textContent = 'Accept';
  acceptBtn.setAttribute('data-ct-accept', '');
  acceptBtn.addEventListener('click', () => {
    callbacks.onAccept(data.resultText);
    cleanup();
  });

  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'ct-btn ct-btn-reject';
  rejectBtn.textContent = 'Reject';
  rejectBtn.addEventListener('click', () => {
    callbacks.onReject();
    cleanup();
  });

  actionsDiv.appendChild(acceptBtn);
  actionsDiv.appendChild(rejectBtn);
  overlay.appendChild(actionsDiv);
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

  // Dismiss button
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
  // Remove any existing overlay element (but keep the style tag)
  const existing = root.querySelector('.ct-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'ct-overlay';

  // Header
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

  // Body
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

  // Horizontal: align to selection left, clamp to viewport
  let left = pos.left;
  if (left + OVERLAY_MAX_WIDTH > vpWidth - MARGIN) {
    left = vpWidth - OVERLAY_MAX_WIDTH - MARGIN;
  }
  if (left < MARGIN) left = MARGIN;

  // Vertical: prefer below selection; flip above if not enough space below
  const spaceBelow = vpHeight - (pos.anchorBottom - window.scrollY);
  let top: number;

  if (spaceBelow >= OVERLAY_MAX_HEIGHT + 8) {
    top = pos.top;
  } else {
    // Position above the selection
    top = pos.anchorBottom - window.scrollY - OVERLAY_MAX_HEIGHT - 8 + window.scrollY;
    if (top < window.scrollY + MARGIN) {
      top = pos.top; // fallback: below anyway
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

function setupKeyboardHandler(callbacks: OverlayCallbacks): void {
  removeKeyboardHandler();

  keydownHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      callbacks.onReject();
      cleanup();
    } else if (e.key === 'Enter') {
      // Only accept if focus is inside the overlay or no specific input is focused
      const active = document.activeElement;
      const isInsideOverlay =
        !active || active === document.body || active === document.documentElement;

      if (isInsideOverlay && currentResultText !== null) {
        e.preventDefault();
        callbacks.onAccept(currentResultText);
        cleanup();
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

function focusAcceptButton(root: ShadowRoot): void {
  // Shadow DOM query -- need to go through the root
  const btn = root.querySelector('[data-ct-accept]') as HTMLButtonElement | null;
  if (btn) {
    btn.focus();
  }
}

// ============================================================
// Inline CSS
// The CSS file is inlined at build time via the ?inline import in content.ts.
// At runtime the CSS string is passed in; this function returns the cached value.
// ============================================================

let _cachedCSS: string | null = null;

/**
 * Set the CSS string to be injected into Shadow DOM.
 * Must be called before any overlay is shown.
 */
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
  // Show toast in a separate shadow host so it is not affected by page styles
  const toastHost = document.createElement('div');
  toastHost.setAttribute('data-ct-toast-host', '');
  toastHost.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;';
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
