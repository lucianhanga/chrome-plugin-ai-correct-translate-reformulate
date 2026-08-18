# Correct & Translate

A Manifest V3 Chrome extension that corrects, translates, and reformulates
selected text using a large language model. It runs against a **local Ollama
LLM by default** (fully private, nothing leaves your machine) or, opt-in,
against **OpenAI**.

[![CI](https://github.com/lucianhanga/chrome.extension.ai.correct.translate.reformulate/actions/workflows/ci.yml/badge.svg)](https://github.com/lucianhanga/chrome.extension.ai.correct.translate.reformulate/actions/workflows/ci.yml)
![tests](https://img.shields.io/badge/tests-369%20unit%20%7C%20134%20e2e-22c55e)
![manifest](https://img.shields.io/badge/Manifest-V3-1e3a5f)
![version](https://img.shields.io/badge/version-1.14.0-1e3a5f)
![license](https://img.shields.io/badge/license-MIT-22c55e)
[![release](https://img.shields.io/github/v/release/lucianhanga/chrome.extension.ai.correct.translate.reformulate)](https://github.com/lucianhanga/chrome.extension.ai.correct.translate.reformulate/releases/latest)

> The **CI** badge reflects the type-check, lint, unit-test and build workflow
> that runs on every pull request and on `main`. The end-to-end suite needs a
> local Ollama and is run locally -- see [Testing](#testing).

## What it does

The extension acts on text you select on any page. It exposes four actions:

- **Correct** -- fixes grammar and spelling.
- **Translate** -- translates between English, German, Romanian, Spanish, and Italian.
  Romanian comes in two variants: **Romanian** (correct, with diacritics) and
  **Romanian (no diacritics)** (plain ASCII, for legacy/ASCII-only systems).
- **Reformulate** -- rewrites the text in one of four tones: Keep tone,
  Professional, Friendly, or Natural. A persistent **Keep terminology** toggle
  tells the model to leave domain terms unchanged.
- **Summarize** -- produces a short summary at one of three lengths: Brief,
  Standard, or Detailed. The summary stays in the input language.

Every result is **copied to the clipboard automatically** and shows a metadata
line with the model name, token count, and elapsed time. When the selection is
inside an editable field, the result overlay also offers in-place **Replace**
and **Append**.

## Features

- Four text actions: Correct, Translate (EN / DE / RO / ES / IT), Reformulate (4 tones),
  Summarize (3 lengths). The context-menu Translate items show country flags.
- Language-aware: Correct, Reformulate, and Summarize keep the input/detected
  language (text is never silently translated). For **mixed-language**
  messages the output stays in the dominant language, and with **Keep
  terminology** on, English technical terms (e.g. "best practices", "code
  review") stay in English. For **German**, the form of address is mirrored:
  "du" stays "du" for every tone (including professional) and "Sie" is used
  only when the input uses "Sie". Translate offers two Romanian
  targets: with diacritics, and a plain-ASCII "no diacritics" variant.
- Dual provider: local **Ollama** (default, private) or **OpenAI** (opt-in).
- Four entry points: the right-click **context menu**, the toolbar **popup**,
  **keyboard shortcuts**, and an in-page **selection toolbar** on sites (like
  Outlook on the web) whose editor suppresses the native right-click menu.
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

> The extension has been **submitted to the Chrome Web Store** and is awaiting
> review. Once published, a store link will be added here. In the meantime (or
> if you prefer), you can install it unpacked using the steps below.

You can install it unpacked using either a prebuilt release (recommended) or
your own build. New to the extension? See the illustrated
[User Guide](docs/user-guide.md).

### 1. Get the extension files

**Easiest -- download a prebuilt release:** grab the latest
`correct-and-translate-<version>.zip` from the
[Releases](https://github.com/lucianhanga/chrome.extension.ai.correct.translate.reformulate/releases/latest)
page and unzip it. No build required; the unzipped folder is loadable as-is.

Alternatively, build from source (see [Development](#development)) so a `dist/`
folder is produced, or run `pnpm package` to create the zip yourself.

### 2. Load it into Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the unzipped release folder (or the
   `dist/` folder if you built from source).

### 3. Ollama prerequisite (default provider)

If you use the default Ollama provider, Ollama must be running locally with a
model pulled. The shipped default model is `qwen3.6:35b-a3b`. The Settings model
dropdown also offers `gemma3:27b` (highest quality), `qwen3:14b` (~9 GB, a good
balance for 16 GB machines), and `gemma4:latest` (smallest); pull whichever you
select. See [docs/ollama-install-guide.md](docs/ollama-install-guide.md) for
which model fits your RAM.

```bash
ollama pull qwen3.6:35b-a3b
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

For step-by-step install instructions on **macOS and Windows**, the
`OLLAMA_ORIGINS` setup for each, and a guide to **which model fits your RAM**,
see [docs/ollama-install-guide.md](docs/ollama-install-guide.md).

### 4. OpenAI setup (optional)

To use OpenAI instead, open the extension popup, expand **Settings**, set
**Provider** to `OpenAI`, accept the one-time consent dialog, and enter your
OpenAI API key. The supported models are `gpt-5.4-nano` and `gpt-5-nano`.
Remember that with OpenAI your selected text leaves your machine. A guide to
creating a key, **setting a spending limit, and adding a usage alert** is in
[docs/openai-setup-guide.md](docs/openai-setup-guide.md); full provider and
privacy details are in
[docs/provider-setup-and-privacy.md](docs/provider-setup-and-privacy.md).

## Usage

**From the context menu:** select text on a page, right-click, open the
`Correct/Translate/Reformulate` menu, and pick an action. For text inside an
editable field, the result overlay offers Replace and Append; otherwise the
result is copied to the clipboard.

**From the popup:** click the toolbar icon, paste or type text into the quick
action area, pick an action, and the result is shown inline and copied to the
clipboard.

**From the keyboard:** select text and press a shortcut. Some sites (notably
**Outlook on the web**) use an editor that suppresses the browser's native
right-click menu, so the context-menu items never appear there; keyboard
shortcuts are the way to reach the extension on those pages. Defaults:

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Correct grammar | `Ctrl+Shift+Y` | `Cmd+Shift+Y` |
| Translate to default language | `Ctrl+Shift+L` | `Cmd+Shift+L` |
| Reformulate (default tone) | unassigned | unassigned |

Translate and Reformulate use the default language / tone set in the popup.
Review or change any shortcut (including assigning one to Reformulate) at
`chrome://extensions/shortcuts`.

**From the selection toolbar (Outlook on the web):** on hosts whose editor
suppresses the native right-click menu, selecting text shows a small floating
toolbar next to the selection. Pick Correct, or open Translate / Reformulate /
Summarize to choose a language / tone / length. By default this is scoped to a
narrow allowlist of Outlook web hosts and does not appear on other sites (use
the context menu or keyboard shortcuts there). To show it **everywhere**, enable
**"Selection toolbar on all sites"** in the popup settings (off by default);
reload open tabs to apply.

For an illustrated walkthrough (with screenshots of the context menu, result
panel, and both provider settings), see the
[User Guide](docs/user-guide.md).

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

Run on 2026-08-18 (release 1.14.0):

| Check | Result |
|-------|--------|
| `pnpm typecheck` (tsc, src + e2e) | pass |
| `pnpm lint` (eslint) | pass |
| `pnpm test` -- unit (Vitest) | 369 / 369 passed (20 files) |
| `pnpm test:e2e` -- end-to-end (Playwright) | not re-run this release (requires `qwen3.6:35b-a3b` locally; last: 129 / 129) |

These figures are from a local run. The end-to-end suite is not part of CI
(see below) and requires a real local Ollama; re-run it locally before a
release. The 1.14.0 prompt changes (mixed-language dominant-language locking,
terminology keeping, German du/Sie mirroring) were verified against a real
local model (`qwen3.6:27b`) with repeated reformulate/translate runs, and new
e2e regression tests were added for them.

> **Note on e2e parallelism:** the real-Ollama tests (`reformulate`, `summarize`)
> issue live inference calls. The default 5-way worker parallelism starves a
> large local model such as `qwen3.6:35b-a3b`, causing per-test timeouts. Run
> the suite (or those files) with `--workers=1` when using a heavy model so a
> single inference completes within the per-test timeout.

### Continuous integration

The [`CI` workflow](.github/workflows/ci.yml) runs `pnpm typecheck`, `pnpm lint`,
`pnpm test` (unit) and `pnpm build` on every pull request to `main` and on every
push to `main`. The **CI** badge at the top of this README reflects it.

The end-to-end suite (`pnpm test:e2e`) is **not** run in CI: it drives a real
Chrome against a real local Ollama with the `qwen3.6:35b-a3b` model (~17 GB),
which does not fit a GitHub-hosted runner. It remains a local pre-release gate.

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

The overlay content script is injected **on demand** (only when you trigger an
action). The one exception is the in-page **selection toolbar**, a static
content script scoped to a narrow allowlist of Outlook web hosts
(`outlook.office.com`, `outlook.office365.com`, `outlook.live.com`,
`outlook.cloud.microsoft`). The optional "Selection toolbar on all sites"
setting registers the same toolbar for all sites at runtime (off by default);
it adds no new permission -- it rides on the `<all_urls>` host permission and
`scripting` that are already granted. Keyboard shortcuts use the `commands`
manifest key, which also grants no new permission.

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
    context-menu.ts      Context menu + keyboard command mapping
  content/         Content scripts and overlay
    content.ts           On-demand overlay content script (injected per action)
    overlay.ts           Shadow DOM result overlay
    overlay.css          Overlay styles
    selection-toolbar.ts Static toolbar for Outlook web (menu-suppressing hosts)
    selection-toolbar.css Toolbar styles
    text-replacement.ts  Replace / Append into editable fields
  popup/           React popup UI (settings + quick actions)
  shared/          Types, messages, prompts, storage, validators, constants
public/            manifest.json and static assets
scripts/           package.sh (build + zip)
tests/             unit/ (Vitest) and e2e/ (Playwright)
docs/              architecture.md and supporting documents
```

## Publishing

For Chrome Web Store submission steps (build, listing assets, permission
justifications, the data-practices form, and the privacy-policy URL), see
[docs/PUBLISHING.md](docs/PUBLISHING.md). The paste-ready listing copy is in
[docs/store-listing.md](docs/store-listing.md).

The privacy policy is published at
<https://lucianhanga.github.io/chrome.extension.ai.correct.translate.reformulate/privacy.html>
(source: [PRIVACY.md](PRIVACY.md) / [privacy.html](privacy.html)). End-user
manuals: [User Guide](docs/user-guide.md),
[Ollama install guide](docs/ollama-install-guide.md), and
[OpenAI setup guide](docs/openai-setup-guide.md).

## License

This project is open source under the [MIT License](LICENSE). You are free to
use, modify, and distribute it with attribution.
