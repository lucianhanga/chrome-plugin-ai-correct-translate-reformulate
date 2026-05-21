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

// ============================================================
// resolveMenuAction
// ============================================================

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

  it('resolves reformulate_keep to reformulate action with keep tone', () => {
    const result = resolveMenuAction(CONTEXT_MENU_IDS.REFORMULATE_KEEP);
    expect(result).toEqual({ action: 'reformulate', tone: 'keep' });
  });

  it('resolves reformulate_professional to reformulate action with professional tone', () => {
    const result = resolveMenuAction(CONTEXT_MENU_IDS.REFORMULATE_PROFESSIONAL);
    expect(result).toEqual({ action: 'reformulate', tone: 'professional' });
  });

  it('resolves reformulate_friendly to reformulate action with friendly tone', () => {
    const result = resolveMenuAction(CONTEXT_MENU_IDS.REFORMULATE_FRIENDLY);
    expect(result).toEqual({ action: 'reformulate', tone: 'friendly' });
  });

  it('resolves reformulate_natural to reformulate action with natural tone', () => {
    const result = resolveMenuAction(CONTEXT_MENU_IDS.REFORMULATE_NATURAL);
    expect(result).toEqual({ action: 'reformulate', tone: 'natural' });
  });

  it('returns null for the parent translate menu item', () => {
    const result = resolveMenuAction(CONTEXT_MENU_IDS.TRANSLATE_PARENT);
    expect(result).toBeNull();
  });

  it('returns null for the root menu item', () => {
    expect(resolveMenuAction(CONTEXT_MENU_IDS.CT_ROOT)).toBeNull();
  });

  it('returns null for the reformulate parent menu item', () => {
    expect(resolveMenuAction(CONTEXT_MENU_IDS.REFORMULATE_PARENT)).toBeNull();
  });

  it('returns null for the keep_terminology checkbox item', () => {
    expect(resolveMenuAction(CONTEXT_MENU_IDS.KEEP_TERMINOLOGY)).toBeNull();
  });

  it('returns null for separators', () => {
    expect(resolveMenuAction(CONTEXT_MENU_IDS.SEPARATOR_1)).toBeNull();
    expect(resolveMenuAction(CONTEXT_MENU_IDS.SEPARATOR_2)).toBeNull();
    expect(resolveMenuAction(CONTEXT_MENU_IDS.SEPARATOR_3)).toBeNull();
  });

  it('returns null for unknown menu item IDs', () => {
    expect(resolveMenuAction('unknown_id')).toBeNull();
    expect(resolveMenuAction('')).toBeNull();
  });
});

// ============================================================
// registerContextMenus
// ============================================================

describe('registerContextMenus', () => {
  it('calls chrome.contextMenus.removeAll before creating items', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeMock = (globalThis as any).chrome;
    await registerContextMenus();
    expect(chromeMock.contextMenus.removeAll).toHaveBeenCalledTimes(1);
  });

  it('creates the correct_grammar menu item under ct_root', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeMock = (globalThis as any).chrome;
    await registerContextMenus();
    const createCalls: Array<{ id: string; title: string; contexts: string[]; parentId?: string }> =
      chromeMock.contextMenus.create.mock.calls.map((c: [unknown]) => c[0]);
    const correctItem = createCalls.find((c) => c.id === CONTEXT_MENU_IDS.CORRECT_GRAMMAR);
    expect(correctItem).toBeDefined();
    expect(correctItem?.title).toBe('Correct Grammar');
    expect(correctItem?.contexts).toContain('selection');
    expect(correctItem?.parentId).toBe(CONTEXT_MENU_IDS.CT_ROOT);
  });

  it('creates the translate_parent menu item under ct_root', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeMock = (globalThis as any).chrome;
    await registerContextMenus();
    const createCalls: Array<{ id: string; title: string; parentId?: string }> =
      chromeMock.contextMenus.create.mock.calls.map((c: [unknown]) => c[0]);
    const translateParent = createCalls.find((c) => c.id === CONTEXT_MENU_IDS.TRANSLATE_PARENT);
    expect(translateParent).toBeDefined();
    expect(translateParent?.title).toBe('Translate to');
    expect(translateParent?.parentId).toBe(CONTEXT_MENU_IDS.CT_ROOT);
  });

  it('creates translate_en, translate_de, translate_ro as children of translate_parent', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeMock = (globalThis as any).chrome;
    await registerContextMenus();
    const createCalls: Array<{ id: string; parentId?: string }> =
      chromeMock.contextMenus.create.mock.calls.map((c: [unknown]) => c[0]);
    const childIds = createCalls
      .filter((c) => c.parentId === CONTEXT_MENU_IDS.TRANSLATE_PARENT)
      .map((c) => c.id);
    expect(childIds).toContain(CONTEXT_MENU_IDS.TRANSLATE_EN);
    expect(childIds).toContain(CONTEXT_MENU_IDS.TRANSLATE_DE);
    expect(childIds).toContain(CONTEXT_MENU_IDS.TRANSLATE_RO);
  });

  it('creates the reformulate_parent menu item under ct_root', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeMock = (globalThis as any).chrome;
    await registerContextMenus();
    const createCalls: Array<{ id: string; title: string; parentId?: string }> =
      chromeMock.contextMenus.create.mock.calls.map((c: [unknown]) => c[0]);
    const reformulateParent = createCalls.find((c) => c.id === CONTEXT_MENU_IDS.REFORMULATE_PARENT);
    expect(reformulateParent).toBeDefined();
    expect(reformulateParent?.title).toBe('Reformulate');
    expect(reformulateParent?.parentId).toBe(CONTEXT_MENU_IDS.CT_ROOT);
  });

  it('creates all 4 reformulate tone items under reformulate_parent', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeMock = (globalThis as any).chrome;
    await registerContextMenus();
    const createCalls: Array<{ id: string; parentId?: string }> =
      chromeMock.contextMenus.create.mock.calls.map((c: [unknown]) => c[0]);
    const childIds = createCalls
      .filter((c) => c.parentId === CONTEXT_MENU_IDS.REFORMULATE_PARENT)
      .map((c) => c.id);
    expect(childIds).toContain(CONTEXT_MENU_IDS.REFORMULATE_KEEP);
    expect(childIds).toContain(CONTEXT_MENU_IDS.REFORMULATE_PROFESSIONAL);
    expect(childIds).toContain(CONTEXT_MENU_IDS.REFORMULATE_FRIENDLY);
    expect(childIds).toContain(CONTEXT_MENU_IDS.REFORMULATE_NATURAL);
  });

  it('creates the keep_terminology checkbox with checked=true by default', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeMock = (globalThis as any).chrome;
    await registerContextMenus();
    const createCalls: Array<{ id: string; type?: string; checked?: boolean }> =
      chromeMock.contextMenus.create.mock.calls.map((c: [unknown]) => c[0]);
    const keepItem = createCalls.find((c) => c.id === CONTEXT_MENU_IDS.KEEP_TERMINOLOGY);
    expect(keepItem).toBeDefined();
    expect(keepItem?.type).toBe('checkbox');
    expect(keepItem?.checked).toBe(true);
  });

  it('creates the keep_terminology checkbox with checked=false when settings say so', async () => {
    // Seed storage so getSettings() returns keepTerminology: false
    await chrome.storage.local.set({ settings: { keepTerminology: false } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeMock = (globalThis as any).chrome;
    // Re-install get so it reads the seeded value
    resetChromeMock();
    await chrome.storage.local.set({ settings: { keepTerminology: false } });

    await registerContextMenus();
    const createCalls: Array<{ id: string; checked?: boolean }> =
      chromeMock.contextMenus.create.mock.calls.map((c: [unknown]) => c[0]);
    const keepItem = createCalls.find((c) => c.id === CONTEXT_MENU_IDS.KEEP_TERMINOLOGY);
    expect(keepItem?.checked).toBe(false);
  });

  it('creates three separators under ct_root', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromeMock = (globalThis as any).chrome;
    await registerContextMenus();
    const createCalls: Array<{ id: string; type?: string; parentId?: string }> =
      chromeMock.contextMenus.create.mock.calls.map((c: [unknown]) => c[0]);
    const separators = createCalls.filter(
      (c) => c.type === 'separator' && c.parentId === CONTEXT_MENU_IDS.CT_ROOT,
    );
    expect(separators.length).toBe(3);
  });
});
