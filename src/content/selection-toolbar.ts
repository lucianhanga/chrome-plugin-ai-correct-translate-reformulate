// src/content/selection-toolbar.ts
// In-page selection toolbar (static content script).
//
// Some hosts -- notably Outlook on the web -- use a rich editor that cancels the
// browser's `contextmenu` event, so the extension's context-menu items can
// never appear there. This toolbar is a context-menu-free trigger: when the
// user selects text, a small floating bar appears near the selection offering
// the same actions. Choosing one sends a RUN_SELECTION_ACTION message to the
// service worker, which runs the exact same pipeline as the context menu and
// keyboard shortcuts (loading -> LLM -> result overlay).
//
// This script is declared statically in manifest.json, scoped to a narrow
// allowlist of menu-suppressing hosts (see the `content_scripts` matches), so
// it does not run on the wider web. It is built as a self-contained IIFE (see
// vite.config.content.ts) because MV3 content scripts cannot use ES imports.

import type {
  ActionType,
  SupportedLanguage,
  ReformulateTone,
  SummarizeLength,
} from '../shared/types.ts';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_FLAGS,
  LANGUAGE_DISPLAY_NAMES,
  REFORMULATE_TONES,
  REFORMULATE_TONE_LABELS,
  SUMMARIZE_LENGTHS,
  SUMMARIZE_LENGTH_LABELS,
} from '../shared/constants.ts';
import toolbarCSS from './selection-toolbar.css?inline';

// ============================================================
// Module state
// ============================================================

const MARKER = '__ct_selection_toolbar_registered__';

let hostEl: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
// The selection text captured when the toolbar was shown. Interacting with the
// toolbar must not lose it, so it is snapshotted up front (and the toolbar
// preserves the live page selection via mousedown preventDefault, so the result
// overlay's Replace/Append can still act on the original field).
let capturedText = '';
// True while a mouse button is held (a drag-select in progress). selectionchange
// fires continuously during a drag; we let mouseup handle the mouse case and use
// selectionchange only for keyboard selection, so we skip it while the pointer
// is down.
let pointerDown = false;
// Debounce timer for selectionchange (it fires rapidly).
let selectionChangeTimer: ReturnType<typeof setTimeout> | null = null;
// Briefly suppress re-showing right after an action is chosen, so the toolbar
// does not pop back up when the result overlay takes focus.
let suppressed = false;

// ============================================================
// Bootstrap (guard against double injection)
// ============================================================

if (!(window as unknown as Record<string, boolean>)[MARKER]) {
  (window as unknown as Record<string, boolean>)[MARKER] = true;
  registerListeners();
}

function registerListeners(): void {
  // Mouse selection: show once the drag ends.
  document.addEventListener('mouseup', onMouseUp, true);
  // Any selection change (keyboard select, select-all, programmatic, ...). This
  // is the reliable trigger for keyboard selection, which key events can miss.
  document.addEventListener('selectionchange', onSelectionChange);
  // Dismiss triggers.
  document.addEventListener('mousedown', onDocMouseDown, true);
  document.addEventListener('scroll', hideToolbar, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', hideToolbar, true);
}

// ============================================================
// Selection detection
// ============================================================

function onMouseUp(event: MouseEvent): void {
  pointerDown = false;
  if (isInsideToolbar(event.target)) return;
  // Defer so window.getSelection() reflects the finalised selection.
  setTimeout(evaluateSelection, 0);
}

function onSelectionChange(): void {
  // A mouse drag fires selectionchange continuously; let mouseup handle that
  // case so the toolbar does not flicker mid-drag.
  if (pointerDown) return;
  // Don't re-show immediately after the user picked an action.
  if (suppressed) return;
  if (selectionChangeTimer !== null) clearTimeout(selectionChangeTimer);
  selectionChangeTimer = setTimeout(evaluateSelection, 120);
}

function evaluateSelection(): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    hideToolbar();
    return;
  }

  const text = selection.toString();
  if (text.trim() === '') {
    hideToolbar();
    return;
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  // A zero rect means the selection is not visually placeable (e.g. inside an
  // <input>/<textarea>, whose internal selection window.getSelection cannot
  // read). Nothing to anchor to.
  if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) {
    hideToolbar();
    return;
  }

  capturedText = text;
  showToolbar(rect);
}

// ============================================================
// Dismiss handling
// ============================================================

function onDocMouseDown(event: MouseEvent): void {
  pointerDown = true;
  // A mousedown inside the toolbar is handled by the toolbar itself (and must
  // not dismiss it); any other mousedown closes it.
  if (isInsideToolbar(event.target)) return;
  hideToolbar();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && hostEl) {
    hideToolbar();
  }
}

function isInsideToolbar(target: EventTarget | null): boolean {
  return target instanceof Node && hostEl !== null && hostEl.contains(target);
}

// ============================================================
// Toolbar rendering
// ============================================================

function showToolbar(anchor: DOMRect): void {
  const root = createOrReplaceHost();
  renderTopLevel(root);
  positionToolbar(anchor);
}

function createOrReplaceHost(): ShadowRoot {
  hideToolbar();

  const host = document.createElement('div');
  host.setAttribute('data-ct-toolbar-host', '');
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.zIndex = '2147483646';
  // The host wrapper is inert; only the toolbar itself (pointer-events:auto in
  // CSS) receives clicks, so the rest of the page stays interactive.
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = toolbarCSS;
  shadow.appendChild(style);

  hostEl = host;
  shadowRoot = shadow;
  return shadow;
}

function hideToolbar(): void {
  if (hostEl) {
    hostEl.remove();
    hostEl = null;
  }
  shadowRoot = null;
}

/** Build the toolbar container, preserving the page selection on interaction. */
function buildBar(root: ShadowRoot): HTMLElement {
  const existing = root.querySelector('.ct-toolbar');
  if (existing) existing.remove();

  const bar = document.createElement('div');
  bar.className = 'ct-toolbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Correct & Translate actions');
  // Preserve the page selection: a mousedown inside the toolbar would otherwise
  // move focus/collapse the selection, breaking the overlay's in-place Replace.
  bar.addEventListener('mousedown', (e) => e.preventDefault());
  root.appendChild(bar);
  return bar;
}

function makeButton(
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    onClick();
  });
  return btn;
}

function renderTopLevel(root: ShadowRoot): void {
  const bar = buildBar(root);

  bar.appendChild(
    makeButton('Correct', 'ct-tb-btn ct-tb-btn--primary', () => run('correct')),
  );
  bar.appendChild(makeButton('Translate', 'ct-tb-btn', () => renderTranslate(root)));
  bar.appendChild(makeButton('Reformulate', 'ct-tb-btn', () => renderReformulate(root)));
  bar.appendChild(makeButton('Summarize', 'ct-tb-btn', () => renderSummarize(root)));
}

function addBack(bar: HTMLElement, root: ShadowRoot): void {
  bar.appendChild(makeButton('‹', 'ct-tb-btn ct-tb-back', () => renderTopLevel(root)));
  const sep = document.createElement('div');
  sep.className = 'ct-tb-sep';
  bar.appendChild(sep);
}

function renderTranslate(root: ShadowRoot): void {
  const bar = buildBar(root);
  addBack(bar, root);
  for (const lang of SUPPORTED_LANGUAGES) {
    const label = `${LANGUAGE_FLAGS[lang]} ${LANGUAGE_DISPLAY_NAMES[lang]}`;
    bar.appendChild(
      makeButton(label, 'ct-tb-btn', () => run('translate', { targetLanguage: lang })),
    );
  }
  repositionAfterRerender();
}

function renderReformulate(root: ShadowRoot): void {
  const bar = buildBar(root);
  addBack(bar, root);
  for (const tone of REFORMULATE_TONES) {
    bar.appendChild(
      makeButton(REFORMULATE_TONE_LABELS[tone], 'ct-tb-btn', () =>
        run('reformulate', { tone }),
      ),
    );
  }
  repositionAfterRerender();
}

function renderSummarize(root: ShadowRoot): void {
  const bar = buildBar(root);
  addBack(bar, root);
  for (const length of SUMMARIZE_LENGTHS) {
    bar.appendChild(
      makeButton(SUMMARIZE_LENGTH_LABELS[length], 'ct-tb-btn', () =>
        run('summarize', { length }),
      ),
    );
  }
  repositionAfterRerender();
}

// ============================================================
// Positioning
// ============================================================

const MARGIN = 8;
const GAP = 8;
const FALLBACK_WIDTH = 240;
const FALLBACK_HEIGHT = 40;

function positionToolbar(anchor: DOMRect): void {
  const bar = shadowRoot?.querySelector('.ct-toolbar') as HTMLElement | null;
  if (!bar) return;

  const width = bar.offsetWidth || FALLBACK_WIDTH;
  const height = bar.offsetHeight || FALLBACK_HEIGHT;
  const vpWidth = window.innerWidth;
  const vpHeight = window.innerHeight;

  // Horizontal: centre on the selection, clamped into the viewport.
  let left = anchor.left + anchor.width / 2 - width / 2;
  if (left + width > vpWidth - MARGIN) left = vpWidth - width - MARGIN;
  if (left < MARGIN) left = MARGIN;

  // Vertical: prefer just BELOW the selection. Editors like Outlook/Word show
  // their own formatting mini-toolbar directly above the selection, so placing
  // ours below avoids overlapping it. Fall back above only when there's no room
  // below, then clamp so the whole bar stays on screen.
  let top = anchor.bottom + GAP;
  if (top + height > vpHeight - MARGIN) top = anchor.top - height - GAP;
  if (top < MARGIN) top = MARGIN;
  if (top + height > vpHeight - MARGIN) top = vpHeight - height - MARGIN;

  bar.style.left = `${left}px`;
  bar.style.top = `${top}px`;
}

/**
 * After swapping the bar's contents (e.g. entering a sub-menu) its width
 * changes, so re-anchor to the current selection to keep it on screen.
 */
function repositionAfterRerender(): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  positionToolbar(rect);
}

// ============================================================
// Action dispatch
// ============================================================

interface RunOptions {
  targetLanguage?: SupportedLanguage;
  tone?: ReformulateTone;
  length?: SummarizeLength;
}

function run(action: ActionType, opts: RunOptions = {}): void {
  const text = capturedText;
  hideToolbar();
  // Suppress the selectionchange re-show that fires when the result overlay
  // takes focus while the page selection is still present.
  suppressed = true;
  setTimeout(() => { suppressed = false; }, 700);
  if (text.trim() === '') return;

  chrome.runtime
    .sendMessage({
      type: 'RUN_SELECTION_ACTION',
      payload: { action, text, ...opts },
    })
    .catch((err: unknown) => {
      console.error('[selection-toolbar] Failed to dispatch action:', err);
    });
}
