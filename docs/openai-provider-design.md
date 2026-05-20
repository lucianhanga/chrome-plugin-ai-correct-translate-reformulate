# OpenAI Provider Design

Status: Draft for review. This is a gated planning document. No production code,
manifest, or source files are modified by this design. Implementation is a
separate phase that begins only after this document is approved.

## 1. Goal and Scope

Add online OpenAI LLMs as a selectable alternative LLM provider for the
"Correct & Translate" extension, alongside the existing local Ollama backend.
Ollama remains the default and its existing behavior is unchanged.

### In scope

- A common `LLMClient` abstraction satisfied by both an Ollama implementation
  and a new OpenAI implementation.
- An OpenAI client that calls `https://api.openai.com/v1/chat/completions`.
- Two OpenAI models: `gpt-5.4-nano` and `gpt-5-nano`.
- API key entered in the popup Settings section, stored in `chrome.storage.local`.
- Key validation against OpenAI `/v1/models` on save.
- Provider selection in settings, with a one-time data-egress consent dialog
  and a persistent "OpenAI" indicator in the popup.
- Schema migration so existing users keep working with no action required.

### Out of scope

- Streaming responses (the extension is non-streaming today; unchanged).
- Other providers (Anthropic, Azure OpenAI, etc.).
- An options page (decision D4: key is entered in the popup).
- Storing or transmitting user text anywhere other than the chosen provider.
- A backend proxy for the OpenAI key (see Section 7, Decision Q1).

### User decisions designed around (not re-litigated)

| ID | Decision |
|----|----------|
| D1 | OpenAI API key stored in `chrome.storage.local` (per-machine, never `.sync`). |
| D2 | Egress consent = one-time confirm on switching to OpenAI + persistent "OpenAI" indicator in popup. |
| D3 | Ollama remains the default provider; existing local-only behavior unchanged. |
| D4 | API key entered in the popup Settings section (no options page). |
| D5 | On save, validate the key against OpenAI `/v1/models` and show the result. |

## 2. Current Architecture (baseline)

The flow today:

```
Popup / Context Menu
        |
        v
message-handler.ts  ── getSettings() ──> chrome.storage.local
        |
        v
tasks.ts  (correctGrammar / translateText)
        |
        v
ollama-client.ts  callOllama()  ──POST──> http://localhost:11434/v1/chat/completions
```

Key observations grounding the design:

- `ollama-client.ts` already POSTs an OpenAI-compatible chat request shape
  (`messages`, `stream: false`, `choices[0].message.content`). The OpenAI
  client can reuse the same request-builder skeleton and response parser.
- The Ollama request nests sampling parameters in an `options` block. The real
  OpenAI API expects those parameters at the top level (and does not accept
  `top_k`, `num_ctx`, or `think`). This is the main request-shape divergence.
- `message-handler.ts` is the single dispatch point that reads settings and
  passes `{ model, endpoint }` into the task functions. This is the natural
  seam to introduce provider selection.
- `storage.ts` already merges stored settings over `DEFAULT_SETTINGS`, so
  additive schema changes migrate for free (Section 5).
- The service worker is the only context that performs network calls. Content
  scripts and the popup never call an LLM directly. This invariant is preserved
  and is load-bearing for the threat model.

## 3. The `LLMClient` Interface Contract

A common abstraction lets `message-handler.ts` / `tasks.ts` call an LLM without
knowing the provider. Both implementations live in `src/background/`.

### 3.1 Interface

New file `src/background/llm-client.ts` (interface + factory only):

```ts
// Provider-agnostic options passed to a client call.
export interface LLMCallOptions {
  model: string;
  timeoutMs?: number;
  temperature?: number;
}

// Provider-agnostic health result. `detail` is a short, non-sensitive label.
export interface LLMHealthResult {
  reachable: boolean;     // endpoint responded
  modelFound: boolean;    // requested model is available to this credential
  error: string | null;  // sanitized message, never raw provider body, never the key
}

export interface LLMClient {
  // Sends a single non-streaming chat completion. Returns trimmed text.
  // Throws Error with a sanitized message on failure (see Section 7).
  call(
    systemPrompt: string,
    userText: string,
    options: LLMCallOptions,
  ): Promise<string>;

  // Verifies the provider is reachable and the model/credential is usable.
  healthCheck(model: string): Promise<LLMHealthResult>;
}
```

Notes:

- `LLMCallOptions` deliberately omits `endpoint` and `apiKey`. Those are
  provider-specific construction inputs, not per-call inputs. They are passed to
  the concrete client's factory/constructor, not to `call()`. This keeps the
  interface narrow and prevents accidental key leakage through call sites.
- `LLMHealthResult` is a generalized rename of the existing `OllamaHealthResult`
  (same three fields, identical shape) so the popup health-check UI is reused
  without change.

### 3.2 Factory

```ts
// Resolves the active client from settings. Service-worker only.
export function getActiveClient(settings: ExtensionSettings): LLMClient {
  if (settings.provider === 'openai') {
    return createOpenAIClient({
      apiKey: settings.openaiApiKey,
      model: settings.openaiModel,
    });
  }
  return createOllamaClient({
    endpoint: settings.ollamaEndpoint,
  });
}
```

The factory is the only place that reads `settings.provider`. Task functions
and the message handler stay provider-agnostic.

### 3.3 Refactoring `ollama-client.ts` (behavior-preserving)

The existing exported functions `callOllama()` and `checkOllamaHealth()` are
kept and not removed, so existing imports and unit tests continue to pass. The
adapter wraps them:

```ts
// src/background/ollama-client.ts  (additions, existing functions untouched)
export function createOllamaClient(cfg: { endpoint: string }): LLMClient {
  return {
    call: (system, user, opts) =>
      callOllama(system, user, {
        endpoint: cfg.endpoint,
        model: opts.model,
        timeoutMs: opts.timeoutMs,
        temperature: opts.temperature,
      }),
    healthCheck: (model) => checkOllamaHealth(cfg.endpoint, model),
  };
}
```

Behavior preservation guarantees:

- `callOllama` / `checkOllamaHealth` signatures, request body, timeout logic,
  and error messages are unchanged.
- The Ollama request still nests params in `options` with `top_k`, `num_ctx`,
  `think`. `OLLAMA_PARAMS` is unchanged.
- Existing unit tests for `ollama-client.ts` need no edits.
- The adapter is a thin, pure wrapper with no new behavior.

### 3.4 New OpenAI client

New file `src/background/openai-client.ts`:

```ts
export function createOpenAIClient(cfg: {
  apiKey: string;
  model: string;
}): LLMClient { /* ... */ }
```

Internals are detailed in Section 4. Like `ollama-client.ts`, it exposes a
lower-level `callOpenAI()` and `checkOpenAIHealth()` plus the `createOpenAIClient`
factory adapter, mirroring the Ollama file's structure for symmetry and
testability.

### 3.5 `tasks.ts` and `message-handler.ts` changes

`tasks.ts`: `correctGrammar` / `translateText` accept an `LLMClient` instead of
`OllamaCallOptions`:

```ts
export async function correctGrammar(
  client: LLMClient, text: string, opts: LLMCallOptions,
): Promise<string> {
  return client.call(GRAMMAR_CORRECT_SYSTEM, text, { temperature: 0.2, ...opts });
}
```

`message-handler.ts`: after `getSettings()`, resolve the client via
`getActiveClient(settings)` and pass it down. The handler stays free of
provider conditionals beyond that single factory call. The `HEALTH_CHECK`
branch calls `client.healthCheck(activeModel)` where `activeModel` is
`settings.openaiModel` or `settings.model` depending on provider.

## 4. OpenAI Request Details

### 4.1 Endpoint and headers

- Endpoint: `https://api.openai.com/v1/chat/completions`
- Method: `POST`
- Headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer <openaiApiKey>`

The `Authorization` header value is constructed at the moment of the `fetch`
call and is never logged, never placed in an error message, and never returned
in any response (Section 6).

### 4.2 Request body — divergence from Ollama

| Aspect | Ollama (current) | OpenAI (new) |
|--------|------------------|--------------|
| `model` | top-level | top-level |
| `messages` | top-level array | top-level array (identical shape) |
| `stream` | `false` | `false` |
| `temperature` | inside `options` | top-level |
| `top_p` | inside `options` | top-level (optional; see below) |
| `top_k` | inside `options` | not supported — omitted |
| `num_ctx` | inside `options` | not supported — omitted (server-managed) |
| `think` | inside `options` | not supported — omitted |
| Auth | none | `Authorization` header |

OpenAI request builder:

```ts
function buildOpenAIRequest(
  systemPrompt: string, userText: string, model: string, temperature: number,
): object {
  return {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    stream: false,
    temperature,
    top_p: OPENAI_PARAMS.top_p,
  };
}
```

New `OPENAI_PARAMS` constant in `constants.ts` (kept separate from
`OLLAMA_PARAMS` so the two providers tune independently):

```ts
export const OPENAI_PARAMS = {
  temperature: 0.2,
  top_p: 0.8,
} as const;
```

Implementation note for the build phase: the `gpt-5*-nano` family may, like
other recent OpenAI reasoning-tuned models, reject a custom `temperature` or
require `max_completion_tokens` rather than `max_tokens`. The implementation
must verify accepted parameters against current OpenAI API docs and degrade
gracefully (omit unsupported params) rather than hard-fail. This is flagged as
Decision Q3 in Section 7.

### 4.3 Response parsing

The success response shape matches what `ollama-client.ts` already parses:

```jsonc
{ "choices": [ { "message": { "content": "..." } } ] }
```

The OpenAI client reuses the same defensive extraction:

```ts
const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })
  ?.choices?.[0]?.message?.content;
if (typeof content !== 'string') {
  throw new Error('Unexpected response shape from OpenAI');
}
return content.trim();
```

The error message intentionally does NOT include `JSON.stringify(data)` (unlike
the Ollama path), because an OpenAI response body could contain account- or
request-correlated identifiers. See Section 6.

### 4.4 Health check — `/v1/models`

`checkOpenAIHealth(apiKey, model)`:

- `GET https://api.openai.com/v1/models` with the `Authorization` header.
- Timeout: reuse `HEALTH_CHECK_TIMEOUT_MS` (5 s).
- Result mapping:
  - HTTP 200 -> `reachable: true`. Parse `data.data[]` (array of `{ id }`);
    `modelFound = data.some(m => m.id === model)`.
  - HTTP 401 -> `reachable: true, modelFound: false, error: "Invalid API key."`
  - HTTP 429 -> `reachable: true, modelFound: false, error: "Rate limit reached. Try again shortly."`
  - Other non-OK -> `reachable: false` with a sanitized status-only message
    (e.g. `"OpenAI returned HTTP 503"`), never the raw body.
  - Network error / timeout -> `reachable: false, error: "Cannot reach OpenAI."`

This mirrors `checkOllamaHealth` exactly in shape, so the existing
`StatusIndicator` / health-check UI path is reused. The popup distinguishes
"key invalid" from "model unavailable" using the `error` field plus
`modelFound`.

## 5. `ExtensionSettings` Schema Extension

### 5.1 New fields

```ts
export type LLMProvider = 'ollama' | 'openai';

export type OpenAIModel = 'gpt-5.4-nano' | 'gpt-5-nano';

export interface ExtensionSettings {
  // --- existing (unchanged) ---
  ollamaEndpoint: string;
  model: string;                       // Ollama model
  defaultTargetLanguage: SupportedLanguage;
  sourceLanguageOverride: SupportedLanguage | null;

  // --- new ---
  provider: LLMProvider;               // discriminator; default 'ollama'
  openaiModel: OpenAIModel;            // default 'gpt-5-nano'
  openaiApiKey: string;                // default '' (empty = not configured)
  openaiConsentAcknowledged: boolean;  // D2 one-time consent flag; default false
}
```

Design choices:

- `provider` is a plain discriminator, not a discriminated union of two settings
  objects. Keeping all fields flat means both providers' settings persist
  simultaneously: a user can switch to OpenAI and back without losing their
  Ollama endpoint, and vice versa. This matches D3 (Ollama stays fully intact).
- The Ollama `model` field keeps its name to avoid touching existing code and
  tests. Only the new field is named `openaiModel`.
- `openaiApiKey` default is `''`. An empty key means "OpenAI not configured";
  the UI blocks selecting the OpenAI provider until a key is saved and validated.
- `openaiConsentAcknowledged` records the D2 one-time consent so the dialog is
  shown only once per machine.

New constants in `constants.ts`:

```ts
export const OPENAI_API_BASE = 'https://api.openai.com';
export const DEFAULT_OPENAI_MODEL: OpenAIModel = 'gpt-5-nano';
export const AVAILABLE_OPENAI_MODELS: readonly OpenAIModel[] =
  ['gpt-5.4-nano', 'gpt-5-nano'] as const;
```

### 5.2 Migration / defaulting strategy

The current `getSettings()` does `{ ...DEFAULT_SETTINGS, ...stored }`. Because
all four new fields are additive (no renames, no type changes to existing
fields), extending `DEFAULT_SETTINGS` is a complete and safe migration:

```ts
export const DEFAULT_SETTINGS: ExtensionSettings = {
  ollamaEndpoint: DEFAULT_OLLAMA_ENDPOINT,
  model: DEFAULT_MODEL,
  defaultTargetLanguage: 'English',
  sourceLanguageOverride: null,
  provider: 'ollama',                  // D3: Ollama is the default
  openaiModel: DEFAULT_OPENAI_MODEL,
  openaiApiKey: '',
  openaiConsentAcknowledged: false,
};
```

Migration behavior for the three user states:

| Existing stored state | After upgrade |
|-----------------------|---------------|
| No `settings` key at all (fresh install) | Full `DEFAULT_SETTINGS`: provider `ollama`. |
| `settings` present, pre-OpenAI shape | The four missing keys are filled from defaults by the spread. `provider` becomes `ollama`. User is unaffected and never sees the consent dialog. |
| `settings` present, already has new fields | Stored values win, as today. |

No imperative migration code, no version counter, and no `chrome.runtime.onInstalled`
migration hook are required. The merge-over-defaults pattern already in
`storage.ts` handles it. This is the safest possible migration: purely additive.

Hardening to add during implementation (defense-in-depth, since the spread does
not validate value *types*): `getSettings()` should coerce/validate the new
fields after merging — `provider` must be one of the two literals (else fall
back to `'ollama'`), `openaiModel` must be in `AVAILABLE_OPENAI_MODELS` (else
fall back to default), `openaiApiKey` must be a string. This guards against a
corrupted or hand-edited `chrome.storage.local`.

### 5.3 Message contract changes

- `SaveSettingsRequest` already carries `Partial<ExtensionSettings>`, so it
  transparently accepts the new fields. The `isSaveSettingsRequest` guard still
  works (it only checks `payload.settings` is an object). For robustness, the
  guard should additionally reject obviously malformed `provider` /
  `openaiApiKey` values before they reach storage.
- `SettingsResponse` returns the full `ExtensionSettings`. To avoid the key
  living in popup memory unnecessarily, `GET_SETTINGS` returns the key
  **redacted** — see Section 6.4.
- New message type for key validation: `VALIDATE_OPENAI_KEY` (Section 6.4),
  added to `VALID_TYPES` and given a type guard.

## 6. Threat Model

### 6.1 Trust boundaries and data flow

```
+------------------+        +-----------------------+        +------------------+
|  Popup (React)   |        | Service Worker (bg)   |        |  OpenAI API      |
|  - settings form | <----> |  - message-handler    | <----> |  api.openai.com  |
|  - "OpenAI" badge |  msg   |  - getActiveClient    |  https |                  |
+------------------+        |  - openai-client      |        +------------------+
        ^                   |  - reads storage.local|
        | DOM                +-----------------------+
        |                              ^
+------------------+                   | chrome.storage.local
| Content script   |                   | (settings incl. openaiApiKey)
| (host page DOM)  |  -- untrusted -->  |
+------------------+   selected text    |
```

Trust boundaries:

- **B1 Host page DOM -> content script**: selected text is untrusted input.
  Already validated by `validateTextInput` (length, non-empty). Unchanged.
- **B2 Popup/content -> service worker**: messages are untrusted; validated by
  the `messages.ts` type guards. The new `VALIDATE_OPENAI_KEY` message gets a
  guard too.
- **B3 Service worker -> OpenAI**: NEW boundary. User text leaves the machine.
  This is the central new risk.
- **B4 OpenAI -> service worker**: response and error bodies are untrusted and
  may contain identifiers; never surfaced verbatim to the user.

### 6.2 Threat: data egress (user text leaves the machine)

| | |
|--|--|
| Risk | When provider is OpenAI, every correction/translation sends the user's selected text — potentially private or sensitive — to a third party (OpenAI). With Ollama this never happened: all text stayed on `localhost`. |
| Likelihood | Certain by design when OpenAI is selected. |
| Impact | Confidentiality. The user may not realize the change in data handling. |
| Mitigations | (1) D3: Ollama stays the default; egress only happens after a deliberate provider switch. (2) D2 one-time consent dialog (6.6) explicitly states text will be sent to OpenAI, shown before the switch takes effect. (3) D2 persistent "OpenAI" indicator in the popup whenever OpenAI is active, so the user always knows where text goes. (4) `MAX_INPUT_LENGTH` (10k chars) caps the volume per request. (5) No text is ever stored by the extension (the existing no-persistence property of `tasks.ts` is preserved — text is held only in transit). |
| Residual risk | OpenAI's own data-retention/training policies are outside the extension's control. The consent dialog names this explicitly and links to OpenAI's API data-usage policy so the user can make an informed choice. |

### 6.3 Threat: API key exposure

| | |
|--|--|
| Risk | The OpenAI API key is a bearer credential. If leaked it allows billed API use by an attacker. |
| Attack surfaces | (a) Storage at rest; (b) display in the settings UI; (c) logs / console; (d) error messages; (e) `GET_SETTINGS` responses held in popup memory; (f) the network request itself. |
| Mitigations | See 6.3.1–6.3.6. |

**6.3.1 Storage (D1).** The key lives in `chrome.storage.local` only — never
`chrome.storage.sync` (which would replicate it to Google's servers and other
devices). `chrome.storage.local` is sandboxed per-extension and per-profile.
The extension never copies the key elsewhere. `clearStorage()` already wipes it
on reset.

**6.3.2 UI masking (D4).** The settings input for the key uses
`type="password"`. On reopening the popup, if a key is already stored the field
shows a fixed-length masked placeholder (e.g. `••••••••`) and the actual key is
NOT loaded into the field's value. An optional "Show" toggle may reveal the
entered value only while the user is actively typing a new key. Saving an
unchanged masked field is a no-op (does not overwrite the stored key with dots).

**6.3.3 Strict no-logging rule.** The API key, the `Authorization` header, and
its `Bearer ...` value must NEVER appear in `console.log` / `console.error`,
thrown `Error` messages, `Error.cause`, or any response payload. The existing
`console.error('[message-handler] Unhandled error:', error)` is reviewed: an
`Error` from the OpenAI client must be constructed so its `message` and `cause`
contain no key material (the client builds the header locally and never puts it
on the error). A lint rule / code-review checklist item enforces this.

**6.3.4 Error messages.** `classifyError` and the OpenAI client map failures to
fixed, user-facing strings (Section 7). Raw OpenAI response bodies are never
concatenated into user-facing errors.

**6.3.5 `GET_SETTINGS` redaction.** `GET_SETTINGS` returns
`openaiApiKey` as a redacted sentinel (e.g. `'__SET__'` when a key exists, `''`
when not) instead of the real value. The popup only needs to know *whether* a
key is set, not the key itself. The real key never leaves the service worker
except in the outbound OpenAI request. This shrinks the key's footprint to:
storage + service-worker memory during a call.

**6.3.6 Network request.** The key is only ever sent to `https://api.openai.com`
(enforced by `host_permissions` + CSP `connect-src`, Section 4 / the manifest
diff below). It is sent over TLS. A malicious or compromised content script
cannot reach the service worker's in-memory key (process isolation) and cannot
issue a cross-origin request to OpenAI from a host page (host-page CSP / CORS;
and the extension's `host_permissions` grant does not extend to web pages).

### 6.4 New message: `VALIDATE_OPENAI_KEY`

To validate a freshly typed key without first persisting it (D5), a dedicated
message carries the candidate key to the service worker, which calls
`/v1/models` and returns only a boolean + sanitized status. Flow:

```
Popup ──VALIDATE_OPENAI_KEY{ key, model }──> Service Worker
                                                  |
                                       checkOpenAIHealth(key, model)
                                                  |
Popup <──{ valid, modelFound, error }──────────────
```

The candidate key is in popup memory only transiently while the user types and
clicks "Validate"/"Save". On successful save it is written to storage and the
popup clears its local copy. The validation message is added to `VALID_TYPES`
with a strict type guard (`key` is string, `model` in `AVAILABLE_OPENAI_MODELS`).

### 6.5 Threat: widened CSP / network surface

| | |
|--|--|
| Risk | Adding `https://api.openai.com` to `host_permissions` and `connect-src` widens what the extension can talk to. A supply-chain compromise (malicious dependency in the build) could exfiltrate data to OpenAI's domain, or the broadened surface could mask other egress. |
| Mitigations | (1) The widening is exactly one origin — `https://api.openai.com` — not a wildcard. No `https://*` and no `<all_urls>`. (2) `connect-src` still lists only `'self'`, `http://localhost:11434`, and `https://api.openai.com`; `script-src 'self'` and `object-src 'none'` are unchanged, so no remote code can be loaded or eval'd. (3) No new npm dependency is introduced (Section 8), keeping the supply-chain surface flat. (4) The service worker remains the only network caller. |
| Residual risk | `api.openai.com` is now a permitted exfiltration target if other code is compromised. Accepted as the minimum necessary for the feature; reduced by the no-new-dependency constraint and CI dependency review. |

### 6.6 D2 consent UX in the data flow

The one-time consent is a gate placed *before* the provider switch is persisted:

```
User picks "OpenAI" in the provider selector
        |
        v
openaiConsentAcknowledged == true ? ──yes──> proceed to save provider = 'openai'
        |
        no
        v
Show modal dialog (in popup):
  - States plainly: "Your selected text will be sent over the internet
    to OpenAI for processing."
  - Links to OpenAI's API data-usage policy.
  - Buttons: [Cancel]  [I understand, use OpenAI]
        |
   Cancel ──> provider stays 'ollama'; selector reverts
   Confirm ──> set openaiConsentAcknowledged = true; save provider = 'openai'
```

After confirmation, whenever `provider === 'openai'` the popup shows a small
persistent "OpenAI" badge (e.g. near the status indicator), using a neutral or
warning-toned color from `COLORS` so the user always knows text is leaving the
machine. Switching back to Ollama hides the badge. The consent flag is not
reset on switching back, so a user toggling providers is not nagged repeatedly;
it is cleared by `clearStorage()` / `resetSettings()`.

### 6.7 Threat: error-message leakage — summary

Covered in 6.3.4 and Section 7. Principle: every failure crossing B4 is mapped
to a fixed `ErrorCode` with a static user-facing message. Raw OpenAI bodies,
HTTP detail beyond a status number, request IDs, and the key are never shown.

## 7. Error Handling

### 7.1 New `ErrorCode`s

Add to the `ErrorCode` union in `types.ts`:

```ts
| 'OPENAI_AUTH_FAILED'    // 401: invalid / revoked / missing key
| 'OPENAI_RATE_LIMITED'   // 429: rate limit
| 'OPENAI_QUOTA_EXCEEDED' // 429 with insufficient_quota, or 403 billing
| 'OPENAI_UNREACHABLE'    // network failure / DNS / TLS / timeout to api.openai.com
```

`OLLAMA_UNREACHABLE` and `MODEL_NOT_FOUND` are not reused for OpenAI so the
user-facing copy can be provider-correct (no "ollama serve" advice when OpenAI
fails).

### 7.2 User-facing messages

Add to `ERROR_MESSAGES` (no emoticons, per the project's global instruction):

```ts
OPENAI_AUTH_FAILED:
  'OpenAI rejected the API key. Open Settings and check or re-enter your key.',
OPENAI_RATE_LIMITED:
  'OpenAI rate limit reached. Wait a few seconds and try again.',
OPENAI_QUOTA_EXCEEDED:
  'Your OpenAI account is out of quota or has a billing issue. Check your OpenAI account, or switch back to local Ollama in Settings.',
OPENAI_UNREACHABLE:
  'Cannot reach OpenAI. Check your internet connection, or switch to local Ollama in Settings.',
```

Add to `ERROR_COLORS`:

```ts
OPENAI_AUTH_FAILED:    COLORS.FAILURE,  // #ef4444
OPENAI_RATE_LIMITED:   COLORS.WARNING,  // #eab308 (transient, retryable)
OPENAI_QUOTA_EXCEEDED: COLORS.FAILURE,  // #ef4444
OPENAI_UNREACHABLE:    COLORS.FAILURE,  // #ef4444
```

### 7.3 Classification

The OpenAI client maps HTTP status to a thrown `Error` whose message is one of
a small set of *internal* sentinels (not raw bodies). `classifyError` is
extended to recognize them:

| OpenAI condition | Detection | `ErrorCode` |
|------------------|-----------|-------------|
| HTTP 401 | `response.status === 401` | `OPENAI_AUTH_FAILED` |
| HTTP 429, body `type: insufficient_quota` | status 429 + parsed error type | `OPENAI_QUOTA_EXCEEDED` |
| HTTP 429, other | status 429 | `OPENAI_RATE_LIMITED` |
| HTTP 403 billing/region | status 403 | `OPENAI_QUOTA_EXCEEDED` (closest user action) |
| Network error / `AbortError` / timeout | fetch throws | `OPENAI_UNREACHABLE` (timeout still also maps to `REQUEST_TIMEOUT` if message says "timed out") |
| Non-OK other (5xx) | else branch | `UNEXPECTED_RESPONSE` |

When parsing a 429 body to distinguish quota from rate-limit, only the
`error.type` field is read; the body is not retained or surfaced. If parsing
fails, default to `OPENAI_RATE_LIMITED`.

Important: `classifyError` currently does substring matching on
`error.message`. The OpenAI client must therefore throw `Error`s with stable,
key-free, body-free messages (e.g. `new Error('OpenAI auth failed (401)')`) so
classification is reliable and nothing sensitive is embedded. Alternatively the
implementation may introduce a typed `LLMError { code: ErrorCode }` so
classification is structural rather than string-based — recommended, and called
out as Decision Q2 below.

## 8. Manifest Diff

Exact additions to `public/manifest.json`. Only `https://api.openai.com` is
added; nothing else changes.

`host_permissions`:

```diff
   "host_permissions": [
-    "http://localhost:11434/*"
+    "http://localhost:11434/*",
+    "https://api.openai.com/*"
   ],
```

`content_security_policy.extension_pages` — `connect-src` gains the OpenAI
origin; `script-src` and `object-src` are unchanged:

```diff
   "content_security_policy": {
-    "extension_pages": "script-src 'self'; object-src 'none'; connect-src 'self' http://localhost:11434"
+    "extension_pages": "script-src 'self'; object-src 'none'; connect-src 'self' http://localhost:11434 https://api.openai.com"
   }
```

Optionally, the `description` may be updated to mention an optional online
provider; not required for function.

Rationale:

- `host_permissions` must include `https://api.openai.com/*` so the service
  worker's `fetch` to the OpenAI API is not blocked by Chrome's
  extension-origin network policy.
- `connect-src` must include `https://api.openai.com` so the same `fetch` is
  permitted by the extension page CSP.
- The scope is one specific HTTPS origin. No wildcard host, no `<all_urls>`, no
  loosening of `script-src`/`object-src`. This is the minimum widening that
  enables the feature (least privilege).
- Consider whether `https://api.openai.com/*` should instead be an **optional
  host permission** requested only when the user first enables OpenAI. This
  would keep fresh installs strictly local-only at the permission level and is a
  stronger least-privilege posture — flagged as Decision Q4.

## 9. Open Decisions for the User

Most decisions are settled (D1–D5). The following genuinely need a call before
implementation:

- **Q1 — Key handling model.** This design stores the raw API key client-side
  in `chrome.storage.local` per D1. That is the explicit decision and is
  honored. For awareness only: any client-side key is extractable by a
  determined local attacker (it must be readable to be sent). The robust
  alternative is a thin user-hosted proxy that holds the key server-side. Out
  of scope per the stated decisions; noted so the residual risk is on record.
  No action needed unless the user wants to revisit.

- **Q2 — Error typing.** Recommend introducing a structural `LLMError` carrying
  an `ErrorCode` rather than extending the string-substring matching in
  `classifyError`. It is more reliable and reduces the chance of leaking
  details through error strings. Confirm whether the implementation phase may
  add this small internal type (no new npm dependency; pure TypeScript).

- **Q3 — `gpt-5*-nano` parameter compatibility.** The `gpt-5.4-nano` /
  `gpt-5-nano` models may reject a custom `temperature` and/or require
  `max_completion_tokens`. The implementation must confirm the accepted request
  parameters against current OpenAI docs and omit unsupported ones. Confirm the
  preferred behavior if a model rejects `temperature`: silently omit it
  (recommended) vs. surface a configuration error.

- **Q4 — Optional vs. required host permission.** Should
  `https://api.openai.com/*` be a *required* `host_permissions` entry (simpler;
  this design's default) or an *optional* permission requested via
  `chrome.permissions.request()` only when the user enables OpenAI (stronger
  least-privilege; fresh installs stay permission-pure-local)? Q4 affects the
  manifest shape and adds a small amount of UI/flow.

## 10. Definition of Done (for the design phase)

This planning phase is complete when: the `LLMClient` contract is specified
(done, Section 3); the OpenAI request/response/health-check is specified (done,
Section 4); the `ExtensionSettings` extension and a purely-additive migration
are specified (done, Section 5); the manifest diff is exact and minimal (done,
Section 8); the threat model covers data egress, key exposure, the widened
CSP/network surface, error leakage, and the D2 consent flow (done, Section 6);
new error codes and messages are defined (done, Section 7); and the remaining
open decisions are listed (done, Section 9). Implementation does not begin
until this document is reviewed and approved, and Q2–Q4 are answered.
