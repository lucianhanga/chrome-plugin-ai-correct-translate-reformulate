// src/background/context-menu.ts
// Context menu registration and menu item ID to action mapping.

import type { SupportedLanguage, ActionType } from '../shared/types.ts';
import { CONTEXT_MENU_IDS } from '../shared/constants.ts';

// ============================================================
// Registration
// ============================================================

/**
 * Register all context menu items for the extension.
 * Removes all existing items first to prevent duplicates on service worker restart.
 */
export function registerContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.CORRECT_GRAMMAR,
      title: 'Correct Grammar',
      contexts: ['selection'],
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.TRANSLATE_PARENT,
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
  });
}

// ============================================================
// Menu Item ID Resolver
// ============================================================

export interface ResolvedMenuAction {
  action: ActionType;
  targetLanguage?: SupportedLanguage;
}

/**
 * Resolves a context menu item ID to an action type and optional target language.
 * Returns null for unknown or parent menu items.
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
    default:
      return null;
  }
}
