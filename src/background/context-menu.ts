// src/background/context-menu.ts
// Context menu registration and menu item ID to action mapping.

import type { SupportedLanguage, ActionType, ReformulateTone, SummarizeLength, ExtensionSettings } from '../shared/types.ts';
import { CONTEXT_MENU_IDS, LANGUAGE_FLAGS, LANGUAGE_DISPLAY_NAMES } from '../shared/constants.ts';
import { getSettings } from '../shared/storage.ts';

// ============================================================
// Registration
// ============================================================

/**
 * Register all context menu items for the extension.
 * Removes all existing items first to prevent duplicates on service worker restart.
 * Reads settings to initialise the keepTerminology checkbox checked state.
 */
export async function registerContextMenus(): Promise<void> {
  // Wrap removeAll in a Promise so the await chain is clean.
  await new Promise<void>((resolve) => {
    chrome.contextMenus.removeAll(resolve);
  });

  const settings = await getSettings();

  // Root entry
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.CT_ROOT,
    title: 'Correct/Translate/Reformulate',
    contexts: ['selection'],
  });

  // Correct Grammar
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.CORRECT_GRAMMAR,
    parentId: CONTEXT_MENU_IDS.CT_ROOT,
    title: 'Correct Grammar',
    contexts: ['selection'],
  });

  // Separator 1
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.SEPARATOR_1,
    parentId: CONTEXT_MENU_IDS.CT_ROOT,
    type: 'separator',
    contexts: ['selection'],
  });

  // Translate submenu
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.TRANSLATE_PARENT,
    parentId: CONTEXT_MENU_IDS.CT_ROOT,
    title: 'Translate to',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.TRANSLATE_EN,
    parentId: CONTEXT_MENU_IDS.TRANSLATE_PARENT,
    title: `${LANGUAGE_FLAGS.English} ${LANGUAGE_DISPLAY_NAMES.English}`,
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.TRANSLATE_DE,
    parentId: CONTEXT_MENU_IDS.TRANSLATE_PARENT,
    title: `${LANGUAGE_FLAGS.German} ${LANGUAGE_DISPLAY_NAMES.German}`,
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.TRANSLATE_RO,
    parentId: CONTEXT_MENU_IDS.TRANSLATE_PARENT,
    title: `${LANGUAGE_FLAGS.Romanian} ${LANGUAGE_DISPLAY_NAMES.Romanian}`,
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.TRANSLATE_RO_ASCII,
    parentId: CONTEXT_MENU_IDS.TRANSLATE_PARENT,
    title: `${LANGUAGE_FLAGS['Romanian (no diacritics)']} ${LANGUAGE_DISPLAY_NAMES['Romanian (no diacritics)']}`,
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.TRANSLATE_ES,
    parentId: CONTEXT_MENU_IDS.TRANSLATE_PARENT,
    title: `${LANGUAGE_FLAGS.Spanish} ${LANGUAGE_DISPLAY_NAMES.Spanish}`,
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.TRANSLATE_IT,
    parentId: CONTEXT_MENU_IDS.TRANSLATE_PARENT,
    title: `${LANGUAGE_FLAGS.Italian} ${LANGUAGE_DISPLAY_NAMES.Italian}`,
    contexts: ['selection'],
  });

  // Separator 2
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.SEPARATOR_2,
    parentId: CONTEXT_MENU_IDS.CT_ROOT,
    type: 'separator',
    contexts: ['selection'],
  });

  // Reformulate submenu
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.REFORMULATE_PARENT,
    parentId: CONTEXT_MENU_IDS.CT_ROOT,
    title: 'Reformulate',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.REFORMULATE_KEEP,
    parentId: CONTEXT_MENU_IDS.REFORMULATE_PARENT,
    title: 'Keep tone',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.REFORMULATE_PROFESSIONAL,
    parentId: CONTEXT_MENU_IDS.REFORMULATE_PARENT,
    title: 'Professional',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.REFORMULATE_FRIENDLY,
    parentId: CONTEXT_MENU_IDS.REFORMULATE_PARENT,
    title: 'Friendly',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.REFORMULATE_NATURAL,
    parentId: CONTEXT_MENU_IDS.REFORMULATE_PARENT,
    title: 'Natural',
    contexts: ['selection'],
  });

  // Separator 3
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.SEPARATOR_3,
    parentId: CONTEXT_MENU_IDS.CT_ROOT,
    type: 'separator',
    contexts: ['selection'],
  });

  // Summarize submenu
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.SUMMARIZE_PARENT,
    parentId: CONTEXT_MENU_IDS.CT_ROOT,
    title: 'Summarize',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.SUMMARIZE_BRIEF,
    parentId: CONTEXT_MENU_IDS.SUMMARIZE_PARENT,
    title: 'Brief',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.SUMMARIZE_STANDARD,
    parentId: CONTEXT_MENU_IDS.SUMMARIZE_PARENT,
    title: 'Standard',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.SUMMARIZE_DETAILED,
    parentId: CONTEXT_MENU_IDS.SUMMARIZE_PARENT,
    title: 'Detailed',
    contexts: ['selection'],
  });

  // Separator 4
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.SEPARATOR_4,
    parentId: CONTEXT_MENU_IDS.CT_ROOT,
    type: 'separator',
    contexts: ['selection'],
  });

  // Keep Terminology checkbox
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.KEEP_TERMINOLOGY,
    parentId: CONTEXT_MENU_IDS.CT_ROOT,
    type: 'checkbox',
    title: 'Keep terminology',
    checked: settings.keepTerminology,
    contexts: ['selection'],
  });
}

// ============================================================
// Menu Item ID Resolver
// ============================================================

export interface ResolvedMenuAction {
  action: ActionType;
  targetLanguage?: SupportedLanguage;
  tone?: ReformulateTone;
  length?: SummarizeLength;
}

/**
 * Resolves a context menu item ID to an action type and optional parameters.
 * Returns null for parent items, separators, and the keep_terminology checkbox
 * (those are handled separately in the service worker before this is called).
 */
export function resolveMenuAction(menuItemId: string): ResolvedMenuAction | null {
  switch (menuItemId) {
    case CONTEXT_MENU_IDS.CORRECT_GRAMMAR:
      return { action: 'correct' };
    case CONTEXT_MENU_IDS.TRANSLATE_EN:
      return { action: 'translate', targetLanguage: 'English' };
    case CONTEXT_MENU_IDS.TRANSLATE_DE:
      return { action: 'translate', targetLanguage: 'German' };
    case CONTEXT_MENU_IDS.TRANSLATE_RO:
      return { action: 'translate', targetLanguage: 'Romanian' };
    case CONTEXT_MENU_IDS.TRANSLATE_RO_ASCII:
      return { action: 'translate', targetLanguage: 'Romanian (no diacritics)' };
    case CONTEXT_MENU_IDS.TRANSLATE_ES:
      return { action: 'translate', targetLanguage: 'Spanish' };
    case CONTEXT_MENU_IDS.TRANSLATE_IT:
      return { action: 'translate', targetLanguage: 'Italian' };
    case CONTEXT_MENU_IDS.REFORMULATE_KEEP:
      return { action: 'reformulate', tone: 'keep' };
    case CONTEXT_MENU_IDS.REFORMULATE_PROFESSIONAL:
      return { action: 'reformulate', tone: 'professional' };
    case CONTEXT_MENU_IDS.REFORMULATE_FRIENDLY:
      return { action: 'reformulate', tone: 'friendly' };
    case CONTEXT_MENU_IDS.REFORMULATE_NATURAL:
      return { action: 'reformulate', tone: 'natural' };
    case CONTEXT_MENU_IDS.SUMMARIZE_BRIEF:
      return { action: 'summarize', length: 'brief' };
    case CONTEXT_MENU_IDS.SUMMARIZE_STANDARD:
      return { action: 'summarize', length: 'standard' };
    case CONTEXT_MENU_IDS.SUMMARIZE_DETAILED:
      return { action: 'summarize', length: 'detailed' };
    // Parent items, separators, and checkbox handled elsewhere -- return null.
    default:
      return null;
  }
}

// ============================================================
// Keyboard Command Resolver
// ============================================================

/**
 * Command names declared in manifest.json under "commands". Kept here so the
 * service worker and its tests share one source of truth.
 */
export const COMMAND_IDS = {
  CORRECT_GRAMMAR: 'correct-grammar',
  TRANSLATE_DEFAULT: 'translate-default',
  REFORMULATE_DEFAULT: 'reformulate-default',
} as const;

/**
 * Resolves a keyboard command name to an action. Unlike context-menu items,
 * commands cannot carry per-language / per-tone parameters, so they fall back
 * to the user's stored defaults (the same defaults the popup uses).
 *
 * Keyboard commands are a context-menu-free trigger: they work on hosts whose
 * editors suppress the browser's native context menu (e.g. Outlook on the web,
 * whose compose editor cancels the contextmenu event), where the extension's
 * context-menu items can never appear.
 */
export function resolveCommandAction(
  command: string,
  settings: ExtensionSettings,
): ResolvedMenuAction | null {
  switch (command) {
    case COMMAND_IDS.CORRECT_GRAMMAR:
      return { action: 'correct' };
    case COMMAND_IDS.TRANSLATE_DEFAULT:
      return { action: 'translate', targetLanguage: settings.defaultTargetLanguage };
    case COMMAND_IDS.REFORMULATE_DEFAULT:
      return { action: 'reformulate', tone: settings.defaultReformulateTone };
    default:
      return null;
  }
}
