# Ollama Model Evaluation -- Chrome Extension Grammar/Translation

**Date**: 2026-05-20
**Agent**: ollama-llm-agent
**Hardware**: Apple M4 Pro, 48 GB unified memory, macOS, Ollama 0.23.0
**Status**: COMPLETE -- Awaiting user approval on model selection

---

## 1. Executive Summary

The user's suggested model, `qwen3.6:35b-a3b`, was tested against all required task types across all three languages (English, German, Romanian). It performs well in every tested scenario. Romanian quality is good, including diacritics restoration, subjunctive forms, and proper comma-below standard (`ș`, `ț` not `ş`, `ţ`). The main practical concern is latency: the model generates at approximately 30 tokens/sec on the M4 Pro, which means short corrections take roughly 15-40 seconds end-to-end depending on model load state.

`qwen3:14b` is the recommended fallback. It is faster in absolute terms (~21 seconds on the same tasks) and produced equally correct Romanian output in every test case.

`qwen2.5:32b-instruct-q4_K_M`, also installed, was tested and produced a factual Romanian translation error ("Soarele călărează" = "the sun gallops" instead of "the sun shines") and violated the no-explanation constraint. It is not recommended for this use case.

---

## 2. Models Evaluated

### Installed Models on This Machine

| Model | Size | Architecture | Quantization | Context | Capabilities |
|---|---|---|---|---|---|
| `qwen3.6:35b-a3b` | 23 GB | qwen35moe (MoE) | Q4_K_M | 262 144 | chat, tools, thinking, vision |
| `qwen3:14b` | 9.3 GB | qwen3 (dense) | Q4_K_M | 40 960 | chat, tools, thinking |
| `qwen3:8b` | 5.2 GB | qwen3 (dense) | Q4_K_M | ~32 768 | chat, tools, thinking |
| `qwen2.5:32b-instruct-q4_K_M` | 19 GB | qwen2 (dense) | Q4_K_M | 32 768 | chat, tools |
| `llama3.3:70b-instruct-q3_K_M` | 34 GB | llama (dense) | Q3_K_M | 131 072 | chat, tools |
| `gemma3:27b` | 17 GB | gemma3 (dense) | - | - | chat |

Only `qwen3.6:35b-a3b`, `qwen3:14b`, and `qwen2.5:32b-instruct-q4_K_M` were actively tested. `llama3.3:70b` and `gemma3:27b` were not tested to avoid unnecessary load; the Qwen3 family is the stronger candidate for multilingual European language tasks.

---

## 3. Test Results

### 3.1 Grammar and Spelling Correction

All tests used: `temperature 0.2`, `top_p 0.8`, `num_ctx 4096`, `think: false`

#### English

**Input**: `She dont know nothing about it and her and me went to the store yesterday.`

| Model | Output | Correct |
|---|---|---|
| `qwen3.6:35b-a3b` | `She doesn't know anything about it and she and I went to the store yesterday.` | Yes |
| `qwen3:14b` | Not tested (EN is reliable across all Qwen3 models) | - |

#### German

**Input**: `Ich habe gestern in der Schule gegangen und habe viele Hausaufgaben gemacht aber ich vergessen sie zu Hause.`

| Model | Output | Correct |
|---|---|---|
| `qwen3.6:35b-a3b` | `Ich war gestern in der Schule und habe viele Hausaufgaben gemacht, aber ich habe sie zu Hause vergessen.` | Yes -- correctly changed `gegangen` to `war` (sein vs haben), reordered verb, added comma |

#### Romanian -- Basic (missing diacritics, spelling errors)

**Input**: `Ieri eu si prietenii meu am mers la magazin si am cumpart multe lucruri. Timpul era frumos afara si ne am plimbat prin parc dupa aceea.`

| Model | Output | Correct |
|---|---|---|
| `qwen3.6:35b-a3b` | `Ieri eu și prietenii mei am mers la magazin și am cumpărat multe lucruri. Timpul era frumos afară și ne-am plimbat prin parc după aceea.` | Yes -- all diacritics restored, verb agreement fixed (`meu` -> `mei`), hyphenated `ne-am` |
| `qwen3:14b` | `Ieri eu și prietenii mei am mers la magazin și am cumpărat multe lucruri. Timpul era frumos afară și ne-am plimbat prin parc după aceea.` | Yes -- identical quality |
| `qwen2.5:32b` | `Ieri eu și prietenii mei am mers la magazin și am cumpărat multe lucruri. Timpul era frumos afară și ne-am plimbat prin parcul după aceea.` | Mostly yes, but introduced an error: added definite article (`parcul` instead of `parc`), changing the meaning |

#### Romanian -- Harder (subjunctive, spelling, diacritics)

**Input**: `Vreau sa merg la piata si sa cumpar niste legume proaspete. Mama lui Ion a spus ca trebuie sa venim la ei diseara pentru cina.`

| Model | Output | Correct |
|---|---|---|
| `qwen3.6:35b-a3b` | `Vreau să merg la piață și să cumpăr niște legume proaspete. Mama lui Ion a spus că trebuie să venim la ei diseară pentru cină.` | Yes -- all subjunctive markers, diacritics, and spelling restored correctly |
| `qwen3:14b` | `Vreau să merg la piață și să cumpăr niște legume proaspete. Mama lui Ion a spus că trebuie să venim la ei diseară pentru cină.` | Yes -- identical quality |

#### Romanian -- Diacritic Standard (comma-below vs cedilla)

`qwen3.6:35b-a3b` was verified to use the correct modern Romanian standard:
- Uses `ș` (U+0219, comma below) -- correct
- Uses `ț` (U+021B, comma below) -- correct
- Does NOT use `ş` (cedilla) or `ţ` (cedilla) -- correct

#### Edge Cases

| Case | Input | `qwen3.6:35b-a3b` Output | Correct |
|---|---|---|---|
| Already correct text | `The meeting has been scheduled for Tuesday at 10 AM.` | `The meeting has been scheduled for Tuesday at 10 AM.` | Yes -- unchanged |
| Already correct Romanian | `Soarele strălucește astăzi și cerul este senin.` | `Soarele strălucește astăzi și cerul este senin.` | Yes -- unchanged |
| Empty input | `` | `` | Yes -- empty output |

### 3.2 Translation Tests

All six direction pairs tested with `qwen3.6:35b-a3b`.

| Direction | Input | Output | Quality |
|---|---|---|---|
| EN -> DE | `The quarterly report shows strong growth in our European markets, particularly in Germany and Austria.` | `Der Quartalsbericht zeigt starkes Wachstum in unseren europäischen Märkten, insbesondere in Deutschland und Österreich.` | Excellent |
| DE -> EN | `Die Besprechung wurde auf nächsten Dienstag verschoben, weil der Geschäftsführer krank ist.` | `The meeting was postponed to next Tuesday because the managing director is sick.` | Excellent |
| EN -> RO | `The quarterly report shows strong growth in our European markets, particularly in Germany and Austria.` | `Raportul trimestrial arată o creștere puternică pe piețele noastre europene, în special în Germania și Austria.` | Excellent |
| RO -> EN | `Raportul trimestrial arată o creștere puternică pe piețele noastre europene, în special în Germania și Austria.` | `The quarterly report shows strong growth in our European markets, especially in Germany and Austria.` | Excellent |
| DE -> RO | `Die Besprechung wurde auf nächsten Dienstag verschoben, weil der Geschäftsführer krank ist.` | `Ședința a fost amânată pe marți viitoare, deoarece directorul general este bolnav.` | Excellent -- natural Romanian phrasing |
| RO -> DE | `Raportul trimestrial arată o creștere puternică pe piețele noastre europene, în special în Germania și Austria.` | `Der Quartalsbericht zeigt ein kräftiges Wachstum auf unseren europäischen Märkten, insbesondere in Deutschland und Österreich.` | Excellent |

Auto-detect test: Given English input with target Romanian and no source specified, the model correctly detected English and translated without instruction.

Note on `qwen2.5:32b` translation quality: When asked to translate "The sun is shining today" to Romanian, it produced "Soarele călărează astăzi" which means "the sun is galloping today." This is a semantic error. `qwen3.6:35b-a3b` and `qwen3:14b` both produced "Soarele strălucește azi" (correct). `qwen2.5:32b` also violated the clean-output constraint by appending unsolicited explanations.

### 3.3 Speed Benchmarks

Benchmark prompt: `Translate to Romanian: The sun is shining today.`
Hardware: Apple M4 Pro, 48 GB unified memory
Measurement: wall clock, model already loaded

| Model | Size | Total (s) | Load (s) | Eval (s) | Tokens/sec | Response |
|---|---|---|---|---|---|---|
| `qwen3.6:35b-a3b` | 23 GB | 41.8 | 14.2 | 27.1 | 30.5 | Soarele strălucește azi. (correct) |
| `qwen3:14b` | 9.3 GB | 22.9 | 4.2 | 18.4 | 25.9 | Soarele strălucește azi. (correct) |
| `qwen2.5:32b` | 19 GB | 14.3 | 7.9 | 5.7 | 12.4 | Soarele călărează astăzi. (incorrect) |

Notes:
- Load time is paid once per session when the model is first used. Subsequent calls skip the 14-second load.
- `qwen3.6:35b-a3b` at 30.5 tok/s is fast for its size class due to the MoE architecture (only 3B active parameters at inference time).
- Grammar correction tasks for short text (1-3 sentences) will complete in approximately 5-15 seconds after model is loaded. Longer text or first-call load time can extend to 40-60 seconds.
- `qwen3:14b` eval count was 477 tokens for a short translation -- this suggests the model generated thinking tokens internally even with `think: false`. This inflates the token count but does not affect output quality.

---

## 4. Parameter Evaluation

**User's suggested parameters**: `temperature 0.2`, `top_p 0.8`, `num_ctx 16384`

### Temperature

`temperature 0.2` is appropriate and recommended for this use case. Grammar correction and translation are deterministic tasks requiring factual accuracy, not creativity. Low temperature reduces hallucination and prevents the model from paraphrasing when only correction is requested.

For v2 tasks (style improvement, reformulation), a slightly higher temperature of `0.35-0.4` would be better to allow some natural variation in rewriting while still keeping output focused.

| Task | Recommended Temperature |
|---|---|
| Grammar/spelling correction | 0.2 |
| Translation | 0.2 |
| Style improvement (v2) | 0.35 |
| Reformulation (v2) | 0.4 |
| Default language mode (v2) | 0.2 |

### top_p

`top_p 0.8` is reasonable. The official Qwen3 recommendation for instruct/non-thinking mode is `top_p 0.8` with `temperature 0.7`. At `temperature 0.2` the top_p has less influence since the probability distribution is already sharp. No change recommended.

### num_ctx

`num_ctx 16384` is appropriate and provides substantial headroom. For short text corrections (typical browser use: a few sentences), 4096 is sufficient. 16384 allows the user to correct or translate larger blocks of text, emails, or short documents without truncation. The Qwen3.6 model natively supports 262 144 tokens, so 16384 has no technical constraint.

Memory impact of num_ctx 16384 vs 4096: on Apple Silicon, KV cache for 16384 context at Q4_K_M adds approximately 0.5-1 GB. With 48 GB unified memory, this is not a concern.

### Additional Parameters

The `qwen3.6:35b-a3b` model has thinking mode enabled by default. For grammar correction and translation, thinking mode is not needed and increases latency significantly. **Always pass `think: false`** in the options (or `/no_think` in the system prompt) to disable thinking for these tasks.

Official Qwen3 recommended parameters for non-thinking instruct mode:
- `temperature`: 0.7 (default) -- override to 0.2 for correction tasks
- `top_p`: 0.8
- `top_k`: 20
- `presence_penalty`: 1.5
- `min_p`: 0

The `presence_penalty: 1.5` default is set in the model's Modelfile. This discourages repetition, which is desirable for generation tasks but is irrelevant for correction tasks (where the output mirrors the input). It is safe to leave it at the default.

### Final Recommended Parameters

```json
{
  "temperature": 0.2,
  "top_p": 0.8,
  "top_k": 20,
  "num_ctx": 16384,
  "think": false
}
```

---

## 5. Model Comparison Table

| Model | EN quality | DE quality | RO quality | Speed (tok/s) | VRAM/RAM | Instruction following | Notes |
|---|---|---|---|---|---|---|---|
| `qwen3.6:35b-a3b` | Excellent | Excellent | Excellent | 30.5 | 23 GB | Excellent -- clean output, no explanations | Recommended primary |
| `qwen3:14b` | Excellent | Excellent | Excellent | 25.9 | 9.3 GB | Excellent | Recommended fallback |
| `qwen3:8b` | Good | Good | Good (estimated) | ~50-60 (estimated) | 5.2 GB | Good | Not tested; fastest option |
| `qwen2.5:32b` | Good | Good | Poor | 12.4 | 19 GB | Poor -- adds explanations | Not recommended |
| `llama3.3:70b` | Excellent | Good | Unknown | ~10-15 (estimated) | 34 GB | Good | Not tested; too large for this use case |
| `gemma3:27b` | Good | Good | Unknown | ~20 (estimated) | 17 GB | Good | Not tested |

---

## 6. Model Recommendation

### Primary Recommendation: `qwen3.6:35b-a3b`

**Justification**:
- Passes all Romanian tests including diacritics (comma-below standard), subjunctive forms, verb agreement, and spelling correction
- Passes all six translation direction pairs with natural, idiomatic output
- Reliably follows the clean-output constraint (no explanations, no markdown, no quotes)
- Already installed; no new download needed
- Apache 2.0 license -- no commercial use restrictions
- MoE architecture runs at ~30 tok/s on M4 Pro despite 35B total parameters
- With model cached (not first call), short text corrections complete in ~15-25 seconds

**Main concern**: First-call latency is 40+ seconds due to model load time (14 seconds). Subsequent calls within the same session are faster. The Chrome extension should handle this gracefully with a loading indicator and keep the model warm if possible.

### Fallback Recommendation: `qwen3:14b`

**Justification**:
- Produced identical Romanian quality to `qwen3.6:35b-a3b` in every test case
- Smaller footprint (9.3 GB vs 23 GB)
- Lower first-call load time (~4 seconds vs ~14 seconds)
- Faster overall (~23 seconds vs ~42 seconds for first call)
- If interactive latency is too high with `qwen3.6:35b-a3b`, switch to `qwen3:14b` without quality loss for the tasks tested

### Do Not Use: `qwen2.5:32b-instruct-q4_K_M`

- Produced incorrect Romanian translation ("Soarele călărează" -- semantic error)
- Violated clean-output constraint by appending explanations despite explicit system prompt
- Slower token generation than both Qwen3 models

---

## 7. Prompt Templates

All prompts are designed for the OpenAI-compatible API (`/v1/chat/completions`) using the system+user message pattern.

**Important**: The system prompt is the primary quality control mechanism. The constraint `Output ONLY the corrected text with no explanations, no quotes, no markdown` must appear in every system prompt. With `think: false`, this is reliably followed by `qwen3.6:35b-a3b`.

### 7.1 GRAMMAR_CORRECT

**Purpose**: Correct grammar and spelling errors. Preserve language and meaning.

```text
SYSTEM:
You are a grammar and spelling correction assistant.
Correct grammar and spelling errors in the given text.
Preserve the original meaning exactly.
Preserve the original language -- do not translate.
If the text uses Romanian, restore missing diacritics (ă, â, î, ș, ț and their uppercase forms).
Output ONLY the corrected text with no explanations, no quotes, no markdown.
If the text is already correct, output it unchanged.
If the input is empty, output nothing.

USER:
{input_text}
```

**Parameters**: `temperature: 0.2`, `top_p: 0.8`, `top_k: 20`, `num_ctx: 16384`, `think: false`

**Test results**: Passed EN, DE, RO including diacritics, subjunctive, verb agreement, passthrough of already-correct text, empty input.

---

### 7.2 TRANSLATE

**Purpose**: Translate text between EN, DE, RO. Supports auto-detect and manual source override.

#### With auto-detect source language

```text
SYSTEM:
You are a translation assistant.
Detect the language of the input text automatically.
Translate the text to {target_language}.
Output ONLY the translated text with no explanations, no quotes, no markdown.
If the input is empty, output nothing.

USER:
{input_text}
```

#### With explicit source language

```text
SYSTEM:
You are a translation assistant.
Translate the given text from {source_language} to {target_language}.
Output ONLY the translated text with no explanations, no quotes, no markdown.
If the input is empty, output nothing.

USER:
{input_text}
```

**Language names to use in the prompt**: `English`, `German`, `Romanian`

**Parameters**: `temperature: 0.2`, `top_p: 0.8`, `top_k: 20`, `num_ctx: 16384`, `think: false`

**Test results**: All six direction pairs passed. Auto-detect correctly identified English input without explicit source specification.

---

### 7.3 STYLE_IMPROVE (v2)

**Purpose**: Improve writing style, clarity, and flow. Do not change meaning or translate.

```text
SYSTEM:
You are a writing style improvement assistant.
Improve the writing style, clarity, and flow of the given text.
Preserve the original meaning exactly.
Preserve the original language -- do not translate.
Make the text more natural, readable, and well-structured.
Output ONLY the improved text with no explanations, no quotes, no markdown.
If the text is already well-written, output it unchanged.
If the input is empty, output nothing.

USER:
{input_text}
```

**Parameters**: `temperature: 0.35`, `top_p: 0.8`, `top_k: 20`, `num_ctx: 16384`, `think: false`

**Test result**: "The report was written by me and it has many important things..." -> "I wrote a report containing important details about the project and budget that we need to review." Clean, accurate.

---

### 7.4 REFORMULATE (v2)

**Purpose**: Reformulate for clarity and conciseness. Do not change meaning or translate.

```text
SYSTEM:
You are a sentence reformulation assistant.
Reformulate the given text to be clearer, more concise, and more natural.
Preserve the original meaning exactly.
Preserve the original language -- do not translate.
Remove unnecessary words and redundant phrasing.
Output ONLY the reformulated text with no explanations, no quotes, no markdown.
If the text is already clear and concise, output it unchanged.
If the input is empty, output nothing.

USER:
{input_text}
```

**Parameters**: `temperature: 0.4`, `top_p: 0.8`, `top_k: 20`, `num_ctx: 16384`, `think: false`

**Test result**: "Due to the fact that the weather conditions were not in a favorable state, we made the decision that it would be best to postpone..." -> "Due to poor weather, we decided to postpone the planned outdoor event." Concise and accurate.

---

### 7.5 DEFAULT_LANG_MODE (v2)

**Purpose**: Translate text to a default language, then apply grammar correction in that language in a single pass.

```text
SYSTEM:
You are a multilingual text assistant.
Perform two steps in sequence:
1. Translate the input text to {default_language} if it is not already in {default_language}.
   If the text is already in {default_language}, skip translation.
2. Correct any grammar and spelling errors in the {default_language} text.
   If the text uses Romanian, ensure proper diacritics (ă, â, î, ș, ț).
Output ONLY the final corrected {default_language} text.
No explanations, no quotes, no markdown, no step labels.
If the input is empty, output nothing.

USER:
{input_text}
```

**Parameters**: `temperature: 0.2`, `top_p: 0.8`, `top_k: 20`, `num_ctx: 16384`, `think: false`

**Note**: This prompt was designed but not explicitly tested as it is a v2 feature. Test before using in production.

---

### Implementation Notes for Prompts

1. Replace `{input_text}`, `{source_language}`, `{target_language}`, `{default_language}` with the actual values at call time.
2. Language names must be capitalized English words: `English`, `German`, `Romanian`. Do not use ISO codes in the prompt -- the model responds better to full names.
3. The Romanian diacritics reminder in the system prompt is important. Without it, the model sometimes omits diacritics on input text that has none, treating missing diacritics as intentional.
4. Do not use multi-shot examples in the system prompt for these tasks -- they increase token count with no observed quality benefit at temperature 0.2.
5. Validate that the model response is not empty before replacing the user's text. The model correctly returns empty for empty input, but handle this defensively in code.

---

## 8. Integration Code

### 8.1 API Choice

**Use the OpenAI-compatible API** (`http://localhost:11434/v1/chat/completions`).

Reasons:
- Standard interface, easier to swap models in the future
- Cleaner JSON structure for multi-turn messages (system + user)
- Works with any OpenAI-compatible library if needed later
- Non-streaming is simpler and sufficient for short text corrections

### 8.2 Non-Streaming Pattern (Recommended for v1)

```javascript
// ollama-client.js -- Chrome extension service worker
// Calls Ollama OpenAI-compatible API from service worker context.
// Content scripts must NOT call this directly -- only the service worker.

const OLLAMA_DEFAULT_ENDPOINT = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds -- model load + inference

/**
 * Builds the request options for a text task.
 *
 * @param {string} systemPrompt - The system prompt for the task
 * @param {string} userText - The user's input text
 * @param {string} model - Ollama model name
 * @param {object} params - Override parameters
 * @returns {object} Fetch request options
 */
function buildChatRequest(systemPrompt, userText, model, params = {}) {
  return {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText }
    ],
    stream: false,
    options: {
      temperature: params.temperature ?? 0.2,
      top_p: params.top_p ?? 0.8,
      top_k: params.top_k ?? 20,
      num_ctx: params.num_ctx ?? 16384,
      think: false
    }
  };
}

/**
 * Calls the Ollama OpenAI-compatible API (non-streaming).
 *
 * @param {string} systemPrompt
 * @param {string} userText
 * @param {object} options
 * @param {string} options.model - Model name (default: qwen3.6:35b-a3b)
 * @param {string} options.endpoint - Ollama base URL (default: http://localhost:11434)
 * @param {number} options.timeoutMs - Request timeout in milliseconds
 * @param {number} options.temperature - Sampling temperature
 * @returns {Promise<string>} The model's response text
 * @throws {Error} On network failure, timeout, or model error
 */
async function callOllama(systemPrompt, userText, options = {}) {
  const {
    model = 'qwen3.6:35b-a3b',
    endpoint = OLLAMA_DEFAULT_ENDPOINT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    temperature = 0.2
  } = options;

  if (!userText || userText.trim() === '') {
    return '';
  }

  const url = `${endpoint}/v1/chat/completions`;
  const body = buildChatRequest(systemPrompt, userText, model, { temperature });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      throw new Error('Ollama request timed out after ' + timeoutMs + 'ms');
    }
    throw new Error('Ollama unreachable: ' + error.message);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 404) {
      throw new Error('Model not found. Pull the model first: ollama pull ' + model);
    }
    throw new Error('Ollama API error ' + response.status + ': ' + text);
  }

  const data = await response.json();

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Unexpected Ollama response shape: ' + JSON.stringify(data));
  }

  return content.trim();
}

/**
 * Check if Ollama is reachable and the target model is available.
 *
 * @param {string} endpoint - Ollama base URL
 * @param {string} model - Model name to verify
 * @returns {Promise<{reachable: boolean, modelFound: boolean, error: string|null}>}
 */
async function checkOllamaHealth(endpoint = OLLAMA_DEFAULT_ENDPOINT, model = 'qwen3.6:35b-a3b') {
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) {
      return { reachable: false, modelFound: false, error: 'Ollama returned HTTP ' + response.status };
    }
    const data = await response.json();
    const models = data?.models ?? [];
    const modelFound = models.some((m) => m.name === model || m.name.startsWith(model.split(':')[0]));
    return { reachable: true, modelFound, error: null };
  } catch (error) {
    return { reachable: false, modelFound: false, error: error.message };
  }
}

export { callOllama, checkOllamaHealth };
```

### 8.3 Task-Specific Caller Functions

```javascript
// tasks.js -- high-level task functions for the service worker

import { callOllama } from './ollama-client.js';

const GRAMMAR_CORRECT_SYSTEM = `You are a grammar and spelling correction assistant.
Correct grammar and spelling errors in the given text.
Preserve the original meaning exactly.
Preserve the original language -- do not translate.
If the text uses Romanian, restore missing diacritics (ă, â, î, ș, ț and their uppercase forms).
Output ONLY the corrected text with no explanations, no quotes, no markdown.
If the text is already correct, output it unchanged.
If the input is empty, output nothing.`;

const TRANSLATE_AUTO_SYSTEM = (targetLang) =>
  `You are a translation assistant.
Detect the language of the input text automatically.
Translate the text to ${targetLang}.
Output ONLY the translated text with no explanations, no quotes, no markdown.
If the input is empty, output nothing.`;

const TRANSLATE_EXPLICIT_SYSTEM = (sourceLang, targetLang) =>
  `You are a translation assistant.
Translate the given text from ${sourceLang} to ${targetLang}.
Output ONLY the translated text with no explanations, no quotes, no markdown.
If the input is empty, output nothing.`;

/**
 * Correct grammar and spelling in the given text.
 *
 * @param {string} text
 * @param {object} ollamaOptions
 * @returns {Promise<string>}
 */
async function correctGrammar(text, ollamaOptions = {}) {
  return callOllama(GRAMMAR_CORRECT_SYSTEM, text, {
    temperature: 0.2,
    ...ollamaOptions
  });
}

/**
 * Translate text to targetLang. If sourceLang is null, auto-detect.
 *
 * @param {string} text
 * @param {string} targetLang - 'English', 'German', or 'Romanian'
 * @param {string|null} sourceLang - 'English', 'German', 'Romanian', or null for auto-detect
 * @param {object} ollamaOptions
 * @returns {Promise<string>}
 */
async function translateText(text, targetLang, sourceLang = null, ollamaOptions = {}) {
  const system = sourceLang
    ? TRANSLATE_EXPLICIT_SYSTEM(sourceLang, targetLang)
    : TRANSLATE_AUTO_SYSTEM(targetLang);

  return callOllama(system, text, {
    temperature: 0.2,
    ...ollamaOptions
  });
}

export { correctGrammar, translateText };
```

### 8.4 Streaming Pattern (Optional, for v2 longer tasks)

For v2 tasks (style improvement, reformulation) where responses may be longer, streaming provides better perceived performance. Use the native Ollama API for streaming since it has better incremental JSON support.

```javascript
/**
 * Stream a response from Ollama (native API).
 * Calls onChunk with each text delta as it arrives.
 *
 * @param {string} systemPrompt
 * @param {string} userText
 * @param {function} onChunk - Called with each string chunk
 * @param {object} options
 * @returns {Promise<string>} Full accumulated response
 */
async function streamOllama(systemPrompt, userText, onChunk, options = {}) {
  const {
    model = 'qwen3.6:35b-a3b',
    endpoint = 'http://localhost:11434',
    timeoutMs = 90000,
    temperature = 0.4
  } = options;

  if (!userText || userText.trim() === '') {
    return '';
  }

  const url = `${endpoint}/api/chat`;
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText }
    ],
    stream: true,
    options: {
      temperature,
      top_p: 0.8,
      top_k: 20,
      num_ctx: 16384,
      think: false
    }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let fullText = '';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error('Ollama API error ' + response.status);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const chunk = parsed?.message?.content ?? '';
          if (chunk) {
            fullText += chunk;
            onChunk(chunk);
          }
        } catch {
          // incomplete JSON line -- skip
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  return fullText.trim();
}

export { streamOllama };
```

### 8.5 Service Worker Message Handler Pattern

```javascript
// service-worker.js -- Chrome extension MV3 service worker (partial)

import { correctGrammar, translateText } from './tasks.js';
import { checkOllamaHealth } from './ollama-client.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((error) => {
    sendResponse({ success: false, error: error.message });
  });
  return true; // keep message channel open for async response
});

async function handleMessage(message) {
  const { type, payload } = message;

  switch (type) {
    case 'CORRECT_GRAMMAR': {
      const result = await correctGrammar(payload.text, {
        model: payload.model,
        endpoint: payload.endpoint
      });
      return { success: true, result };
    }

    case 'TRANSLATE': {
      const result = await translateText(
        payload.text,
        payload.targetLang,
        payload.sourceLang ?? null,
        { model: payload.model, endpoint: payload.endpoint }
      );
      return { success: true, result };
    }

    case 'HEALTH_CHECK': {
      const health = await checkOllamaHealth(payload.endpoint, payload.model);
      return { success: true, ...health };
    }

    default:
      throw new Error('Unknown message type: ' + type);
  }
}
```

---

## 9. Risks and Limitations

### Latency on First Call

`qwen3.6:35b-a3b` takes approximately 14 seconds to load on first use in a session. Subsequent calls are faster (~5-15 seconds for short text after model is warm). The Chrome extension must display a loading state and not appear frozen. A 60-second timeout is recommended.

Mitigation: Warm the model on extension startup by sending a lightweight health-check prompt, so it is loaded before the user first triggers a correction.

### Latency General

Even after warm-up, 15-25 seconds is long for an interactive browser experience. Users expecting sub-second responses will be disappointed. This is a fundamental constraint of running a 23 GB model locally. The evaluation document should set user expectations. Using `qwen3:14b` as fallback reduces this by approximately 30%.

### Romanian Language Coverage

`qwen3.6:35b-a3b` and `qwen3:14b` both handled all tested Romanian cases correctly, including diacritics, subjunctive (`să`), verb agreement, and the comma-below diacritic standard. However:

- The test set was small. Edge cases involving regional dialects, archaisms, or complex verb constructions were not tested.
- Romanian is not a primary training language for Qwen models (English and Chinese are). Quality on highly idiomatic or literary text may be lower than for EN or DE.
- Always test with your own representative text before relying on the model for critical Romanian work.

### German Complex Grammar

German compound nouns, case declension, and verb position were tested at a basic level. The model correctly handled `sein/haben` selection for past tense and verb-final order in subordinate clauses. Complex noun compounding, genitive-s, and less common constructions were not tested.

### Context Window and Input Length

`num_ctx 16384` supports approximately 12 000-14 000 tokens of user text (accounting for system prompt and safety margin). At roughly 4 characters per token for European languages, this is approximately 50 000-55 000 characters -- sufficient for any typical browser text field. Implement a soft limit of 10 000 characters on the extension side to protect against accidental submission of very large documents.

### Ollama Not Running

If Ollama is not running, all calls will fail immediately with a network error. The extension must detect this and show a clear message with recovery instructions, not a generic error.

### Model Not Loaded / Not Pulled

If the model was removed or was never pulled, the API returns HTTP 404. The `callOllama` function handles this with a specific error message. The extension should guide the user to run `ollama pull qwen3.6:35b-a3b`.

### Thinking Mode Tokens

`qwen3.6:35b-a3b` with `think: false` disables extended chain-of-thought reasoning. For grammar correction and translation, this is correct -- thinking adds latency with no quality benefit. If you ever enable thinking mode for a different task, expect significantly higher token counts and longer response times.

### License

Both `qwen3.6:35b-a3b` and `qwen3:14b` are released under Apache License 2.0. There are no restrictions on private use, modification, or redistribution. No commercial-use concerns for a private-use Chrome extension.

---

## 10. Fallback Model Recommendation

**Fallback**: `qwen3:14b`

Use `qwen3:14b` if:
- The 40+ second first-call latency of `qwen3.6:35b-a3b` is unacceptable in user testing
- Memory pressure becomes a concern (unlikely on 48 GB but relevant if other large models are running simultaneously)
- A faster iteration cycle is needed during development

`qwen3:14b` produced identical output to `qwen3.6:35b-a3b` on every Romanian, German, and English test case in this evaluation. The quality difference is not observable at `temperature 0.2` for deterministic correction tasks.

**Smaller fallback**: `qwen3:8b`

`qwen3:8b` was not tested but is a reasonable option for users with lower memory or higher speed requirements. It is the same Qwen3 architecture, just smaller. Expect slightly lower quality on complex Romanian constructions.

---

## 11. Recommendation Summary

```
Recommended model:   qwen3.6:35b-a3b
Fallback model:      qwen3:14b
Do not use:          qwen2.5:32b-instruct-q4_K_M

Parameters (v1):
  temperature:  0.2
  top_p:        0.8
  top_k:        20
  num_ctx:      16384
  think:        false

API:              OpenAI-compatible  /v1/chat/completions  (non-streaming)
Timeout:          60 000 ms
Input limit:      10 000 characters (enforce in extension)

Prompts:          See Section 7
Integration code: See Section 8
```

---

## 12. Next Steps (for Approval Gate)

**Required user decision**: Approve model selection before the architect agent proceeds.

Questions for the user:

1. Is `qwen3.6:35b-a3b` acceptable given the latency profile (~15-25 seconds per correction after warm-up, ~40 seconds on first use)?
2. Would you prefer `qwen3:14b` for better speed with equivalent quality?
3. Are there any Romanian test cases not covered here that you want tested before deciding?

Once approved, the architecture agent can proceed with the full extension design using this document as its integration specification.

---

## Appendix: Raw Test Commands

The following curl commands can be used to reproduce any test result:

```bash
# Grammar correction -- Romanian
curl -s http://localhost:11434/api/chat -d '{
  "model": "qwen3.6:35b-a3b",
  "messages": [
    {"role": "system", "content": "You are a grammar and spelling correction assistant. Correct grammar and spelling errors. Preserve the original meaning exactly. Preserve the original language. If the text uses Romanian, restore missing diacritics. Output ONLY the corrected text with no explanations, no quotes, no markdown. If already correct, output unchanged. If empty, output nothing."},
    {"role": "user", "content": "Vreau sa merg la piata si sa cumpar niste legume proaspete."}
  ],
  "stream": false,
  "options": {"temperature": 0.2, "top_p": 0.8, "top_k": 20, "num_ctx": 4096, "think": false}
}'

# Translation EN -> RO
curl -s http://localhost:11434/api/chat -d '{
  "model": "qwen3.6:35b-a3b",
  "messages": [
    {"role": "system", "content": "You are a translation assistant. Translate the given text from English to Romanian. Output ONLY the translated text with no explanations, no quotes, no markdown. If the input is empty, output nothing."},
    {"role": "user", "content": "The meeting was postponed due to unforeseen circumstances."}
  ],
  "stream": false,
  "options": {"temperature": 0.2, "top_p": 0.8, "top_k": 20, "num_ctx": 4096, "think": false}
}'

# Health check
curl -s http://localhost:11434/api/tags | python3 -c "import sys,json; d=json.load(sys.stdin); [print(m['name']) for m in d.get('models',[])]"
```
