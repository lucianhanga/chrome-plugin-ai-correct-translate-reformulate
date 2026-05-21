// src/background/context-menu.ts
// Context menu registration and menu item ID to action mapping.

import type { SupportedLanguage, ActionType, ReformulateTone } from '../shared/types.ts';
import { CONTEXT_MENU_IDS } from '../shared/constants.ts';
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
    title: 'English',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.TRANSLATE_DE,
    parentId: CONTEXT_MENU_IDS.TRANSLATE_PARENT,
    title: 'German',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.TRANSLATE_RO,
    parentId: CONTEXT_MENU_IDS.TRANSLATE_PARENT,
    title: 'Romanian',
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
    case CONTEXT_MENU_IDS.REFORMULATE_KEEP:
      return { action: 'reformulate', tone: 'keep' };
    case CONTEXT_MENU_IDS.REFORMULATE_PROFESSIONAL:
      return { action: 'reformulate', tone: 'professional' };
    case CONTEXT_MENU_IDS.REFORMULATE_FRIENDLY:
      return { action: 'reformulate', tone: 'friendly' };
    case CONTEXT_MENU_IDS.REFORMULATE_NATURAL:
      return { action: 'reformulate', tone: 'natural' };
    // Parent items, separators, and checkbox handled elsewhere -- return null.
    default:
      return null;
  }
}
