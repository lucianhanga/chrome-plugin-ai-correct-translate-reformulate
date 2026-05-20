// tests/unit/context-menu.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { installChromeMock, resetChromeMock } from '../mocks/chrome.ts';
import { resolveMenuAction, registerContextMenus } from '../../src/background/context-menu.ts';
import { CONTEXT_MENU_IDS } from '../../src/shared/constants.ts';

beforeAll(() => {
  installChromeMock();
});

beforeEach(() => {
  resetChromeMock();
});

describe('resolveMenuAction', () => {
  it('resolves correct_grammar to correct action', () => {
    const result = resolveMenuAction(CONTEXT_MENU_IDS.CORRECT_GRAMMAR);
    expect(result).toEqual({ action: 'correct' });
  });

  it('resolves translate_en to translate action with English', () => {
    const result = resolveMenuAction(CONTEXT_MENU_IDS.TRANSLATE_EN);
    expect(result).toEqual({ action: 'translate', targetLanguage: 'English' });
  });

  it('resolves translate_de to translate action with German', () => {
    const result = resolveMenuAction(CONTEXT_MENU_IDS.TRANSLATE_DE);
    expect(result).toEqual({ action: 'translate', targetLanguage: 'German' });
  });

  it('resolves translate_ro to translate action with Romanian', () => {
    const result = resolveMenuAction(CONTEXT_MENU_IDS.TRANSLATE_RO);
    expect(result).toEqual({ action: 'translate', targetLanguage: 'Romanian' });
  });

  it('returns null for the parent translate menu item', () => {
    const result = resolveMenuAction(CONTEXT_MENU_IDS.TRANSLATE_PARENT);
    expect(result).toBeNull();
  });

  it('returns null for unknown menu item IDs', () => {
    expect(resolveMenuAction('unknown_id')).toBeNull();
    expect(resolveMenuAction('')).toBeNull();
  });
});

describe('registerContextMenus', () => {
  it('calls chrome.contextMenus.removeAll before creating items', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeMock = (globalThis as any).chrome;
    registerContextMenus();
    expect(chromeMock.contextMenus.removeAll).toHaveBeenCalledTimes(1);
  });

  it('creates the correct_grammar menu item', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeMock = (globalThis as any).chrome;
    registerContextMenus();
    const createCalls: Array<{ id: string; title: string; contexts: string[] }> =
      chromeMock.contextMenus.create.mock.calls.map((c: [unknown]) => c[0]);
    const correctItem = createCalls.find((c) => c.id === CONTEXT_MENU_IDS.CORRECT_GRAMMAR);
    expect(correctItem).toBeDefined();
    expect(correctItem?.title).toBe('Correct Grammar');
    expect(correctItem?.contexts).toContain('selection');
  });

  it('creates the translate_parent menu item', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeMock = (globalThis as any).chrome;
    registerContextMenus();
    const createCalls: Array<{ id: string; title: string }> =
      chromeMock.contextMenus.create.mock.calls.map((c: [unknown]) => c[0]);
    const translateParent = createCalls.find((c) => c.id === CONTEXT_MENU_IDS.TRANSLATE_PARENT);
    expect(translateParent).toBeDefined();
    expect(translateParent?.title).toBe('Translate to');
  });

  it('creates translate_en, translate_de, translate_ro as children', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeMock = (globalThis as any).chrome;
    registerContextMenus();
    const createCalls: Array<{ id: string; parentId?: string }> =
      chromeMock.contextMenus.create.mock.calls.map((c: [unknown]) => c[0]);
    const childIds = createCalls
      .filter((c) => c.parentId === CONTEXT_MENU_IDS.TRANSLATE_PARENT)
      .map((c) => c.id);
    expect(childIds).toContain(CONTEXT_MENU_IDS.TRANSLATE_EN);
    expect(childIds).toContain(CONTEXT_MENU_IDS.TRANSLATE_DE);
    expect(childIds).toContain(CONTEXT_MENU_IDS.TRANSLATE_RO);
  });
});
