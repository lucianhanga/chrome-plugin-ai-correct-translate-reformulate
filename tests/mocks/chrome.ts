// tests/mocks/chrome.ts
// Minimal typed mock for Chrome extension APIs used in unit tests.

import { vi } from 'vitest';

type StorageData = Record<string, unknown>;

let storageData: StorageData = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[] | null): Promise<StorageData> => {
        if (keys === null) return { ...storageData };
        if (typeof keys === 'string') {
          return { [keys]: storageData[keys] };
        }
        const result: StorageData = {};
        for (const key of keys) {
          result[key] = storageData[key];
        }
        return result;
      }),
      set: vi.fn(async (items: StorageData): Promise<void> => {
        Object.assign(storageData, items);
      }),
      clear: vi.fn(async (): Promise<void> => {
        storageData = {};
      }),
      remove: vi.fn(async (keys: string | string[]): Promise<void> => {
        const toRemove = typeof keys === 'string' ? [keys] : keys;
        for (const key of toRemove) {
          delete storageData[key];
        }
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    lastError: null as chrome.runtime.LastError | null,
  },
  contextMenus: {
    create: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn((_callback?: () => void) => {
      if (_callback) _callback();
    }),
    update: vi.fn().mockResolvedValue(undefined),
    onClicked: {
      addListener: vi.fn(),
    },
  },
  scripting: {
    executeScript: vi.fn(),
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn(),
  },
  action: {
    setIcon: vi.fn(),
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
};

/**
 * Installs the chrome mock onto the global object.
 * Call this in a beforeAll or at the top of a test file.
 */
export function installChromeMock(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).chrome = chromeMock;
}

/**
 * Resets all mock call histories and storage state.
 * Call this in beforeEach.
 */
export function resetChromeMock(): void {
  storageData = {};
  vi.clearAllMocks();
  // Re-install implementations after clearAllMocks wipes them
  chromeMock.storage.local.get.mockImplementation(async (keys: string | string[] | null) => {
    if (keys === null) return { ...storageData };
    if (typeof keys === 'string') return { [keys]: storageData[keys] };
    const result: StorageData = {};
    for (const key of (keys as string[])) {
      result[key] = storageData[key];
    }
    return result;
  });
  chromeMock.storage.local.set.mockImplementation(async (items: StorageData) => {
    Object.assign(storageData, items);
  });
  chromeMock.storage.local.clear.mockImplementation(async () => {
    storageData = {};
  });
  chromeMock.contextMenus.removeAll.mockImplementation((_callback?: () => void) => {
    if (_callback) _callback();
  });
  chromeMock.contextMenus.update.mockResolvedValue(undefined);
}

export { chromeMock };
