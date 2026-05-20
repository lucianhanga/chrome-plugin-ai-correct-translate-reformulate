// src/content/text-replacement.ts
// Applies result text to the page: replaces or appends in editable fields,
// or copies to the clipboard when the selection is not editable.

import { showCopiedToast } from './overlay.ts';

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
  | { kind: 'contenteditable'; range: Range }
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
    return { kind: 'contenteditable', range: selection.getRangeAt(0).cloneRange() };
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
    insertIntoCapturedRange(target.range, text + RESULT_SUFFIX, 'replace');
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
    insertIntoCapturedRange(target.range, text + RESULT_SUFFIX, 'append');
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
 */
function insertIntoCapturedRange(range: Range, text: string, mode: 'replace' | 'append'): void {
  const selection = window.getSelection();
  if (!selection) return;

  const targetRange = range.cloneRange();
  if (mode === 'append') {
    targetRange.collapse(false); // collapse to the end of the original selection
  }

  selection.removeAllRanges();
  selection.addRange(targetRange);

  // execCommand('insertText') inserts plain text only (never HTML) -- safe against XSS.
  const ok = document.execCommand('insertText', false, text);
  if (!ok) {
    // Fallback: manual range manipulation.
    targetRange.deleteContents();
    const node = document.createTextNode(text);
    targetRange.insertNode(node);
    targetRange.setStartAfter(node);
    targetRange.setEndAfter(node);
    selection.removeAllRanges();
    selection.addRange(targetRange);
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

function isTextInput(input: HTMLInputElement): boolean {
  const type = (input.type ?? 'text').toLowerCase();
  return ['text', 'search', 'url', 'tel', 'email', ''].includes(type);
}
