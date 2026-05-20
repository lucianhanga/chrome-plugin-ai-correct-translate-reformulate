// src/content/text-replacement.ts
// Replaces selected text with the given result string.
// For editable elements: replaces the selection in-place.
// For non-editable: copies to clipboard.

import { showCopiedToast } from './overlay.ts';

// ============================================================
// Public API
// ============================================================

/**
 * Apply the given result text to the current selection.
 *
 * - If the selection is inside a <textarea> or <input[type=text]>:
 *     Replace the selected range using .value manipulation.
 * - If the selection is inside a contenteditable element:
 *     Replace using document.execCommand('insertText') for plain-text safety.
 * - Otherwise:
 *     Copy the result to the clipboard and show a "Copied!" toast.
 */
export async function applyResult(resultText: string): Promise<void> {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    await copyToClipboard(resultText);
    return;
  }

  const anchorNode = selection.anchorNode;
  if (!anchorNode) {
    await copyToClipboard(resultText);
    return;
  }

  // Walk up the DOM to find the nearest editable element
  const editableElement = findEditableAncestor(anchorNode);

  if (editableElement instanceof HTMLTextAreaElement || editableElement instanceof HTMLInputElement) {
    replaceInInputElement(editableElement, resultText);
    return;
  }

  if (editableElement instanceof HTMLElement && isContentEditable(editableElement)) {
    replaceInContentEditable(resultText);
    return;
  }

  // Non-editable context: copy to clipboard
  await copyToClipboard(resultText);
}

// ============================================================
// Replacement Implementations
// ============================================================

/**
 * Replace selected text in a <textarea> or <input> element.
 * Uses .value manipulation with explicit selection range update.
 */
function replaceInInputElement(
  element: HTMLTextAreaElement | HTMLInputElement,
  newText: string,
): void {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;
  const current = element.value;

  element.value = current.slice(0, start) + newText + current.slice(end);

  // Move cursor to end of inserted text
  const newCursorPos = start + newText.length;
  element.selectionStart = newCursorPos;
  element.selectionEnd = newCursorPos;

  // Dispatch input/change events so frameworks (React, Vue, etc.) pick up the change
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Replace selected text in a contenteditable element.
 * Uses document.execCommand('insertText') which inserts plain text safely,
 * respecting undo history.
 */
function replaceInContentEditable(newText: string): void {
  // document.execCommand is deprecated but remains the correct approach for
  // plain-text insertion into contenteditable that respects undo stacks.
  // insertText inserts plain text (never HTML), so it is safe against XSS.
  const success = document.execCommand('insertText', false, newText);
  if (!success) {
    // Fallback: manual range deletion + text node insertion
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(newText);
    range.insertNode(textNode);
    // Collapse cursor to end of inserted node
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

// ============================================================
// Clipboard
// ============================================================

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for contexts where clipboard API is restricted
    fallbackCopyToClipboard(text);
  }
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
