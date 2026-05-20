# Kickoff Meeting Notes -- Correct, Reformulate & Translate Chrome Extension

**Date**: 2026-05-20
**Type**: Requirements and Architecture Planning
**Status**: PLANNING -- No implementation started

---

## 1. Project Overview

### Goal
Build a Chrome extension that helps users correct grammar and spelling, improve writing style, reformulate sentences for clarity, and translate text between English, German, and Romanian -- all powered by a local Ollama LLM instance.

### Core Features
1. **Grammar and Spelling Correction** -- Fix errors in text fields on web pages
2. **Writing Style Suggestions** -- Improve tone, clarity, and readability
3. **Sentence Reformulation** -- Rewrite sentences for conciseness and clarity
4. **Translation** -- Translate between English, German, and Romanian
5. **Default Language Mode** -- When a default language is set, all text is automatically translated to that language, then corrected for grammar, spelling, style, and clarity in that language

### Technology Stack
- Chrome Extension (Manifest V3)
- TypeScript, Vite, React, Tailwind CSS, pnpm
- Local Ollama via OpenAI-compatible API (`http://localhost:11434/v1/...`)
- No external APIs -- fully local and private

### Target User
- The developer (private use)
- Multilingual user working in English, German, and Romanian

---

## 2. Agent Roster and Assignments

| Agent | Role | Model | Responsibilities |
|-------|------|-------|-----------------|
| **project-agent-orchestrator** | Coordinator | opus | Scope control, task dispatch, approval gates, delivery tracking |
| **chrome-extension-architect** | Architect | opus | Architecture design, manifest, permissions, security, data flow, threat model |
| **chrome-extension-developer** | Developer | sonnet | Implementation, build setup, coding, refactoring |
| **ollama-llm-agent** | LLM Specialist | sonnet | Model selection, Ollama config, prompt engineering, integration patterns |
| **chrome-extension-qa-tester** | QA/Security | sonnet | Testing, debugging, security audit, validation |

---

## 3. Architecture Decisions Needed

### 3.1 UI Approach
**Decision**: How does the user interact with the extension?

Options to evaluate:
- **Popup UI** -- Click extension icon, paste or type text, get results
- **Context menu** -- Right-click selected text on any page, choose action
- **Content script inline** -- Detect text fields, add action buttons near them
- **Side panel** -- Persistent panel for ongoing work
- **Combination** -- Popup for settings + context menu for quick actions + content script for in-page corrections

**Recommendation for architect**: Evaluate a combination approach:
- Popup for settings (default language, model config)
- Context menu for quick actions on selected text (correct, reformulate, translate)
- Content script to inject results back into text fields or show overlay
- Side panel as optional for longer text work

**User decision needed**: Which interaction patterns are desired?

### 3.2 Message Passing Architecture
**Decision**: How do components communicate?

Flow: Content Script <-> Service Worker <-> Ollama API

Key considerations:
- Service worker makes Ollama API calls (content scripts cannot call localhost due to CORS/CSP)
- Typed message contracts between content script, service worker, and popup
- Streaming vs non-streaming responses from Ollama
- Timeout handling for slow model inference

### 3.3 Ollama Integration Pattern
**Decision**: How to call Ollama from the extension?

Options:
- **OpenAI-compatible API** (`/v1/chat/completions`) -- preferred, standard interface
- **Native Ollama API** (`/api/chat`) -- more Ollama-specific features
- **Streaming** -- better UX for long responses but more complex
- **Non-streaming** -- simpler, adequate for short text corrections

**Recommendation**: Use OpenAI-compatible API with non-streaming for corrections (short responses), optional streaming for longer reformulations.

### 3.4 Prompt Engineering Strategy
**Decision**: How to structure prompts for each task?

Tasks requiring distinct prompts:
1. Grammar and spelling correction
2. Writing style improvement
3. Sentence reformulation
4. Translation (6 direction pairs: EN<->DE, EN<->RO, DE<->RO)
5. Combined default-language mode (translate + correct + style + reformulate)

Key considerations:
- Prompts must produce clean output (corrected text only, no explanations unless requested)
- Language detection may be needed for default language mode
- Prompts must work reliably with the chosen model
- Temperature and parameter tuning per task type

### 3.5 Permissions Model
**Decision**: What Chrome permissions are needed?

Minimum expected:
- `storage` -- save user settings (default language, model config)
- `activeTab` -- access current page text fields
- `contextMenus` -- right-click actions
- Host permission for `http://localhost:11434/*` -- Ollama API access

Possibly needed:
- `scripting` -- for programmatic content script injection
- `sidePanel` -- if side panel UI is included

**Security note**: No `<all_urls>` needed. Ollama is localhost only.

### 3.6 Model Selection
**Decision**: Which Ollama model to use?

User's suggestion: `qwen3.6:35b-a3b` (already installed on the machine)

User's hardware:
- Apple M4 Pro
- 48 GB unified memory
- Ollama 0.23.0

Models already available locally:
- `qwen3.6:35b-a3b` (23 GB) -- user's suggestion
- `qwen3.6:35b-a3b-coding-nvfp4` (21 GB) -- coding variant
- `qwen3:8b` (5.2 GB) -- smaller, faster
- `qwen3:14b` (9.3 GB) -- mid-range
- `qwen3-coder:30b` (18 GB) -- coding focused
- `gemma3:27b` (17 GB) -- alternative

User's suggested parameters:
- temperature: 0.2
- top_p: 0.8
- num_ctx: 16384

**ollama-llm-agent must evaluate**: Is `qwen3.6:35b-a3b` the right model for multilingual grammar correction, reformulation, and translation across EN/DE/RO? Are the parameters appropriate? Is there a better option among models already installed or available?

**User approval required** before finalizing model choice.

---

## 4. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Ollama not running** | High | Medium | Detect Ollama availability on extension load; show clear error with instructions |
| **Model not pulled** | High | Low | Check model availability; provide setup instructions in extension |
| **Latency on large text** | Medium | High | Limit input text length; show progress indicator; consider streaming |
| **Romanian language quality** | Medium | Medium | Test RO specifically; ollama-llm-agent to evaluate model's RO capability |
| **German compound words / grammar** | Medium | Medium | Test DE grammar correction specifically; German grammar is complex |
| **Service worker timeout** | Medium | Medium | Ollama inference can be slow; handle SW lifecycle carefully |
| **CORS/CSP for localhost** | Medium | Low | Service worker handles all API calls; content scripts do not call Ollama directly |
| **Model hallucination** | Medium | Medium | Low temperature (0.2); strict prompts; output validation |
| **Context window overflow** | Low | Low | 16K context should be sufficient for text correction; add input length limits |
| **Multiple models loaded** | Low | Low | 48GB RAM is generous; single model should be fine |

---

## 5. Development Phases

### Phase 0: Model Evaluation and Prompt Engineering (ollama-llm-agent)
**Deliverables**:
- Model recommendation with benchmarks for EN/DE/RO tasks
- Optimized prompts for each task (correct, style, reformulate, translate)
- Parameter recommendations (temperature, top_p, num_ctx)
- Ollama integration code pattern (API calls, error handling, timeouts)
- Default language mode prompt strategy

**Depends on**: User approval of model choice
**Approval gate**: User approves model and prompt strategy

### Phase 1: Architecture Design (chrome-extension-architect)
**Deliverables**:
- Complete architecture document
- Manifest V3 design with permission justification
- File/folder structure
- Data flow and message flow diagrams (Mermaid)
- Typed message contracts
- Threat model
- Security checklist
- UI wireframe descriptions (popup, context menu, content script overlay)
- Implementation phase checklist

**Depends on**: Phase 0 (Ollama integration pattern known)
**Approval gate**: User approves architecture before development

### Phase 2: Foundation Implementation (chrome-extension-developer)
**Deliverables**:
- Project scaffold (Vite + TypeScript + React + Tailwind + pnpm)
- Manifest V3 with correct permissions
- Service worker with Ollama API integration
- Typed messaging layer
- Storage abstraction for settings
- Basic popup UI (settings: default language, model endpoint)

**Depends on**: Phase 1 (architecture approved)
**Approval gate**: Extension loads in Chrome, connects to Ollama

### Phase 3: Feature Implementation (chrome-extension-developer)
**Deliverables**:
- Context menu integration (correct, reformulate, translate)
- Content script for text field detection and result injection
- All prompt-based features working (correct, style, reformulate, translate)
- Default language mode
- Error states and loading indicators
- Settings persistence

**Depends on**: Phase 2 (foundation working)
**Approval gate**: All features functional in manual testing

### Phase 4: QA, Security, and Polish (chrome-extension-qa-tester)
**Deliverables**:
- Full QA report
- Security audit (permissions, message validation, DOM safety)
- Unit tests for shared logic
- Integration tests (Playwright if feasible)
- Bug fixes from QA findings
- Final manifest review

**Depends on**: Phase 3 (features complete)
**Approval gate**: QA report clean, no critical or high findings

---

## 6. User Decisions (Resolved 2026-05-20)

1. **UI interaction model**: **Popup + Context Menu**
   - Popup for settings and quick text input
   - Context menu for right-click actions on selected text
   - No content script buttons or side panel for v1

2. **Scope for v1**: **Option B -- Start minimal**
   - v1: Grammar/spelling correction + Translation
   - v2+: Writing style suggestions, sentence reformulation, default language mode

3. **Output format**: **Overlay with accept/reject**
   - Show corrected/translated text in an overlay
   - User explicitly accepts or rejects the result

4. **Translation UX**: **Auto-detect with manual override**
   - Auto-detect source language by default
   - Allow user to override the detected language
   - Once overridden, the override persists (sticky selection)

---

## 7. Assumptions

- This is a private-use extension (not for Chrome Web Store publication)
- Ollama runs locally on `localhost:11434`
- The user's machine (M4 Pro, 48GB) can handle the selected model comfortably
- English, German, and Romanian are the only supported languages for v1
- No user accounts, no cloud sync, no telemetry
- The extension operates on text fields and selected text on any webpage

---

## 8. Next Steps

1. User answers open questions (Section 6)
2. Orchestrator dispatches ollama-llm-agent for model evaluation (Phase 0)
3. User approves model choice
4. Orchestrator dispatches chrome-extension-architect for architecture (Phase 1)
5. User approves architecture
6. Development begins (Phases 2-3)
7. QA and security review (Phase 4)
