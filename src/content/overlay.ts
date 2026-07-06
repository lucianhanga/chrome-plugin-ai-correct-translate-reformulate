// src/content/overlay.ts
// Shadow DOM overlay for loading, result, and error states.
// Only one overlay exists at a time -- creating a new one removes any existing one.

import type { ActionType, ErrorCode, ReformulateTone, SummarizeLength } from '../shared/types.ts';
import { COLORS, REFORMULATE_TONE_LABELS, SUMMARIZE_LENGTH_LABELS } from '../shared/constants.ts';
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
  /** Reformulate tone, present only when action is 'reformulate'. */
  tone?: ReformulateTone;
  /** Summary length, present only when action is 'summarize'. */
  length?: SummarizeLength;
  /** Whether the selection can be edited in place (Replace/Append apply). */
  editable: boolean;
  /** Model identifier reported by the LLM response. */
  model?: string;
  /** Total tokens consumed (prompt + completion), or null when absent. */
  totalTokens?: number | null;
  /** Wall-clock milliseconds for the LLM call. */
  elapsedMs?: number;
}

export interface OverlayErrorData {
  errorCode: ErrorCode;
  errorMessage: string;
}

export interface OverlayCallbacks {
  /** Replace the original selection with the result text. */
  onReplace: (resultText: string) => void;
  /** Append the result text immediately after the original. */
  onAppend: (resultText: string) => void;
  /** Close the overlay without applying anything. */
  onReject: () => void;
}

// ============================================================
// Singleton host tracking
// ============================================================

let currentHostElement: HTMLElement | null = null;
let currentShadowRoot: ShadowRoot | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
// The action the Enter key triggers in the current overlay state, if any.
let primaryKeyAction: (() => void) | null = null;
// The page element that had focus before the overlay opened, restored on close.
let previouslyFocused: HTMLElement | null = null;

// ============================================================
// Public API
// ============================================================

/** Show the loading state with provider-aware label. */
export function showLoading(
  action: ActionType,
  _originalText: string,
  provider: import('../shared/types.ts').LLMProvider = 'ollama',
  _tone?: ReformulateTone,
): void {
  const position = getSelectionPosition();
  const root = createOrReplaceOverlay();
  const providerLabel = provider === 'openai' ? 'OpenAI' : 'Ollama';
  let verb: string;
  if (action === 'correct') {
    verb = 'Correcting';
  } else if (action === 'reformulate') {
    verb = 'Reformulating';
  } else if (action === 'summarize') {
    verb = 'Summarizing';
  } else {
    verb = 'Translating';
  }
  renderLoading(root, `${verb}…`, `Processing with ${providerLabel}…`);
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

  // Remember what had focus on the page so it can be restored when the overlay
  // closes (cleanup() above has already cleared any prior value).
  const active = document.activeElement as HTMLElement | null;
  previouslyFocused =
    active && active !== document.body && active !== document.documentElement
      ? active
      : null;

  const host = document.createElement('div');
  host.setAttribute('data-ct-overlay-host', '');
  // Fix the host out of normal document flow immediately. If it were left as a
  // static element at the end of <body>, focusing a control inside it (before
  // positionOverlay runs) would scroll the page to the bottom to reveal it --
  // throwing off the selection-relative positioning so the overlay lands off
  // screen. positionOverlay sets the final top/left.
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'none';
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
  // Return focus to wherever it was before the overlay opened (e.g. the
  // editable field the user selected text in), so keyboard users are not
  // stranded once the dialog is gone.
  if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus({ preventScroll: true });
  }
  previouslyFocused = null;
}

// ============================================================
// Renderers
// ============================================================

function renderLoading(root: ShadowRoot, title: string, subtitle?: string): void {
  primaryKeyAction = null;

  const overlay = buildOverlayShell(root, title);
  const body = overlay.querySelector('.ct-overlay-body') as HTMLElement;

  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'ct-overlay-loading';
  // Announce the loading state politely to assistive technology.
  loadingDiv.setAttribute('role', 'status');
  loadingDiv.setAttribute('aria-live', 'polite');

  const spinner = document.createElement('div');
  spinner.className = 'ct-spinner';

  const label = document.createElement('span');
  label.textContent = subtitle ?? title;

  loadingDiv.appendChild(spinner);
  loadingDiv.appendChild(label);
  body.appendChild(loadingDiv);

  // A loading overlay is still a dismissable dialog (header close button):
  // wire Escape + the Tab focus trap, and move focus into the dialog.
  setupKeyboardHandler();
  focusFirstFocusable();
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
  // Announce the result politely once it replaces the loading state.
  resultDiv.setAttribute('role', 'status');
  resultDiv.setAttribute('aria-live', 'polite');

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
  if (data.action === 'correct') {
    resultLabel.textContent = 'Corrected';
  } else if (data.action === 'reformulate') {
    resultLabel.textContent = 'Reformulated';
  } else if (data.action === 'summarize') {
    resultLabel.textContent = 'Summary';
  } else {
    resultLabel.textContent = 'Translation';
  }
  const resultText = document.createElement('span');
  resultText.textContent = data.resultText;
  resultBlock.appendChild(resultLabel);
  resultBlock.appendChild(resultText);

  resultDiv.appendChild(originalBlock);
  resultDiv.appendChild(resultBlock);

  // The result is auto-copied to the clipboard; show a confirmation.
  const hint = document.createElement('div');
  hint.className = 'ct-copied-hint';
  hint.textContent = 'Copied to clipboard';
  resultDiv.appendChild(hint);

  // Metadata line: model · tokens · elapsed (shown only when model is present).
  if (data.model) {
    const meta = document.createElement('div');
    meta.className = 'ct-result-meta';
    const parts: string[] = [data.model];
    if (typeof data.totalTokens === 'number' && data.totalTokens > 0) {
      parts.push(`${data.totalTokens} tokens`);
    }
    if (typeof data.elapsedMs === 'number' && data.elapsedMs > 0) {
      parts.push(`${(data.elapsedMs / 1000).toFixed(1)} s`);
    }
    meta.textContent = parts.join(' · ');
    resultDiv.appendChild(meta);
  }

  body.appendChild(resultDiv);

  // Actions footer. Replace/Append apply only when the selection is editable;
  // for a non-editable selection only Close is shown (the result is still
  // auto-copied to the clipboard).
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'ct-overlay-actions';

  if (data.editable) {
    const replaceBtn = document.createElement('button');
    replaceBtn.className = 'ct-btn ct-btn-accept';
    replaceBtn.textContent = 'Replace';
    replaceBtn.setAttribute('data-ct-replace', '');
    const doReplace = (): void => {
      callbacks.onReplace(data.resultText);
      cleanup();
    };
    replaceBtn.addEventListener('click', doReplace);

    const appendBtn = document.createElement('button');
    appendBtn.className = 'ct-btn ct-btn-secondary';
    appendBtn.textContent = 'Append';
    appendBtn.setAttribute('data-ct-append', '');
    appendBtn.addEventListener('click', () => {
      callbacks.onAppend(data.resultText);
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
  closeBtn.setAttribute('data-ct-close', '');
  closeBtn.addEventListener('click', () => {
    callbacks.onReject();
    cleanup();
  });

  actionsDiv.appendChild(closeBtn);
  overlay.appendChild(actionsDiv);

  setupKeyboardHandler(callbacks.onReject);
}

function renderError(root: ShadowRoot, data: OverlayErrorData): void {
  primaryKeyAction = null;
  const overlay = buildOverlayShell(root, 'Error');
  const body = overlay.querySelector('.ct-overlay-body') as HTMLElement;

  const errorDiv = document.createElement('div');
  errorDiv.className = 'ct-overlay-error';
  // Errors are announced assertively.
  errorDiv.setAttribute('role', 'alert');

  const iconSpan = document.createElement('span');
  iconSpan.className = 'ct-error-icon';
  iconSpan.textContent = '!';

  // Drive both the icon background and the message colour from the error's
  // severity, so a red (failure) error actually renders red rather than the
  // CSS-default yellow.
  const color = ERROR_COLORS[data.errorCode];
  iconSpan.style.background = color;

  const msgSpan = document.createElement('span');
  msgSpan.className = 'ct-error-message';
  if (color === COLORS.FAILURE) {
    msgSpan.classList.add('ct-error-message--red');
  }
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

  // Escape dismisses; Tab is trapped within the dialog; focus moves to Dismiss.
  setupKeyboardHandler();
  dismissBtn.focus({ preventScroll: true });
}

// ============================================================
// Shell Builder
// ============================================================

const OVERLAY_TITLE_ID = 'ct-overlay-title';

function buildOverlayShell(root: ShadowRoot, title: string): HTMLElement {
  const existing = root.querySelector('.ct-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'ct-overlay';
  // Expose the overlay as a modal dialog to assistive technology. Only one
  // overlay exists at a time, so a static title id within this (closed) shadow
  // root is safe for aria-labelledby.
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', OVERLAY_TITLE_ID);

  const header = document.createElement('div');
  header.className = 'ct-overlay-header';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'ct-overlay-title';
  titleSpan.id = OVERLAY_TITLE_ID;
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
  /** Viewport-relative left edge of the selection. */
  left: number;
  /** Viewport-relative top edge of the selection rect. */
  anchorTop: number;
  /** Viewport-relative bottom edge of the selection rect. */
  anchorBottom: number;
}

// Fallbacks used when the host is fixed-positioned but not yet measured.
const OVERLAY_FALLBACK_WIDTH = 480;
const OVERLAY_FALLBACK_HEIGHT = 320;

function getSelectionPosition(): Position {
  const fallback: Position = { left: 80, anchorTop: 72, anchorBottom: 100 };

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return fallback;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // A collapsed selection on an empty line (or a textarea/input, whose internal
  // selection is not exposed via window.getSelection) yields an all-zero rect.
  // Fall back to a sensible top-left anchor rather than pinning to (0,0).
  if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) {
    return fallback;
  }

  // The overlay host is position:fixed, so it is positioned in viewport
  // coordinates -- getBoundingClientRect already returns those (no scroll add).
  return { left: rect.left, anchorTop: rect.top, anchorBottom: rect.bottom };
}

function positionOverlay(host: HTMLElement, pos: Position): void {
  const MARGIN = 12;
  const GAP = 8;

  const vpWidth = window.innerWidth;
  const vpHeight = window.innerHeight;

  // Measure the actual rendered overlay so positioning matches its real size
  // (the loading state is short; a result with long text can reach the 320px
  // cap). Reading offset* forces layout, which is fine here. Fall back to the
  // CSS max dimensions if the element is not measurable yet.
  const overlayEl = currentShadowRoot?.querySelector('.ct-overlay') as HTMLElement | null;
  const overlayWidth = overlayEl?.offsetWidth || OVERLAY_FALLBACK_WIDTH;
  const overlayHeight = overlayEl?.offsetHeight || OVERLAY_FALLBACK_HEIGHT;

  // Horizontal: align to the selection's left edge, kept within the viewport.
  let left = pos.left;
  if (left + overlayWidth > vpWidth - MARGIN) left = vpWidth - overlayWidth - MARGIN;
  if (left < MARGIN) left = MARGIN;

  // Vertical: prefer below the selection; if it would not fit, place it above;
  // if neither side has room (small viewport / tall overlay), fall back to a
  // bottom-anchored position. A final clamp then guarantees the whole overlay
  // stays on screen so its text is never cut off at the viewport edge.
  const spaceBelow = vpHeight - pos.anchorBottom;
  const spaceAbove = pos.anchorTop;
  let top: number;
  if (spaceBelow >= overlayHeight + GAP) {
    top = pos.anchorBottom + GAP;
  } else if (spaceAbove >= overlayHeight + GAP) {
    top = pos.anchorTop - overlayHeight - GAP;
  } else {
    top = vpHeight - overlayHeight - MARGIN;
  }
  if (top + overlayHeight > vpHeight - MARGIN) top = vpHeight - overlayHeight - MARGIN;
  if (top < MARGIN) top = MARGIN;

  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
  host.style.pointerEvents = 'none';
}

// ============================================================
// Keyboard Handler
// ============================================================

function setupKeyboardHandler(onEscape?: () => void): void {
  removeKeyboardHandler();

  keydownHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape?.();
      cleanup();
    } else if (e.key === 'Tab') {
      trapFocus(e);
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

/** Focusable elements inside the current overlay, in DOM order. */
function getFocusableElements(): HTMLElement[] {
  if (!currentShadowRoot) return [];
  const selector =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(
    currentShadowRoot.querySelectorAll<HTMLElement>(selector),
  ).filter((el) => !el.hasAttribute('disabled'));
}

/**
 * Keep Tab focus within the dialog. A closed shadow root still exposes its
 * focused node via shadowRoot.activeElement, which lets us cycle correctly.
 */
function trapFocus(e: KeyboardEvent): void {
  const focusables = getFocusableElements();
  if (focusables.length === 0) return;
  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;
  const active = currentShadowRoot?.activeElement as HTMLElement | null;
  const insideOverlay = !!active && focusables.includes(active);

  if (e.shiftKey) {
    if (!insideOverlay || active === first) {
      e.preventDefault();
      last.focus();
    }
  } else if (!insideOverlay || active === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Move focus to the first focusable element in the overlay (e.g. the close button). */
function focusFirstFocusable(): void {
  getFocusableElements()[0]?.focus({ preventScroll: true });
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
  if (data.action === 'reformulate') {
    // 'keep' tone gets a generic title to avoid redundancy; other tones get the label.
    if (data.tone && data.tone !== 'keep') {
      return `Reformulated (${REFORMULATE_TONE_LABELS[data.tone]})`;
    }
    return 'Reformulation';
  }
  if (data.action === 'summarize') {
    // 'standard' gets a generic title; brief/detailed get the label.
    if (data.length && data.length !== 'standard') {
      return `Summary (${SUMMARIZE_LENGTH_LABELS[data.length]})`;
    }
    return 'Summary';
  }
  if (data.targetLanguage) return `Translation to ${data.targetLanguage}`;
  return 'Translation';
}

function focusPrimaryButton(root: ShadowRoot): void {
  const btn = root.querySelector(
    '[data-ct-replace], [data-ct-close]',
  ) as HTMLButtonElement | null;
  btn?.focus({ preventScroll: true });
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
  showToast('Copied!', '#22c55e', 1700);
}

/**
 * Show a longer-lived hint used when in-place Replace could not be applied
 * (e.g. a controlled editor like Teams reverts programmatic edits). The result
 * is already on the clipboard and the original text is left selected, so a
 * single paste replaces it.
 */
export function showReplaceHintToast(): void {
  showToast('Copied — press Ctrl/Cmd+V to replace', '#eab308', 4200);
}

function showToast(message: string, color: string, durationMs: number): void {
  const toastHost = document.createElement('div');
  toastHost.setAttribute('data-ct-toast-host', '');
  toastHost.style.cssText =
    'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;';
  document.body.appendChild(toastHost);

  const shadow = toastHost.attachShadow({ mode: 'closed' });

  // Fade out shortly before removal, regardless of the toast's total duration.
  const fadeDelaySec = Math.max(0, (durationMs - 300) / 1000);

  const style = document.createElement('style');
  style.textContent = `
    .ct-toast {
      background: #313244;
      color: ${color};
      font-size: 13px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 6px 16px;
      border-radius: 20px;
      border: 1px solid ${color};
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      white-space: nowrap;
      animation: ct-toast-in 0.15s ease-out, ct-toast-out 0.2s ease-in ${fadeDelaySec}s forwards;
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
  toast.className = 'ct-toast';
  toast.textContent = message;
  shadow.appendChild(toast);

  setTimeout(() => {
    toastHost.remove();
  }, durationMs);
}
