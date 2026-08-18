# AGENTS.md — Correct & Translate

Guidance for AI agents (and humans) working in this repository. For the
full design rationale see `docs/architecture.md` — it is the authoritative
design document; this file is the orientation map.

## What this is

A Manifest V3 Chrome extension that acts on selected text with an LLM:
**Correct** (grammar/spelling), **Translate** (EN / DE / RO / RO-no-diacritics /
ES / IT), **Reformulate** (tones: keep / professional / friendly / natural,
with a "Keep terminology" toggle), and **Summarize** (lengths: brief /
standard / detailed). Every result is auto-copied to the clipboard and shows
a metadata line (model · tokens · elapsed). Editable selections also get
in-place **Replace** / **Append**.

Two providers behind one abstraction:

- **Ollama** (default, private): `http://localhost:11434`, default model
  `qwen3.6:35b-a3b`, no credential, nothing leaves the machine.
- **OpenAI** (opt-in): `gpt-5.4-nano` / `gpt-5-nano`, API key in
  `chrome.storage.local`, gated by a one-time egress-consent dialog and a
  persistent yellow badge in the popup.

## Commands

```bash
pnpm install        # pnpm is pinned (^11.1.3, devEngines); CI uses pnpm 11 + Node 22
pnpm dev            # vite build --watch
pnpm build          # production build → dist/ (three chained vite builds)
pnpm typecheck      # tsc --noEmit (src) + tsc -p tsconfig.e2e.json — run both
pnpm lint           # eslint src tests
pnpm test           # Vitest unit tests (Chrome APIs mocked, no LLM needed)
pnpm test:e2e       # Playwright against real Chrome + real LLM (Ollama preferred,
                    # else OPENAI_API_KEY); NOT run in CI
pnpm package        # build + zip dist/ → correct-and-translate-<version>.zip
```

E2E notes: requires `pnpm build:test` output in `dist-test/` (never touch
`dist/` or `public/manifest.json` for tests). With a heavy local model run
`--workers=1` — the default 5-way parallelism starves inference and causes
timeouts. Ollama must allow the extension origin:
`launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"` before `ollama serve`.

Pre-release gate: typecheck + lint + unit + e2e. `package.json` and
`public/manifest.json` versions must match (enforced by `scripts/package.sh`
and the tag check in `.github/workflows/release.yml`).

## Architecture

Standard MV3 split; **the service worker is the only component that makes
network requests**.

```
src/
  background/      Service worker — context menus, commands, message routing,
                   provider dispatch, content-script injection
    service-worker.ts    MV3 entry: onMessage listener (sender.id trust check),
                         context-menu click + command handlers, dispatchAction()
                         (validate → inject content.js into the frame holding the
                         selection → drive or hand off the flow),
                         syncAllSitesToolbar() dynamic registration.
                         Test hooks: globalThis.__ctClickHandler / __ctCommandHandler.
    message-handler.ts   Router for popup-originated messages; per-type guards;
                         Romanian-no-diacritics post-processing
                         (stripRomanianDiacritics) after translate.
    llm-client.ts        LLMClient interface { call, healthCheck } +
                         getActiveClient(settings) — the SINGLE place that
                         branches on settings.provider.
    ollama-client.ts     POST {endpoint}/api/chat (NOT /v1/... — only /api/chat
                         honors the options block); AbortController timeout
                         (60 s); /api/tags health (5 s).
    openai-client.ts     POST /v1/chat/completions; minimal body (gpt-5-nano
                         rejects non-default sampling params — temperature is
                         silently dropped); status → typed LLMError codes;
                         key only in Authorization header, never logged.
    tasks.ts             correctGrammar / translateText / reformulateText /
                         summarizeText — build system prompt, call client.
    context-menu.ts      Menu tree (ct_root), resolveMenuAction(), keyboard
                         COMMAND_IDS, resolveCommandAction().
  content/         Content scripts (classic-script IIFEs, import-free)
    content.ts           On-demand overlay script, injected per action into the
                         selection's frame; double-injection guard
                         window.__ct_content_registered__; drives the
                         START_TRANSLATE/REFORMULATE/SUMMARIZE flows itself
                         (only Correct is driven end-to-end by the worker).
    overlay.ts/.css      Closed Shadow DOM singleton overlay (data-ct-overlay-host,
                         z-index 2147483647); states loading/result/error;
                         fixed-position host (no scroll-jump), viewport clamping;
                         focus trap, Escape, aria-live; toasts for copied/replace-hint.
    selection-toolbar.ts/.css  Static content script scoped to the Outlook
                         allowlist (hosts that suppress the native context menu);
                         floating toolbar on selection (mouseup + debounced
                         selectionchange), sub-menus for language/tone/length,
                         mousedown preventDefault so the page selection survives;
                         sends RUN_SELECTION_ACTION.
    text-replacement.ts  CapturedTarget (input / contenteditable / none);
                         Replace/Append via execCommand('insertText') with
                         deferred insertion + 250 ms revert verification for
                         managed editors (Teams) → clipboard fallback hint;
                         dispatches input/change events for React/Vue.
  popup/           React 19 + Tailwind 4 UI
    Popup.tsx            Quick Action + collapsible Settings; OpenAI badge.
    components/          StatusIndicator (HEALTH_CHECK), QuickAction (tablist,
                         char counter vs MAX_INPUT_LENGTH), ResultDisplay
                         (auto-copy + meta line), SettingsSection (provider
                         toggle + consent dialog, endpoint, model dropdowns,
                         redacted API key with __SET__ sentinel + Validate,
                         default language, toolbar-all-sites toggle),
                         selectors (Language/Tone/Length).
  shared/          types.ts, messages.ts (all message contracts + type guards),
                   prompts.ts (system-prompt builders), storage.ts (single
                   'settings' key in chrome.storage.local, merge-with-defaults
                   + enum coercion), validators.ts, constants.ts (DEFAULT_MODEL,
                   endpoints, timeouts, MAX_INPUT_LENGTH=10_000, model lists),
                   errors.ts (ErrorCode, LLMError, classifyError),
                   text.ts (stripRomanianDiacritics).
public/            manifest.json + icons
scripts/           package.sh (version check + zip), generate-icons.py (stdlib PNG)
tests/             unit/ (Vitest), e2e/ (Playwright), mocks/, helpers/, setup/
docs/              architecture.md (authoritative design) + guides and
                   historical docs (see "Docs" below)
```

Path aliases: `@shared/*` → `src/shared/*`, `@background/*` → `src/background/*`.

### Message contracts (src/shared/messages.ts)

Popup/content → service worker: `CORRECT_GRAMMAR`, `TRANSLATE`,
`REFORMULATE`, `SUMMARIZE`, `HEALTH_CHECK`, `GET_SETTINGS`, `SAVE_SETTINGS`,
`VALIDATE_OPENAI_KEY`, `RUN_SELECTION_ACTION` (selection toolbar; handled in
the listener itself because it needs `sender.tab.id`/`frameId`).

Service worker → content script (with explicit `frameId`): `SHOW_LOADING`,
`SHOW_RESULT`, `SHOW_ERROR`, `DISMISS_OVERLAY`, `START_TRANSLATE`,
`START_REFORMULATE`, `START_SUMMARIZE`.

Trust boundary: the `onMessage` listener rejects any sender whose
`sender.id !== chrome.runtime.id`; payloads then go through per-type type
guards. `GET_SETTINGS` redacts the OpenAI key to the sentinel `'__SET__'`;
`SAVE_SETTINGS` strips the sentinel so a redacted key never overwrites the
real one.

### Four entry points, one pipeline

Context menu, popup quick action, keyboard commands (`correct-grammar` =
Ctrl/Cmd+Shift+Y, `translate-default` = Ctrl/Cmd+Shift+L, `reformulate-default`
= unassigned), and the Outlook selection toolbar all converge on the same
typed-message pipeline and `getActiveClient` provider dispatch. Keyboard
commands have no frame context, so the worker injects a `readSelectionText()`
probe into **all frames** and picks the first non-empty selection (webmail
editors live in cross-origin iframes — this is also why the manifest needs
`<all_urls>`).

### Prompts (src/shared/prompts.ts)

Language-lock is the central design constraint: Correct / Reformulate /
Summarize must keep the input language (never silently translate). The rule is
phrased around the **dominant** language ("the language most of the text is
written in") so mixed-language messages can't drift into the minority ("second")
language. The `LANGUAGE_LOCK` block is appended **last** to reformulate prompts
("FINAL AND MOST IMPORTANT RULE") because tone instructions bias models toward
English — this fixed a real English→Romanian regression. When "Keep
terminology" is on, an explicit exception follows the lock so domain/technical
terms (e.g. English CS vocabulary like "best practices", "code review", "pull
request"), product names, and proper nouns stay in their original language —
an earlier absolute wording of the lock ("in no other language") silently
overrode the terminology rule and folded English terms into the dominant
language. A German form-of-address block mirrors the input's T–V register
("du" stays "du" for every tone, including professional; "Sie" only when the
input uses "Sie"); the same mirroring rule is appended to German-target
translation prompts. Translate to Romanian comes in two variants: proper
diacritics (prompt rule) and a plain-ASCII variant (prompt rule +
deterministic `stripRomanianDiacritics` post-processing). Temperatures:
correct/translate 0.2, reformulate 0.3 (keep) / 0.4, summarize 0.3.

## Permissions, privacy, security

- Permissions: `storage`, `activeTab`, `contextMenus`, `scripting`,
  `clipboardWrite`; host `<all_urls>` (cross-origin iframe injection).
  `tests/unit/manifest.test.ts` pins this exact surface — changing the
  manifest means updating that guard deliberately.
- Network egress is locked by CSP `connect-src 'self' http://localhost:11434
  https://api.openai.com`. No other server can be contacted.
- OpenAI API key: only `chrome.storage.local` (never sync), redacted before
  reaching the popup, only sent to `api.openai.com` in the Authorization
  header, never logged; error paths never surface raw response bodies.
- Processed text is never persisted.
- Content overlay/toolbar use closed Shadow DOM with `ct-`-prefixed
  hand-written CSS so page styles can't leak in.

## Conventions

- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
  + `noUnusedLocals/Parameters`. Two tsconfigs; `pnpm typecheck` covers both.
- ESLint flat config: `no-explicit-any` is an error; unused-var escape is the
  `_` prefix. No Prettier — match the existing file style.
- Commit messages: conventional, seen in history — `feat:`, `fix:`,
  `docs:`, `test:`, `refactor:`, `ci:`, optionally scoped
  (`fix(overlay): ...`), with PR numbers on merges (`... (#76)`).
- Content scripts must stay import-free IIFEs (built via
  `vite.config.content.ts`, parameterised by `CONTENT_ENTRY` / `CONTENT_FILE`
  / `CONTENT_NAME` / `CONTENT_OUT_DIR` env vars).
- `base: './'` in the main vite config is load-bearing (Chrome can't resolve
  absolute asset paths in extension pages).
- Unit tests use the hand-rolled typed Chrome mock in `tests/mocks/chrome.ts`;
  jsdom per-file via `@vitest-environment jsdom` for DOM tests. E2E fixtures
  served by a tiny static server started in Playwright global setup.
- UI strings are hardcoded English (no i18n); languages are LLM targets only.
- Popup styling is Tailwind 4 with an inlined Catppuccin palette; overlay and
  toolbar use hand-written shadow CSS with the same palette.

## Docs

- `docs/architecture.md` — authoritative design doc (large; mostly current,
  minor staleness vs 1.11–1.13).
- Current operational/user docs: `docs/PUBLISHING.md` (store submission
  checklist), `docs/store-listing.md`, `docs/user-guide.md`,
  `docs/ollama-install-guide.md`, `docs/openai-setup-guide.md`,
  `docs/provider-setup-and-privacy.md`.
- Historical (context only, do not treat as current spec):
  `docs/dispatch-plan.md`, `docs/meeting-notes-kickoff.md`,
  `docs/qa-report.md`, `docs/openai-provider-design.md` (implemented;
  superseded by architecture.md §14), `docs/ollama-evaluation.md`
  (benchmarks whose conclusions match the current defaults).

## Gotchas

- Only `/api/chat` (not `/v1/chat/completions`) honors Ollama `options` —
  do not "modernize" the Ollama endpoint.
- OpenAI nano models reject non-default sampling params — the client drops
  `temperature` on purpose.
- In-place insertion into managed editors (Teams/Outlook) must stay
  deferred (`setTimeout 0`) and verified (`setTimeout 250` re-check with
  clipboard fallback); same-tick insertion gets reverted.
- `contenteditable` ancestry: only the node declaring the attribute is the
  real editor root (`editableRootOf`); inner nodes merely inherit
  `isContentEditable`.
- Selections inside `<input>`/`<textarea>` are invisible to
  `window.getSelection()` — capture via `document.activeElement` first, and
  the selection toolbar deliberately doesn't appear for them.
- The overlay host is `position: fixed` at `top:0;left:0` from creation to
  avoid a scroll-jump; positioning uses viewport rects with a final clamp.
- `types.ts` `OllamaChatRequest` places `think` inside `options` while the
  runtime builder sends it top-level — the runtime builder is authoritative
  (known stale interface).
