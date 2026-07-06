// src/content/text-replacement.ts
// Applies result text to the page: replaces or appends in editable fields,
// or copies to the clipboard when the selection is not editable.

import { showCopiedToast, showReplaceHintToast } from './overlay.ts';

// Appended after replaced or inserted result text, so a new line follows it.
const RESULT_SUFFIX = '\n';

// ============================================================
// Captured selection target
// ============================================================

// The translate flow shows a loading overlay and then a result overlay between
// selecting text and applying the result; interacting with the overlay can
// collapse the live page selection. The selection is therefore captured up
// front, and Replace/Append operate on the captured target rather than a live
// window.getSelection().
export type CapturedTarget =
  | { kind: 'input'; element: HTMLTextAreaElement | HTMLInputElement; start: number; end: number }
  | { kind: 'contenteditable'; range: Range; host: HTMLElement }
  | { kind: 'none' };

/**
 * Capture the current selection as a target for later Replace/Append.
 * Must be called while the original selection is still live.
 */
export function captureSelectionTarget(): CapturedTarget {
  // A selection inside a <textarea>/<input> is not reported by
  // window.getSelection(); it lives on the focused element's
  // selectionStart/selectionEnd, so check the active element first.
  const active = document.activeElement;
  if (
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement && isTextInput(active))
  ) {
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? 0;
    if (end > start) {
      return { kind: 'input', element: active, start, end };
    }
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return { kind: 'none' };

  const anchorNode = selection.anchorNode;
  if (!anchorNode) return { kind: 'none' };

  const editable = findEditableAncestor(anchorNode);
  if (editable instanceof HTMLTextAreaElement || editable instanceof HTMLInputElement) {
    return {
      kind: 'input',
      element: editable,
      start: editable.selectionStart ?? 0,
      end: editable.selectionEnd ?? 0,
    };
  }
  if (editable instanceof HTMLElement && isContentEditable(editable)) {
    return {
      kind: 'contenteditable',
      range: selection.getRangeAt(0).cloneRange(),
      host: editable,
    };
  }
  return { kind: 'none' };
}

/** True when the captured target can be edited in place (Replace/Append apply). */
export function isEditableTarget(target: CapturedTarget): boolean {
  return target.kind !== 'none';
}

// ============================================================
// Public API
// ============================================================

/**
 * Apply the given result text to the current (live) selection.
 * Used by the grammar-correction flow, which has no confirmation step.
 */
export async function applyResult(resultText: string): Promise<void> {
  await replaceCaptured(captureSelectionTarget(), resultText);
}

/**
 * Replace the captured selection with the given text.
 * Falls back to the clipboard when the target is not editable.
 */
export async function replaceCaptured(target: CapturedTarget, text: string): Promise<void> {
  if (target.kind === 'input') {
    replaceRangeInInput(target.element, target.start, target.end, text + RESULT_SUFFIX);
    return;
  }
  if (target.kind === 'contenteditable') {
    insertIntoCapturedRange(target.host, target.range, text + RESULT_SUFFIX, 'replace');
    return;
  }
  await copyToClipboard(text);
}

/**
 * Append the given text immediately after the captured selection,
 * keeping the original. Falls back to the clipboard when not editable.
 */
export async function appendCaptured(target: CapturedTarget, text: string): Promise<void> {
  if (target.kind === 'input') {
    // Insert immediately after the original selection; the original is kept.
    replaceRangeInInput(target.element, target.end, target.end, text + RESULT_SUFFIX);
    return;
  }
  if (target.kind === 'contenteditable') {
    insertIntoCapturedRange(target.host, target.range, text + RESULT_SUFFIX, 'append');
    return;
  }
  await copyToClipboard(text);
}

/** Copy text to the clipboard without showing a toast (used for the auto-copy on result). */
export async function copyResultToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    fallbackCopyToClipboard(text);
  }
}

// ============================================================
// Replacement Implementations
// ============================================================

/**
 * Replace the [start, end) range of an <input>/<textarea> value with newText.
 * Passing start === end inserts without removing anything.
 */
function replaceRangeInInput(
  element: HTMLTextAreaElement | HTMLInputElement,
  start: number,
  end: number,
  newText: string,
): void {
  const current = element.value;
  element.value = current.slice(0, start) + newText + current.slice(end);

  const newCursorPos = start + newText.length;
  element.selectionStart = newCursorPos;
  element.selectionEnd = newCursorPos;

  // Dispatch input/change events so frameworks (React, Vue, etc.) pick up the change.
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Insert text into a captured contenteditable range.
 * 'replace' overwrites the range; 'append' inserts after the range's end.
 * Uses execCommand('insertText') for plain-text, undo-friendly insertion.
 *
 * The editing host is re-focused first. When the user clicks the overlay's
 * Replace/Append button (or presses Enter), focus is on the overlay -- not the
 * editor -- so execCommand('insertText') would run with no focused editable and
 * fail. Managed rich-text editors (ProseMirror-based: Confluence, Notion, ...)
 * only apply an insertText input event when they own focus; without the focus
 * the raw-DOM fallback below mutates their DOM behind their model and the text
 * lands before the original instead of replacing it.
 */
function insertIntoCapturedRange(
  host: HTMLElement,
  range: Range,
  text: string,
  mode: 'replace' | 'append',
): void {
  // `host` is the nearest editable ancestor of the selection, which in managed
  // editors (Teams, etc.) is often an inner <p> that only *inherits*
  // contenteditable. Focusing that node does not put focus in the editor. Walk
  // up to the element that actually owns the contenteditable attribute -- the
  // editor root -- and drive focus/selection/insertion through it.
  const root = editableRootOf(host);

  const targetRange = range.cloneRange();
  if (mode === 'append') {
    targetRange.collapse(false); // collapse to the end of the original selection
  }

  // Re-focus the editor root and re-apply the captured selection. Returns the
  // live selection, or null if unavailable.
  const reselect = (): Selection | null => {
    root.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (!sel) return null;
    sel.removeAllRanges();
    sel.addRange(targetRange.cloneRange());
    return sel;
  };

  const before = root.textContent ?? '';

  // Apply the selection now, then defer the actual insertion by a task. Managed
  // editors (Teams) derive their internal model selection from the DOM selection
  // via the async `selectionchange` event; inserting in the same tick would run
  // against a stale model selection and the editor would revert the change.
  // The overlay's own cleanup() re-focuses the page after this returns, so the
  // deferred callback re-asserts focus and selection before inserting.
  reselect();

  setTimeout(() => {
    const sel = reselect();
    if (!sel) return;

    const ok = document.execCommand('insertText', false, text);
    if (!ok || (root.textContent ?? '') === before) {
      // execCommand did not apply (or changed nothing): raw-DOM fallback for
      // simple contenteditables that reject execCommand.
      rawInsertIntoRange(targetRange, text);
    }

    // Verify the change survives the editor's reconciliation. A controlled
    // editor (Teams) can revert a programmatic edit a moment later. If the text
    // snaps back, leave the original selected and prompt the user to paste --
    // the result is already on the clipboard, and a trusted paste always works.
    setTimeout(() => {
      if ((root.textContent ?? '') === before) {
        reselect();
        showReplaceHintToast();
      }
    }, 250);
  }, 0);
}

/**
 * Raw DOM insertion into a range. Works for plain inputs and simple
 * contenteditables; not guaranteed to survive a managed editor's re-render.
 */
function rawInsertIntoRange(range: Range, text: string): void {
  const r = range.cloneRange();
  r.deleteContents();
  const node = document.createTextNode(text);
  r.insertNode(node);
  r.setStartAfter(node);
  r.setEndAfter(node);
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

// ============================================================
// Clipboard
// ============================================================

async function copyToClipboard(text: string): Promise<void> {
  await copyResultToClipboard(text);
  showCopiedToast();
}

function fallbackCopyToClipboard(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

// ============================================================
// DOM Helpers
// ============================================================

function findEditableAncestor(node: Node): Element | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLTextAreaElement) return current;
    if (current instanceof HTMLInputElement && isTextInput(current)) return current;
    if (current instanceof HTMLElement && isContentEditable(current)) return current;
    current = current.parentNode;
  }
  return null;
}

function isContentEditable(element: HTMLElement): boolean {
  return element.isContentEditable === true || element.getAttribute('contenteditable') === 'true';
}

/**
 * Walk up from an editable node to the element that actually declares the
 * contenteditable attribute (the editor root). Inner nodes like <p> inherit
 * `isContentEditable` but are not focusable editors; the root is. Falls back to
 * the given node if no explicit contenteditable ancestor is found.
 */
function editableRootOf(node: HTMLElement): HTMLElement {
  let root = node;
  let current: HTMLElement | null = node;
  while (current && current.isContentEditable) {
    const attr = current.getAttribute('contenteditable');
    if (attr === 'true' || attr === '' || attr === 'plaintext-only') {
      root = current;
    }
    current = current.parentElement;
  }
  return root;
}

function isTextInput(input: HTMLInputElement): boolean {
  const type = (input.type ?? 'text').toLowerCase();
  return ['text', 'search', 'url', 'tel', 'email', ''].includes(type);
}
