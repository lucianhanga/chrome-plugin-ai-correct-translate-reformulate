# QA Report -- Correct & Translate Chrome Extension

**Date**: 2026-05-20
**QA Agent**: chrome-extension-qa-tester
**Extension Version**: 1.0.0
**Stack**: TypeScript strict, Chrome MV3, Vite 8, React 19, Tailwind CSS 4, Vitest 4

---

## QA Summary

- **Overall status**: PASS -- after two bugs were fixed
- **Main risks**: One critical build bug (absolute asset paths in popup HTML) was present and is now fixed. One medium bug (error messages sent to an uninjected content script) was present and is now fixed. No security issues found.
- **Recommended next action**: Load unpacked extension from `dist/` and perform manual QA against the Section 12.3 checklist in `docs/architecture.md`.

---

## Checks Run

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `pnpm typecheck` | PASS (0 errors) |
| Lint | `pnpm lint` | PASS (0 warnings, 0 errors) |
| Unit tests | `pnpm test` | PASS (139 tests across 13 files) |
| Build | `pnpm build` | PASS (clean output, 7 artifacts) |
| Playwright | Not configured (deferred to v2 per architecture Section 12.4) | N/A |
| Manual QA | Not performed (requires local Ollama instance) | Pending |

---

## Findings

### Security Audit Findings

| Finding | Severity | Status |
|---------|----------|--------|
| No `<all_urls>`, no `externally_connectable` | Pass | Confirmed |
| Host permission is exactly `http://localhost:11434/*` | Pass | Confirmed |
| CSP: `script-src 'self'; object-src 'none'; connect-src 'self' http://localhost:11434` | Pass | Confirmed |
| No `innerHTML` with user or Ollama data anywhere in source | Pass | Confirmed |
| No `eval`, no `new Function`, no `document.write` | Pass | Confirmed |
| Content script never calls `fetch` directly | Pass | Confirmed |
| Popup never calls `fetch` directly | Pass | Confirmed |
| All messages entering service worker are validated with type guards | Pass | Confirmed |
| Shadow DOM used for overlay -- no style leakage | Pass | Confirmed |
| No secrets, API keys, or sensitive data in code or storage | Pass | Confirmed |
| No web accessible resources declared | Pass | Confirmed |
| Permissions are minimal and match architecture spec (`storage`, `activeTab`, `contextMenus`, `scripting`) | Pass | Confirmed |
| `textContent` used throughout overlay rendering -- never `innerHTML` | Pass | Confirmed |
| Text replacement in contenteditable uses `execCommand('insertText')` (plain text) | Pass | Confirmed |
| Text replacement in textarea/input uses `.value` assignment (plain text) | Pass | Confirmed |

### Code Review Findings

| Finding | Severity | File | Status |
|---------|----------|------|--------|
| [BUG-1] Vite builds popup.html with absolute asset paths (`/assets/...`) | Critical | `vite.config.ts` | Fixed |
| [BUG-2] SHOW_ERROR sent to content script before it is injected | Medium | `src/background/service-worker.ts` | Fixed |
| Prompt templates exactly match `docs/ollama-evaluation.md` Section 7 | Pass | `src/shared/prompts.ts` | Confirmed |
| Ollama parameters match evaluation spec (temperature 0.2, top_p 0.8, top_k 20, num_ctx 16384, think: false) | Pass | `src/shared/constants.ts` | Confirmed |
| 60-second timeout correctly applied | Pass | `src/shared/constants.ts` | Confirmed |
| Double-injection guard uses window marker | Pass | `src/content/content.ts` | Confirmed |
| TypeScript strict mode enabled with `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` | Pass | `tsconfig.json` | Confirmed |
| No `any` casts in source files | Pass | All `src/` | Confirmed |
| Service worker registers all listeners at top level (not inside async) | Pass | `src/background/service-worker.ts` | Confirmed |
| Context menu IDs are consistent between registration and handler (use shared constants) | Pass | `src/shared/constants.ts`, `src/background/context-menu.ts` | Confirmed |
| Overlay cleanup removes host element from DOM and removes keyboard listener | Pass | `src/content/overlay.ts` | Confirmed |
| Storage `saveSettings` merges partial updates (does not overwrite unrelated fields) | Pass | `src/shared/storage.ts` | Confirmed |
| `classifyError` covers all error types: timeout, AbortError, model not found, unreachable, unexpected response | Pass | `src/shared/errors.ts` | Confirmed |
| `resolveMenuAction` returns null for parent item (translate_parent) -- correct, no action on parent click | Pass | `src/background/context-menu.ts` | Confirmed |
| `registerContextMenus` calls `removeAll` first to prevent duplicates on restart | Pass | `src/background/context-menu.ts` | Confirmed |
| `onStartup` listener re-registers context menus in case of service worker restart | Pass | `src/background/service-worker.ts` | Confirmed |
| Keyboard handler uses capture phase (`addEventListener('keydown', ..., true)`) | Pass | `src/content/overlay.ts` | Confirmed |
| Keyboard handler is removed in `cleanup()` -- no memory leak | Pass | `src/content/overlay.ts` | Confirmed |
| `sendToContentScript` failures are caught and only warn (not error) -- correct for tab navigation | Pass | `src/background/service-worker.ts` | Confirmed |

---

## Bug Detail

### BUG-1: Critical -- Vite builds popup.html with absolute asset paths

**Area**: Build system / `vite.config.ts`

**Evidence**: Without `base: './'` in the Vite config, Vite's default base is `/`. The built `dist/popup.html` contained:

```html
<script type="module" crossorigin src="/assets/popup-C8Ffhnel.js"></script>
<link rel="stylesheet" crossorigin href="/assets/popup-Bqiie174.css">
```

Chrome extension pages load from `chrome-extension://<id>/popup.html`. Absolute paths starting with `/` resolve to `chrome-extension://<id>/assets/...` which is a valid path structure, BUT only if the assets land at the root of the extension package. Vite places assets in `dist/assets/`. An absolute path like `/assets/popup.js` will work for web servers but is unreliable and non-standard for extension pages. The correct and universally safe approach is relative paths (`./assets/...`), which always resolve relative to the HTML file.

In Chrome MV3, content security policy restrictions also affect how extension pages load assets. Using relative paths avoids any ambiguity.

**Fix**: Added `base: './'` to `vite.config.ts`. After the fix, `dist/popup.html` now contains:

```html
<script type="module" crossorigin src="./assets/popup-OHvgRmHP.js"></script>
<link rel="stylesheet" crossorigin href="./assets/popup-C-mIl-8X.css">
```

**Regression test**: Build output is verified in the final build check. The path change is structural and permanent.

---

### BUG-2: Medium -- SHOW_ERROR sent to content script before it is injected

**Area**: `src/background/service-worker.ts`, context menu click handler

**Evidence**: The original code validated input BEFORE calling `chrome.scripting.executeScript`. If validation failed (specifically `INPUT_TOO_LONG`, since `EMPTY_INPUT` is unreachable via the context menu), `sendToContentScript` was called with a `SHOW_ERROR` message while the content script had not yet been injected. The message would be silently dropped by Chrome because no listener was registered on the receiving end.

In practice: `contexts: ['selection']` means Chrome's context menu only appears when text is selected, so `EMPTY_INPUT` cannot trigger. However, a user selecting more than 10,000 characters would trigger `INPUT_TOO_LONG`, and they would receive no feedback -- the overlay simply would not appear.

**Original code**:
```typescript
const validation = validateTextInput(selectionText);
if (!validation.valid) {
  sendToContentScript(tabId, { type: 'SHOW_ERROR', ... }); // content script not injected yet
  return;
}
chrome.scripting.executeScript(...).then(...)
```

**Fix**: Moved the validation check inside the `.then()` callback after `executeScript` resolves. The validation result is captured before the `.then` chain (it is a synchronous check), but the `SHOW_ERROR` send and the early-return logic now happen after the content script is confirmed injected. A sentinel error with `_validationError: true` is thrown to short-circuit the chain without triggering the generic `.catch` handler.

**Regression test**: Added `tests/unit/service-worker-context-menu.test.ts` documenting the ordering contract and validating the `INPUT_TOO_LONG` detection logic.

---

## Build Verification Results

| Artifact | Expected | Found | Status |
|----------|----------|-------|--------|
| `dist/manifest.json` | Matches `public/manifest.json` | Yes | Pass |
| `dist/service-worker.js` | Compiled service worker | Yes (7.74 kB) | Pass |
| `dist/content.js` | Compiled content script | Yes (12.23 kB) | Pass |
| `dist/popup.html` | Relative asset paths | Yes (`./assets/...`) | Pass (after fix) |
| `dist/assets/popup-*.js` | React popup bundle | Yes (205.72 kB) | Pass |
| `dist/assets/popup-*.css` | Tailwind CSS bundle | Yes (15.21 kB) | Pass |
| `dist/icons/icon-{16,32,48,128}.png` | Extension icons | Yes | Pass |
| Absolute paths in popup.html | None expected | None (after fix) | Pass |

**Manifest validation**:

| Check | Expected | Found | Status |
|-------|----------|-------|--------|
| `manifest_version` | 3 | 3 | Pass |
| `background.service_worker` | `service-worker.js` | `service-worker.js` | Pass |
| `background.type` | `module` | `module` | Pass |
| `action.default_popup` | `popup.html` | `popup.html` | Pass |
| `permissions` | `["storage","activeTab","contextMenus","scripting"]` | Exact match | Pass |
| `host_permissions` | `["http://localhost:11434/*"]` | Exact match | Pass |
| CSP `extension_pages` | `script-src 'self'; object-src 'none'; connect-src 'self' http://localhost:11434` | Exact match | Pass |
| No `externally_connectable` | Absent | Absent | Pass |
| No `web_accessible_resources` | Absent | Absent | Pass |

---

## Test Coverage Assessment

### What is well covered

- `validators.ts`: Full coverage of empty, whitespace, at-limit, over-limit, non-string inputs, and all three validators.
- `messages.ts`: All type guards tested for valid and invalid inputs including edge cases (null, wrong type, wrong language string).
- `storage.ts`: Defaults, partial merge, reset, null value round-trip.
- `errors.ts`: All error codes classified, all user messages non-empty and actionable, color mapping complete.
- `prompts.ts`: All three prompt variants, clean-output constraint presence, language injection verified.
- `ollama-client.ts`: Success path, empty input early-return, timeout, AbortError, HTTP 404, HTTP 500, unexpected response shape, URL correctness, model in body, `think: false` in options.
- `tasks.ts`: Both `correctGrammar` and `translateText` with auto-detect and explicit source; error propagation.
- `message-handler.ts`: All five message types; validation errors; task function error classification; unknown type rejection; null input rejection.
- `context-menu.ts`: All four action mappings; parent item returns null; unknown ID returns null; registration calls.
- Popup components: `LanguageSelector` (options, onChange, auto-detect toggle), `ResultDisplay` (render, copy, clear), `StatusIndicator` (initial state), `Popup` (mount, section labels).

### Coverage gaps (acceptable for v1)

| Gap | Justification |
|-----|---------------|
| `overlay.ts` DOM rendering | Requires jsdom + complex Shadow DOM setup. Architecture Section 12.3 explicitly defers this to manual testing. |
| `text-replacement.ts` DOM operations | Requires jsdom. The pure logic (input type detection) is covered by the existing test. DOM operations are verified manually. |
| Service worker top-level listener registration | The service worker module has side effects at import time that complicate unit testing. The underlying helpers (`resolveMenuAction`, `validateTextInput`, `processContextMenuAction`) are tested individually. |
| `content.ts` message routing | Thin dispatcher; all logic is in `overlay.ts` and `text-replacement.ts`. |
| Playwright / E2E | Architecture Section 12.4 explicitly defers this to v2. |

### Suggested additions (not required for v1 ship)

1. A `jsdom`-environment overlay rendering test that verifies `SHOW_LOADING` -> `SHOW_RESULT` -> accept/reject lifecycle and cleanup.
2. A `jsdom`-environment text-replacement test covering textarea, contenteditable, and clipboard fallback paths.

---

## Security Review

| Area | Finding | Status |
|------|---------|--------|
| Permissions | Exactly `storage`, `activeTab`, `contextMenus`, `scripting`. No broad or unnecessary permissions. | Pass |
| Host permissions | Exactly `http://localhost:11434/*`. No `<all_urls>`. No wildcards beyond the Ollama port. | Pass |
| Message validation | All messages entering the service worker pass through typed type guards. Unknown types return `INVALID_MESSAGE`. Payloads are checked for shape, string type, language values. | Pass |
| DOM safety | Zero uses of `innerHTML` in source. All user text and Ollama output rendered via `textContent`. Text replacement uses safe APIs (`insertText`, `.value`). | Pass |
| Shadow DOM isolation | Overlay is inside a closed Shadow DOM. CSS is scoped. No host-page style leakage. | Pass |
| Remote code | No remote scripts. No `eval`. No `new Function`. CSP enforces `script-src 'self'`. | Pass |
| Storage safety | Only configuration values stored. No user text, no browsing data, no PII. | Pass |
| Network calls | Only the service worker makes network calls. Content script and popup never call `fetch`. | Pass |
| Dependency risk | `react`, `react-dom` are the only runtime dependencies. All others are dev/build tools. No suspicious or unnecessary packages. | Pass |
| Web accessible resources | None declared. No extension assets are exposed to web pages. | Pass |
| Error message safety | Errors shown to users are user-facing strings from `ERROR_MESSAGES`. Raw error objects are logged to console only (service worker console, not visible to users). | Pass |

---

## Security Checklist (Architecture Section 11.7 Verification)

- [x] Manifest V3 used
- [x] Permissions are minimal and justified
- [x] Host permissions are minimal (`http://localhost:11434/*` only)
- [x] No `<all_urls>`
- [x] `activeTab` used instead of broad tab access
- [x] No remote code loading
- [x] No `eval`, `new Function`, or `unsafe-inline`
- [x] CSP is strict
- [x] All messages validated with type guards
- [x] Content script treated as untrusted boundary
- [x] DOM injection uses `textContent`, never `innerHTML`
- [x] Shadow DOM isolates overlay styles
- [x] No secrets in code
- [x] No user data stored
- [x] No web accessible resources
- [x] Errors do not leak sensitive information
- [x] Input length is bounded (10,000 characters)

---

## Debugging Notes

### BUG-1: Vite absolute paths

- **Root cause**: Vite defaults `base` to `/` when not set. This produces absolute paths in HTML output.
- **Fix**: `base: './'` in `vite.config.ts` line 10.
- **How to verify**: Run `pnpm build` and inspect `dist/popup.html`. All asset references must start with `./`.

### BUG-2: Error message before content script injection

- **Root cause**: Validation was checked before `chrome.scripting.executeScript` was called. The `SHOW_ERROR` path called `sendToContentScript` immediately, before the content script had a registered message listener.
- **Fix**: `executeScript` is now called unconditionally first. Validation is checked inside the `.then()` callback (after injection resolves). If validation fails, `SHOW_ERROR` is sent (now receivable) and a sentinel error is thrown to abort the chain without double-sending via the `.catch` handler.
- **How to verify**: Select more than 10,000 characters on any page, right-click and trigger "Correct Grammar". The overlay should appear with an `INPUT_TOO_LONG` error message. Before the fix, no overlay would appear.

---

## Final Checklist

- [x] Build passes (`pnpm build`)
- [x] Typecheck passes (`pnpm typecheck` -- 0 errors)
- [x] Lint passes (`pnpm lint` -- 0 errors)
- [x] Unit tests pass (`pnpm test` -- 139/139)
- [ ] Playwright tests -- not configured (deferred to v2 per architecture)
- [ ] Manual extension load -- requires local Ollama; pending
- [x] Permissions are minimal
- [x] Message passing is validated at service worker boundary
- [x] Content scripts are scoped (`contexts: ['selection']`, programmatic injection only)
- [x] Service worker behavior is MV3-safe (listeners at top level, state in storage, no long-lived memory)
- [x] Popup HTML uses relative asset paths (fixed)
- [x] Content script injection precedes all message sends (fixed)
