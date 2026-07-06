# Publishing Correct & Translate to the Chrome Web Store

This is the repeatable checklist for the initial submission and for every
subsequent update. The paste-ready listing text lives in
[store-listing.md](store-listing.md).

## One-time setup

- [ ] Create a Chrome Web Store developer account and pay the one-time $5 fee at
      <https://chrome.google.com/webstore/devconsole>.
- [ ] Host the privacy policy at a public URL (see
      [Privacy policy URL](#privacy-policy-url)).
- [ ] Prepare store-listing images (see [Listing assets](#store-listing-assets)).

## Build the upload package

```bash
pnpm package
```

This builds `dist/` and produces `correct-and-translate-<version>.zip` at the
repository root, with `manifest.json` at the archive root, ready to upload. The
script fails loudly if `package.json` and `public/manifest.json` versions
disagree.

> Re-run the end-to-end suite locally before a release (`pnpm test:e2e`,
> requires a local Ollama). CI covers typecheck, lint, unit tests, and build but
> not e2e.

## Store listing assets

Prepare these in the Developer Dashboard before submitting:

- **Store icon**: 128x128 PNG. The manifest icon
  (`public/icons/icon-128.png`) is reused; a copy is in `store-assets/`.
- **Screenshots**: at least one, **1280x800** or **640x400** (PNG or JPEG).
  Suggested captures (see `store-assets/README.md`):
  1. The right-click context menu with the Correct/Translate/Reformulate submenu.
  2. A result overlay on a page showing Replace/Append for an editable field.
  3. The popup quick-action panel with a result and its metadata line.
  4. The Settings section showing the provider selector (Ollama vs OpenAI).
- **Short description** (<=132 chars): reuse from [store-listing.md](store-listing.md).
- **Detailed description**: paste from [store-listing.md](store-listing.md). It
  includes the open-source statement, the Ollama/OpenAI summaries, and links to
  the full setup guides.
- **Category**: Productivity.
- **Language**: English.
- **Promotional tiles** (optional — only used for store featuring): a small
  440x280 and a marquee 1400x560 tile, both 24-bit PNG with no alpha. Ready-made
  versions are in `store-assets/` (`promo-small-440x280.png`,
  `promo-marquee-1400x560.png`); leaving the slots empty is fine.

## Permission justifications (Privacy practices tab)

Chrome asks you to justify each permission. Use these:

| Permission | Justification |
|------------|---------------|
| `storage` | Saves the user's settings (provider, model, default language/tone/length, and the OpenAI API key if entered) locally in `chrome.storage.local`. |
| `contextMenus` | Adds the right-click "Correct / Translate / Reformulate" menu used to trigger actions on selected text. |
| `activeTab` | Reads the user's current selection and acts on the tab the user is actively using when they trigger an action. |
| `scripting` | Injects the content script / result overlay on demand into the active tab to show results and offer in-place Replace/Append. |
| `clipboardWrite` | Automatically copies each result to the clipboard. |
| `commands` (keyboard shortcuts) | Optional, remappable keyboard shortcuts to run Correct / Translate / Reformulate on the current selection. Needed for sites (e.g. Outlook on the web) whose editor suppresses the native right-click menu. Grants no data access. |
| Static content script (selection toolbar) | A small in-page toolbar shown near a text selection, scoped by default to a narrow allowlist of Outlook web hosts (`outlook.office.com`, `outlook.office365.com`, `outlook.live.com`, `outlook.cloud.microsoft`) whose editor suppresses the right-click menu. An optional, off-by-default "all sites" setting extends it at runtime via the already-granted `scripting` + `<all_urls>`. |
| Host permission `<all_urls>` | The content script must reach the editable area on any page, including cross-origin iframes (e.g. webmail compose editors such as GMX) that `activeTab` alone cannot reach. Network egress is still restricted by CSP to local Ollama and OpenAI only. |
| Remote code | **Not used.** All code is bundled in the package; the extension loads no remote scripts. |

## Data practices form

Be accurate — the extension supports two providers with different data flows:

- **Does the extension collect or use data?** Yes — it handles the **text the
  user selects** in order to process it, and stores **user settings** (including
  an optional OpenAI API key) locally.
- **Data types**: "Website content" (the selected text the user submits) and
  "Authentication information" (the optional OpenAI API key, stored locally).
- **Sold/shared with third parties?** No (the developer does not collect or sell
  data). However, **disclose that when the user opts in to OpenAI, the selected
  text is transmitted to OpenAI** (a third-party AI provider the user chooses)
  for processing. With the default Ollama provider, no data leaves the device.
- **Used only for the single purpose** (correcting/translating the user's text)? Yes.
- **Certify** that data use complies with the Developer Program Policies.

Mention in the listing and privacy policy that OpenAI is opt-in, gated by a
one-time consent dialog, and surfaced by a persistent badge.

### Privacy policy URL

The policy is published via **GitHub Pages** at:

```
https://lucianhanga.github.io/chrome.extension.ai.correct.translate.reformulate/privacy.html
```

(Source: [`privacy.html`](../privacy.html) / [`PRIVACY.md`](../PRIVACY.md). Pages
is served from `main` / root; the `PRIVACY.md` blob URL also works as a
fallback.)

## Submit

1. Dashboard -> **Add new item** -> upload the ZIP.
2. Fill in listing assets, permission justifications, and the data-practices
   form above.
3. Set visibility (Public / Unlisted) and submit for review.
4. Review typically takes a few hours to a few business days.

## Publishing an update

1. Make changes on a feature branch and merge per the project's GitHub flow.
2. Bump the version in **both** `package.json` and `public/manifest.json` (the
   package script enforces they match).
3. `pnpm package`
4. Dashboard -> the existing item -> **Package** -> upload the new ZIP -> submit.

> Chrome Web Store versions must strictly increase and cannot be reused. Tagging
> `v<version>` on GitHub also publishes a Release zip via the Release workflow.
