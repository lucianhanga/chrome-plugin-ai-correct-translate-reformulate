// tests/unit/manifest.test.ts
// Security regression guard for the extension's permission surface (#44).
//
// The extension intentionally requests the broad `<all_urls>` host permission.
// This is NOT an oversight: the content script is injected on-demand (only on a
// context-menu click) via chrome.scripting.executeScript into the clicked
// frame, and webmail compose editors (e.g. GMX) host their editable area in a
// CROSS-ORIGIN iframe that `activeTab` alone cannot reach. `<all_urls>` is what
// enables that injection (see docs/architecture.md §3.2 / §3.4 and
// tests/e2e/iframe-injection.test.ts).
//
// Compensating controls (also asserted here):
//   - There is exactly ONE static content script -- the in-page selection
//     toolbar -- scoped to a narrow allowlist of hosts (Outlook on the web)
//     whose editor suppresses the native context menu. Everywhere else,
//     injection is still programmatic and user-initiated. There are NO
//     `web_accessible_resources`.
//   - The `connect-src` CSP is the real egress lock: outbound requests can only
//     reach the extension itself, the local Ollama endpoint, and the OpenAI API,
//     regardless of the broad host permission.
//
// This test pins the exact permission set so that ANY future widening of the
// surface (a new permission, a broader host pattern, a looser CSP, or a newly
// added static content script / web-accessible resource) fails CI and gets a
// deliberate review rather than silently shipping.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(resolve(here, '../../public/manifest.json'), 'utf8'),
) as {
  manifest_version: number;
  permissions: string[];
  host_permissions: string[];
  content_security_policy?: { extension_pages?: string };
  content_scripts?: Array<{ matches?: string[]; js?: string[]; all_frames?: boolean; run_at?: string }>;
  web_accessible_resources?: unknown[];
  commands?: Record<string, { suggested_key?: Record<string, string>; description?: string }>;
};

describe('manifest permission surface (security regression guard)', () => {
  it('uses Manifest V3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('declares exactly the expected API permissions (no more)', () => {
    expect([...manifest.permissions].sort()).toEqual(
      ['activeTab', 'clipboardWrite', 'contextMenus', 'scripting', 'storage'].sort(),
    );
  });

  it('uses <all_urls> host permission deliberately for cross-origin iframe injection', () => {
    // If this ever needs to change, update docs/architecture.md and revisit #44.
    expect(manifest.host_permissions).toEqual(['<all_urls>']);
  });

  it('locks network egress via connect-src to only Ollama and OpenAI', () => {
    const csp = manifest.content_security_policy?.extension_pages ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain(
      "connect-src 'self' http://localhost:11434 https://api.openai.com",
    );
    // No wildcard egress.
    expect(csp).not.toContain('connect-src *');
    expect(csp).not.toMatch(/connect-src[^;]*\bhttps:\s/);
  });

  it('restricts the one static content script to a narrow allowlist of menu-suppressing hosts', () => {
    // The extension has exactly ONE static content script: the in-page selection
    // toolbar. It exists only for hosts (Outlook on the web) whose editor cancels
    // the native context menu, so the context-menu items can never appear there.
    //
    // This test pins its scope so it can never silently widen to the whole web.
    // Everywhere else, injection remains programmatic and user-initiated (the
    // result overlay is still injected on-demand via chrome.scripting).
    const scripts = manifest.content_scripts ?? [];
    expect(scripts.length).toBe(1);

    const toolbar = scripts[0]!;
    expect(toolbar.js).toEqual(['selection-toolbar.js']);
    expect([...(toolbar.matches ?? [])].sort()).toEqual(
      [
        '*://outlook.office.com/*',
        '*://outlook.office365.com/*',
        '*://outlook.live.com/*',
        '*://outlook.cloud.microsoft/*',
      ].sort(),
    );

    // The static content script must NEVER be broadened to all sites. The broad
    // <all_urls> host permission is deliberate for on-demand injection, but the
    // *static* toolbar script stays scoped to the allowlist above.
    for (const pattern of toolbar.matches ?? []) {
      expect(pattern).not.toBe('<all_urls>');
      expect(pattern).not.toMatch(/:\/\/\*\/\*/); // e.g. *://*/*
    }
  });

  it('exposes no web-accessible resources', () => {
    expect(manifest.web_accessible_resources ?? []).toEqual([]);
  });

  it('declares keyboard commands as a context-menu-free trigger (needs no extra permission)', () => {
    // Keyboard shortcuts let the extension run on hosts (e.g. Outlook on the
    // web) whose editors suppress the native context menu. The `commands` key
    // is a manifest-level key and grants no API permission, so the permission
    // surface above is unchanged.
    const commands = manifest.commands ?? {};
    expect(Object.keys(commands).sort()).toEqual(
      ['correct-grammar', 'reformulate-default', 'translate-default'].sort(),
    );
    // Chrome allows at most 4 commands to carry a suggested key.
    const withKeys = Object.values(commands).filter((c) => c.suggested_key !== undefined);
    expect(withKeys.length).toBeLessThanOrEqual(4);
    // `commands` must NOT appear in the API permissions array.
    expect(manifest.permissions).not.toContain('commands');
  });
});
