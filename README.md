# Correct & Translate

A Manifest V3 Chrome extension that corrects, translates, and reformulates
selected text using a large language model. It runs against a **local Ollama
LLM by default** (fully private, nothing leaves your machine) or, opt-in,
against **OpenAI**.

[![CI](https://github.com/lucianhanga/correct-and-translate/actions/workflows/ci.yml/badge.svg)](https://github.com/lucianhanga/correct-and-translate/actions/workflows/ci.yml)
![tests](https://img.shields.io/badge/tests-278%20unit%20%7C%20117%20e2e-22c55e)
![manifest](https://img.shields.io/badge/Manifest-V3-1e3a5f)
![version](https://img.shields.io/badge/version-1.0.0-1e3a5f)

> The **CI** badge reflects the type-check, lint, unit-test and build workflow
> that runs on every pull request and on `main`. The end-to-end suite needs a
> local Ollama and is run locally -- see [Testing](#testing).

## What it does

The extension acts on text you select on any page. It exposes three actions:

- **Correct** -- fixes grammar and spelling.
- **Translate** -- translates between English, German, and Romanian.
- **Reformulate** -- rewrites the text in one of four tones: Keep tone,
  Professional, Friendly, or Natural. A persistent **Keep terminology** toggle
  tells the model to leave domain terms unchanged.

Every result is **copied to the clipboard automatically** and shows a metadata
line with the model name, token count, and elapsed time. When the selection is
inside an editable field, the result overlay also offers in-place **Replace**
and **Append**.

## Features

- Three text actions: Correct, Translate (EN / DE / RO), Reformulate (4 tones).
- Dual provider: local **Ollama** (default, private) or **OpenAI** (opt-in).
- Two entry points: the right-click **context menu** and the toolbar **popup**.
- In-place **Replace** / **Append** for editable selections; clipboard copy for
  non-editable ones.
- **Auto-copy** of every result to the clipboard.
- Result metadata: model, token count, and elapsed time on every result.
- Isolated in-page result overlay rendered with Shadow DOM.

## Providers

The extension routes every request through one provider at a time, chosen in
the popup Settings section.

| Provider | Where it runs | Default | Credential | Text leaves the machine |
|----------|---------------|---------|------------|--------------------------|
| Ollama (local) | `http://localhost:11434` | Yes | None | No |
| OpenAI | `https://api.openai.com` | No | API key | Yes |

- **Ollama** is the default. All text stays on your own machine; no credential
  is needed. Use this when a correction or translation must stay private.
- **OpenAI** is opt-in. The first time you switch to it, a one-time data-egress
  consent dialog appears, and a persistent yellow `OpenAI` badge is shown in the
  popup while it is active. Use this if you do not want to run a local model and
  accept that your selected text is sent to OpenAI.

See [docs/provider-setup-and-privacy.md](docs/provider-setup-and-privacy.md)
for full setup and privacy details.

## Installation

This extension is not on the Chrome Web Store; load it unpacked.

### 1. Get the extension files

Either build from source (see [Development](#development)) so a `dist/` folder
is produced, or use the `correct-and-translate-<version>.zip` archive created by
`pnpm package` and unzip it.

### 2. Load it into Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `dist/` folder (or the unzipped
   package folder).

### 3. Ollama prerequisite (default provider)

If you use the default Ollama provider, Ollama must be running locally with a
model pulled. The shipped default model is `qwen3:14b`.

```bash
ollama pull qwen3:14b
ollama serve
```

The extension's service worker sends requests stamped with a
`chrome-extension://` origin, which Ollama rejects by default. Allow that
origin **before** starting Ollama:

```bash
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"
```

Then start (or restart) Ollama so the new process picks up the setting. On
macOS, `launchctl setenv` does not survive a reboot -- run it again after a
restart, or install a LaunchAgent for a permanent fix.

### 4. OpenAI setup (optional)

To use OpenAI instead, open the extension popup, expand **Settings**, set
**Provider** to `OpenAI`, accept the one-time consent dialog, and enter your
OpenAI API key. The supported models are `gpt-5.4-nano` and `gpt-5-nano`.
Full instructions, including the API key permissions required for key
validation, are in
[docs/provider-setup-and-privacy.md](docs/provider-setup-and-privacy.md).

## Usage

**From the context menu:** select text on a page, right-click, open the
`Correct/Translate/Reformulate` menu, and pick an action. For text inside an
editable field, the result overlay offers Replace and Append; otherwise the
result is copied to the clipboard.

**From the popup:** click the toolbar icon, paste or type text into the quick
action area, pick an action, and the result is shown inline and copied to the
clipboard.

## Development

The project uses **pnpm** and **Vite**.

```bash
pnpm install        # install dependencies
pnpm dev            # build in watch mode (vite build --watch)
pnpm build          # production build into dist/
pnpm typecheck      # tsc type check (src and e2e configs)
pnpm lint           # eslint over src and tests
pnpm test           # unit tests (Vitest)
pnpm test:e2e       # end-to-end tests (Playwright; requires Ollama running)
pnpm package        # build dist/ and zip it for distribution
```

`pnpm package` runs `scripts/package.sh`, which builds `dist/` and zips its
contents into `correct-and-translate-<version>.zip` at the repository root,
with `manifest.json` at the archive root so the zip is itself loadable via
"Load unpacked".

After a build, load (or reload) the `dist/` folder in `chrome://extensions` to
pick up changes.

## Testing

| Test suite | Tool | Notes |
|------------|------|-------|
| `pnpm test` | Vitest | Unit tests in `tests/unit/`. Chrome APIs are mocked. |
| `pnpm test:e2e` | Playwright | End-to-end tests in `tests/e2e/`. Builds with `build:test`, then drives a real Chrome. Requires Ollama running. |
| `pnpm typecheck` | tsc | Type-checks `src` and the e2e config. |
| `pnpm lint` | ESLint | Lints `src` and `tests`. |

### Latest test run

Run on the `main` branch on 2026-05-21, against a real local Ollama
(model `qwen3:14b`):

| Check | Result |
|-------|--------|
| `pnpm typecheck` (tsc, src + e2e) | pass |
| `pnpm lint` (eslint) | pass |
| `pnpm test` -- unit (Vitest) | 278 / 278 passed (15 files) |
| `pnpm test:e2e` -- end-to-end (Playwright) | 117 / 117 passed (~2.2 min) |

These figures are from a local run. The end-to-end suite is not part of CI
(see below), so re-run it locally before a release.

### Continuous integration

The [`CI` workflow](.github/workflows/ci.yml) runs `pnpm typecheck`, `pnpm lint`,
`pnpm test` (unit) and `pnpm build` on every pull request to `main` and on every
push to `main`. The **CI** badge at the top of this README reflects it.

The end-to-end suite (`pnpm test:e2e`) is **not** run in CI: it drives a real
Chrome against a real local Ollama with the `qwen3:14b` model (~16 GB), which
does not fit a GitHub-hosted runner. It remains a local pre-release gate.

## Architecture

The extension follows the standard Manifest V3 split:

- **Service worker** (`src/background/`) -- the only component that makes
  network requests. It registers the context menu, validates incoming messages
  against typed contracts, resolves the active provider, and calls the LLM.
- **Content script** (`src/content/`) -- injected on demand when an action is
  triggered. It reads the selection, renders the Shadow DOM result overlay, and
  performs in-place Replace / Append.
- **Popup** (`src/popup/`) -- a React + Tailwind UI for settings and quick
  actions.

Both providers sit behind a provider-agnostic `LLMClient` interface; a
`getActiveClient` factory in `src/background/llm-client.ts` is the single place
that branches on the configured provider. Messages between components are typed
and validated.

The authoritative design document is
[docs/architecture.md](docs/architecture.md) (v1.2).

## Permissions and privacy

The extension declares the `<all_urls>` host permission. This is needed so the
content script can be injected into **cross-origin iframes** -- webmail compose
editors (for example GMX) host their editable area in such a frame, which the
`activeTab` permission alone cannot reach.

Broad host access does **not** mean broad network access. Network egress is
restricted by the `connect-src` Content Security Policy, which permits requests
only to local Ollama (`http://localhost:11434`) and OpenAI
(`https://api.openai.com`). The extension cannot contact any other server.

- In **Ollama mode**, nothing leaves the device.
- In **OpenAI mode**, the selected text is sent over HTTPS to
  `api.openai.com`. This is gated by a one-time consent dialog and surfaced by a
  persistent badge.
- The OpenAI API key is stored only in `chrome.storage.local` (per machine,
  never synced), is redacted before it reaches the popup, is never logged, and
  is only ever sent to `api.openai.com` in the `Authorization` header.
- The text you process is never persisted.

## Project structure

```
src/
  background/      Service worker, message routing, provider clients
    service-worker.ts    MV3 entry point
    message-handler.ts   Message router and validation
    llm-client.ts        LLMClient interface + getActiveClient factory
    ollama-client.ts     Ollama provider client
    openai-client.ts     OpenAI provider client
    tasks.ts             Correct / translate / reformulate helpers
    context-menu.ts      Context menu registration and mapping
  content/         On-demand content script and overlay
    content.ts           Content script entry point
    overlay.ts           Shadow DOM result overlay
    overlay.css          Overlay styles
    text-replacement.ts  Replace / Append into editable fields
  popup/           React popup UI (settings + quick actions)
  shared/          Types, messages, prompts, storage, validators, constants
public/            manifest.json and static assets
scripts/           package.sh (build + zip)
tests/             unit/ (Vitest) and e2e/ (Playwright)
docs/              architecture.md and supporting documents
```

## License

No `LICENSE` file currently exists in this repository, so the project's license
is not yet specified. (`package.json` carries `"license": "ISC"`, but without a
`LICENSE` file this is not an authoritative grant.)
