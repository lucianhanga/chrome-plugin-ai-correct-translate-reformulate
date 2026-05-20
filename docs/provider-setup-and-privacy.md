# LLM Provider Setup and Privacy

## Purpose

Explain how to set up and use each of the two LLM providers supported by the
"Correct & Translate" extension -- local **Ollama** and online **OpenAI** -- and
the privacy difference between them. Use this document to decide which provider
to use, to get an OpenAI provider working, and to troubleshoot key validation.

## Source of Truth

This guide is grounded in the code shipped on the `feat/openai-provider` branch:

- `src/background/llm-client.ts` -- provider abstraction and `getActiveClient`
- `src/background/ollama-client.ts` -- Ollama client and health check
- `src/background/openai-client.ts` -- OpenAI client and health check
- `src/background/message-handler.ts` -- provider routing and `VALIDATE_OPENAI_KEY`
- `src/popup/components/SettingsSection.tsx` -- provider selector, key field, consent dialog
- `src/popup/Popup.tsx` -- the persistent `OpenAI` badge
- `src/shared/constants.ts` -- defaults, model lists, endpoints
- `public/manifest.json` -- permissions and CSP

For the full provider architecture see
[architecture.md, Section 14](architecture.md#14-multi-provider-architecture-llm-abstraction).

## Current Behavior

The extension can run corrections and translations through one of two providers,
chosen in the popup Settings section:

| Provider | Where it runs | Default | Credential | Text leaves the machine |
|----------|---------------|---------|------------|--------------------------|
| Ollama (local) | `http://localhost:11434` | Yes | None | No |
| OpenAI | `https://api.openai.com` | No | API key | Yes |

Only one provider is active at a time. Switching providers does not change how
correction or translation works -- the same input limit, prompts, and result UI
apply. The service worker is the only component that contacts either provider.

## Relevant Files

| File | Role |
|------|------|
| `src/background/ollama-client.ts` | Calls local Ollama; `GET /api/tags` for health |
| `src/background/openai-client.ts` | Calls OpenAI; `GET /v1/models` for health and key validation |
| `src/background/llm-client.ts` | `getActiveClient(settings)` routes to the right client |
| `src/popup/components/SettingsSection.tsx` | Provider selector, OpenAI key field, consent dialog |
| `src/shared/storage.ts` | Persists settings to `chrome.storage.local` |
| `public/manifest.json` | Declares the `localhost` and `api.openai.com` permissions |

## Using Local Ollama (Default)

Ollama is the default provider. With Ollama, all text stays on your machine.

1. Install Ollama and pull a supported model. The shipped default Ollama model
   is `qwen3:14b`; `qwen3.6:35b-a3b` is also selectable in Settings.

   ```bash
   ollama pull qwen3:14b
   ```

2. Make sure Ollama is running and serving on `http://localhost:11434`:

   ```bash
   ollama serve
   ```

3. Open the extension popup. In **Settings**, leave **Provider** set to
   `Ollama (local)`. The Ollama endpoint defaults to `http://localhost:11434`;
   change it only if your Ollama runs elsewhere.

4. The status indicator next to the popup title shows a green dot when Ollama is
   reachable and the selected model is available.

### Ollama and the `chrome-extension://` origin

The extension's service worker sends requests that Chrome stamps with a
`chrome-extension://` origin. By default Ollama rejects those with HTTP 403. If
the status indicator shows Ollama unreachable even though `ollama serve` is
running, allow the extension origin and restart Ollama:

```bash
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"
```

Then restart Ollama so the new process inherits the setting. On macOS,
`launchctl setenv` does not survive a reboot -- set it again after a restart, or
install a LaunchAgent for a permanent fix.

## Using OpenAI

With OpenAI, the text you correct or translate is sent over the internet to
OpenAI's servers. Set it up only if you accept that (see
[Privacy Implications](#privacy-implications)).

### Step 1 -- Obtain an API key from the OpenAI platform

1. Sign in at the OpenAI platform (`https://platform.openai.com`).
2. Open the API keys page and create a new secret key.
3. **Give the key permissions that allow listing models** (for example, the
   "All" permissions option). The extension validates a key by calling
   `GET /v1/models`; a key that cannot list models will fail validation even if
   it is otherwise valid. See [Troubleshooting](#troubleshooting).
4. Copy the key. OpenAI shows the secret value only once.

The key looks like `sk-...`. Keep it private.

### Step 2 -- Enter the key in the popup Settings

1. Open the extension popup and expand **Settings**.
2. Set **Provider** to `OpenAI`. The first time you do this, a consent dialog
   appears (see Step 3).
3. Choose an **OpenAI Model**. The supported models are `gpt-5.4-nano` and
   `gpt-5-nano` (default `gpt-5-nano`).
4. Paste the key into the **OpenAI API Key** field.
5. Optionally click **Validate**. The extension checks the key and model against
   `GET /v1/models` without saving anything. A green message confirms the key is
   valid and the model is accessible; a red message explains the failure.
6. Click **Save Settings**. The key is stored in `chrome.storage.local`.

The key never appears in plaintext in the popup again. After a save, the field
shows a masked placeholder and the note "A key is saved. Enter a new key to
replace it." To change the key, type a new one and save.

### Step 3 -- The one-time consent step

The first time you switch the provider to OpenAI, the extension shows a modal
**Data egress notice**. It states that your selected text will be sent over the
internet to OpenAI, links to OpenAI's API data usage policy, and reminds you
that Ollama keeps all text local.

- Choose **I understand, use OpenAI** to proceed. The consent is recorded
  (`openaiConsentAcknowledged`) and the dialog is not shown again.
- Choose **Cancel** to keep the provider on Ollama.

### The persistent OpenAI badge

While OpenAI is the active provider, a yellow `OpenAI` badge is shown next to
the popup title. It is an always-visible reminder that text leaves your machine.
Switch the provider back to `Ollama (local)` and save to remove it.

## Privacy Implications

The two providers differ fundamentally in where your text goes:

- **Ollama (local)** -- The selected text is sent only to `http://localhost:11434`
  on your own machine. Nothing leaves the device. No credential is used.
- **OpenAI** -- When OpenAI is the active provider, the selected text is sent
  over HTTPS to `https://api.openai.com`. The text leaves your machine and is
  processed on OpenAI's servers, subject to OpenAI's API data usage policy.

What the extension does to limit exposure:

- Switching to OpenAI is gated by the one-time consent dialog.
- A persistent badge shows whenever OpenAI is active.
- The OpenAI API key is stored only in `chrome.storage.local` (per machine,
  never synced), is redacted before it reaches the popup, and is never written
  to logs or error messages.
- The extension does not persist the text you correct or translate, and does not
  send it anywhere other than the provider you have selected.

If a correction or translation must stay private, use the Ollama provider.

## Troubleshooting

### Symptom: Key validation fails with "OpenAI returned HTTP 403"

- **Likely cause**: The API key was created with restricted permissions that do
  not include access to the model-list endpoint. The extension validates a key
  by calling `GET /v1/models`; if that call returns HTTP 403, validation fails
  with the message `OpenAI returned HTTP 403`, even though the key may be
  otherwise valid for chat completions.
- **Fix**: Create the OpenAI key with permissions that allow listing models --
  for example, the "All" permissions option on the OpenAI platform. Re-enter the
  new key in Settings and validate again.
- **Verification**: Click **Validate**; the message should turn green ("Key is
  valid and model is accessible.").

### Symptom: Validation fails with "Invalid API key."

- **Likely cause**: The key is wrong, expired, or revoked (OpenAI returned
  HTTP 401).
- **Fix**: Create a fresh key on the OpenAI platform and paste it in.

### Symptom: Validation says the key is valid but the model is not found

- **Likely cause**: The selected OpenAI model is not available to your account.
- **Fix**: Choose the other supported model in the **OpenAI Model** dropdown and
  validate again.

### Symptom: A correction or translation fails with a quota or billing error

- **Likely cause**: The OpenAI account is out of quota or has a billing problem
  (HTTP 403, or HTTP 429 with `insufficient_quota`).
- **Fix**: Check the OpenAI account billing, or switch the provider back to
  `Ollama (local)` in Settings.

### Symptom: A request fails with "Cannot reach OpenAI"

- **Likely cause**: No internet connection, or the request timed out.
- **Fix**: Check the connection and retry, or switch to `Ollama (local)`.

### Symptom: Ollama shows as unreachable

- See [Ollama and the chrome-extension origin](#ollama-and-the-chrome-extension-origin)
  above.

## Constraints

- Only one provider is active at a time.
- The OpenAI endpoint is fixed at `https://api.openai.com` and is not
  user-configurable; only the Ollama endpoint can be changed.
- Supported OpenAI models are `gpt-5.4-nano` and `gpt-5-nano` only.
- The OpenAI API key field never displays a previously saved key; it shows a
  masked placeholder. Re-enter the key to change it.
- The 10,000-character input limit and the 60-second request timeout apply to
  both providers.

## Common Mistakes

- Creating an OpenAI key without model-list permission, then being surprised by
  "OpenAI returned HTTP 403" at validation. Use a key that can list models.
- Expecting text to stay local while OpenAI is the active provider. It does not.
  The badge and consent dialog exist to make this clear.
- Forgetting that, on macOS, `OLLAMA_ORIGINS` set with `launchctl setenv` is
  cleared by a reboot.

## Related Decisions

From `docs/openai-provider-design.md`:

- D1 -- The OpenAI key is stored in `chrome.storage.local` (per machine, never
  `.sync`).
- D2 -- Egress consent is a one-time confirmation on switching to OpenAI, plus a
  persistent `OpenAI` indicator in the popup.
- D3 -- Ollama remains the default provider; local-only behavior is unchanged.
- D4 -- The API key is entered in the popup Settings section; there is no
  separate options page.

## Last Updated Notes

- 2026-05-20 -- Created for the `feat/openai-provider` branch. Documents the
  Ollama and OpenAI providers, the consent step, the privacy difference, and the
  tested HTTP 403 key-permission troubleshooting note.
