# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each tagged release also publishes a packaged `correct-and-translate-<version>.zip`
to [GitHub Releases](https://github.com/lucianhanga/chrome.extension.ai.correct.translate.reformulate/releases).

## [1.13.0] - 2026-07-06

### Added

- **Keyboard shortcuts** as a context-menu-free way to trigger actions. Some
  sites (notably **Outlook on the web**) use an editor that cancels the
  browser's native right-click menu, so the extension's context-menu items can
  never appear there. Shortcuts reach the extension regardless. Defaults:
  `Ctrl/Cmd+Shift+Y` (Correct grammar) and `Ctrl/Cmd+Shift+L` (Translate to the
  default language); a third command (Reformulate with the default tone) ships
  unassigned. All are remappable at `chrome://extensions/shortcuts`.
  - Because keyboard commands carry no selection, the service worker scans every
    frame of the active tab for the live selection, so shortcuts work inside the
    cross-origin compose iframes used by webmail (Outlook, GMX, ...).
  - Purely additive: the right-click context menu and its behaviour on all other
    sites are unchanged. The `commands` manifest key grants no new API
    permission, so the extension's permission surface is unchanged.
- **In-page selection toolbar** on hosts whose editor suppresses the native
  context menu. On **Outlook on the web**, selecting text now shows a small
  floating bar (Correct / Translate / Reformulate / Summarize) anchored to the
  selection; choosing an action runs the same pipeline and result overlay as the
  other triggers. The toolbar is rendered in a closed Shadow DOM so the host
  page's styles cannot affect it.
  - Scoped by a **narrow allowlist** (`outlook.office.com`, `outlook.office365.com`,
    `outlook.live.com`, `outlook.cloud.microsoft`) via the extension's first and
    only static content script. Everywhere else, injection remains programmatic
    and user-initiated; the security regression guard was updated to pin this
    exact scope.
  - **Optional "Selection toolbar on all sites"** setting (off by default). When
    enabled, the toolbar is registered dynamically for all sites via
    `chrome.scripting.registerContentScripts`, and unregistered when disabled.
    This needs no new permission (the `<all_urls>` host permission and
    `scripting` are already granted) and leaves the static allowlist unchanged.

### Fixed

- **Replace in controlled editors (e.g. Microsoft Teams on the web).** Teams'
  compose box is a controlled editor that reverted programmatic edits, so
  Replace appeared to do nothing. Replace now focuses the true editor root
  (not an inner inheriting node), defers the insertion so the editor can sync
  its selection model, and verifies the edit survived. If the editor still
  reverts it, the original text is re-selected and a "Copied — press
  Ctrl/Cmd+V to replace" hint is shown (the result is already on the clipboard,
  and a trusted paste is honoured everywhere).
- **Selection toolbar now appears for keyboard selection.** Selecting text with
  the keyboard (Shift+arrows, Shift+Home/End, ...) did not show the toolbar. It
  now triggers on the browser's `selectionchange` event, covering keyboard and
  mouse uniformly, with guards so it does not flicker mid-drag or re-appear
  immediately after an action is chosen.
- **Selection toolbar placement.** The toolbar now prefers to sit *below* the
  selection so it no longer overlaps the editor's own formatting mini-toolbar
  (which appears above the selection in Outlook/Word).

## [1.11.1] - 2026-06-18

### Fixed

- **Overlay scroll-jump on long pages.** Selecting text near the top of a long,
  scrollable page (for example a GMX email compose window) and triggering an
  action scrolled the page to the bottom and the overlay never appeared. The
  overlay host is now fixed-positioned the moment it is created, so it is never
  part of normal document flow, and all internal focus moves use
  `preventScroll`.
- **Overlay clipped near the viewport edge.** A tall result overlay anchored
  near the bottom of a short viewport was cut off, hiding its lower text and the
  Replace/Close buttons. Positioning now measures the overlay's real height and
  clamps it to stay fully within the viewport (prefer below the selection, then
  above, then a clamped fallback).

### Tests

- Added Playwright e2e regression tests for both overlay-positioning fixes; each
  is confirmed to fail when its fix is reverted.

## [1.11.0] - 2026-06-16

### Added

- `qwen3:14b` option in the Ollama model dropdown.
- Optional promotional tiles and finalized Chrome Web Store listing assets.

### Changed

- Prepared the repository for Chrome Web Store publishing (README, privacy
  policy, store-listing assets, 24-bit screenshots).

[1.13.0]: https://github.com/lucianhanga/chrome.extension.ai.correct.translate.reformulate/releases/tag/v1.13.0
[1.11.1]: https://github.com/lucianhanga/chrome.extension.ai.correct.translate.reformulate/releases/tag/v1.11.1
[1.11.0]: https://github.com/lucianhanga/chrome.extension.ai.correct.translate.reformulate/releases/tag/v1.11.0
