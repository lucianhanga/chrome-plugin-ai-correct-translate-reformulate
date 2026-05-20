# Dispatch Plan -- Correct, Reformulate & Translate Chrome Extension

**Date**: 2026-05-20
**Status**: IN PROGRESS -- Phase 0 (Model Evaluation)
**Risk Level**: Medium (new project, multiple agents, LLM integration)

---

## Dispatch Summary

- **User goal**: Build a Chrome extension for grammar correction, style improvement, sentence reformulation, and translation (EN/DE/RO) powered by local Ollama
- **Product intent**: Private-use productivity tool for multilingual text editing
- **Task type**: New Feature (greenfield project)
- **Risk level**: Medium
- **Agents needed**: ollama-llm-agent, chrome-extension-architect, chrome-extension-developer, chrome-extension-qa-tester
- **Execution mode**: Sequential with approval gates between phases
- **Clarifications needed**: UI interaction model, scope for v1, output format, translation UX (see meeting notes)
- **Approval needed**: Model selection, architecture design, before each implementation phase

---

## Agent Assignments

### Assignment 1: ollama-llm-agent -- Model Evaluation and Prompt Engineering

**Why this agent**: Specialist in Ollama model selection, benchmarking, prompt design, and integration patterns. Must evaluate whether the user's suggested model is optimal for multilingual text tasks.

**Task prompt**:
```
Agent: ollama-llm-agent

Goal:
Evaluate and recommend the best Ollama model for a Chrome extension that performs
grammar correction, writing style improvement, sentence reformulation, and
translation across English, German, and Romanian.

Context:
- User's hardware: Apple M4 Pro, 48 GB unified memory, macOS
- Ollama version: 0.23.0
- User's suggested model: qwen3.6:35b-a3b (23 GB, already installed)
- User's suggested parameters: temperature 0.2, top_p 0.8, num_ctx 16384
- Models already installed: qwen3.6:35b-a3b, qwen3:8b, qwen3:14b, qwen3-coder:30b, gemma3:27b
- The extension will call Ollama via the OpenAI-compatible API from a Chrome extension service worker
- All processing is local, private, no cloud

Scope:
1. Evaluate qwen3.6:35b-a3b for these specific tasks:
   - Grammar and spelling correction in EN, DE, RO
   - Writing style improvement in EN, DE, RO
   - Sentence reformulation in EN, DE, RO
   - Translation between EN<->DE, EN<->RO, DE<->RO
   - Combined mode: translate to default language then correct/improve
2. Compare against qwen3:8b, qwen3:14b, and any other models worth considering
3. Evaluate the suggested parameters (temperature 0.2, top_p 0.8, num_ctx 16384)
4. Design optimized prompts for each task type
5. Recommend the integration pattern (OpenAI-compatible API vs native API, streaming vs non-streaming)
6. Provide sample API call code (fetch-based, for use in a Chrome extension service worker)

Constraints:
- Must work on Apple M4 Pro with 48 GB unified memory
- Must handle all three languages well (EN, DE, RO)
- Latency should be acceptable for interactive use (ideally under 5 seconds for short text)
- Output must be clean corrected/translated text, not explanations
- Romanian language quality is a specific concern -- test it

Do not:
- Install new models without user approval
- Change Ollama configuration
- Start implementing the Chrome extension
- Make a final model decision without presenting options to the user

Expected output:
1. Model comparison table (quality, speed, memory, language support)
2. Recommended model with justification
3. Recommended parameters with justification
4. Optimized prompt templates for each task type
5. Sample integration code (fetch to OpenAI-compatible API)
6. Benchmark results if feasible (test prompts in EN, DE, RO)
7. Fallback model recommendation (smaller/faster)
8. Risks and limitations

Approval required before:
- Finalizing model choice (present options to user first)
- Pulling any new models

Definition of done:
- Model recommendation is backed by evidence or testing
- Prompts produce clean output for all task types in all three languages
- Integration code pattern is ready for the developer agent
- User has approved the model choice
```

**Approval gate**: User must approve model selection before proceeding.

---

### Assignment 2: chrome-extension-architect -- Architecture Design

**Why this agent**: Specialist in Manifest V3 architecture, permissions, security, message flow, and extension design patterns. Produces the blueprint that the developer agent follows.

**Task prompt**:
```
Agent: chrome-extension-architect

Goal:
Design the complete architecture for a Chrome extension that corrects grammar,
improves writing style, reformulates sentences, and translates text between
English, German, and Romanian, powered by a local Ollama LLM.

Context:
- This is a private-use Manifest V3 Chrome extension
- Powered by local Ollama (localhost:11434) via OpenAI-compatible API
- Target languages: English, German, Romanian
- User's hardware: Apple M4 Pro, 48 GB, macOS
- Stack: TypeScript, Vite, React, Tailwind CSS, pnpm
- Model and prompt details will come from the ollama-llm-agent's output (provided as input)
- UI approach: [TO BE FILLED AFTER USER ANSWERS -- likely popup + context menu + content script]

Scope:
1. Complete architecture document
2. Manifest V3 design with permission justification table
3. File and folder structure
4. Data flow diagram (Mermaid)
5. Message flow diagram (Mermaid) -- content script <-> service worker <-> Ollama
6. Typed message contract definitions
7. Storage model (settings, preferences)
8. UI component breakdown (popup, context menu items, content script overlay)
9. Threat model
10. Security checklist
11. Implementation phases with developer checklists
12. Testing strategy

Constraints:
- Manifest V3 only
- Minimal permissions (storage, activeTab, contextMenus, localhost host permission)
- No <all_urls>
- No remote code
- No eval or unsafe-inline
- Service worker handles all Ollama API calls
- Content scripts do not call external APIs
- All message payloads must be typed and validated

Do not:
- Write implementation code (architecture only)
- Add unnecessary permissions
- Design for Chrome Web Store submission (private use)
- Over-engineer -- this is a focused utility extension

Expected output:
1. Architecture document (written to docs/architecture.md)
2. Manifest V3 draft
3. Permission justification table
4. Data flow diagram (Mermaid)
5. Message flow diagram (Mermaid)
6. Typed message contract interfaces
7. File/folder structure
8. Threat model summary
9. Security checklist
10. Implementation phase checklists
11. Testing strategy

Approval required before:
- Architecture is finalized (user must approve before development starts)

Definition of done:
- Architecture covers all features
- Permissions are minimal and justified
- Message contracts are typed
- Security is addressed
- Developer has a clear implementation checklist
- User approves the architecture
```

**Approval gate**: User must approve architecture before development starts.

---

### Assignment 3: chrome-extension-developer -- Foundation Implementation

**Why this agent**: Implementation specialist for Chrome extensions. Builds the project scaffold and core infrastructure.

**Task prompt**:
```
Agent: chrome-extension-developer

Goal:
Implement the foundation of the Chrome extension based on the approved architecture.

Context:
- Architecture document: docs/architecture.md (produced by architect agent)
- Ollama integration pattern: from ollama-llm-agent output
- Stack: TypeScript, Vite, React, Tailwind CSS, pnpm, Vitest
- Project root: /Users/lucianhanga/lgit/chrome.correct.and.reformulate.plugin/

Scope:
Phase 2A -- Project scaffold:
- Initialize pnpm project
- Configure Vite for Chrome extension
- Configure TypeScript (strict mode)
- Configure Tailwind CSS
- Set up ESLint
- Create manifest.json per architecture spec

Phase 2B -- Core infrastructure:
- Service worker with Ollama API client
- Typed messaging layer (shared/messaging.ts)
- Storage abstraction (shared/storage.ts)
- Error handling utilities

Phase 2C -- Basic UI:
- Popup with settings (default language selector, Ollama endpoint config)
- Context menu registration (correct, reformulate, translate submenu)

Constraints:
- Follow the architecture document exactly
- Do not add permissions beyond what architecture specifies
- Do not add dependencies without justification
- Use pnpm as package manager
- TypeScript strict mode
- No emoticons in code or docs
- Green (#22c55e) for success, red (#ef4444) for failure, yellow (#eab308) for warnings

Do not:
- Deviate from the approved architecture
- Add features not in scope for this phase
- Add broad permissions
- Skip TypeScript strict mode
- Add unnecessary dependencies

Expected output:
- Working project that builds with pnpm build
- Extension loads in Chrome (chrome://extensions, developer mode)
- Service worker starts and can reach Ollama
- Popup renders with settings UI
- Context menu items appear
- TypeScript compiles without errors
- ESLint passes

Approval required before:
- Adding any npm dependency not in the architecture
- Changing permissions from the architecture spec

Definition of done:
- pnpm build succeeds
- Extension loads in Chrome
- Service worker connects to Ollama
- Popup renders
- Context menu items registered
- TypeScript strict, no errors
- ESLint clean
```

**Approval gate**: Extension loads and connects to Ollama before proceeding to features.

---

### Assignment 4: chrome-extension-developer -- Feature Implementation

**Why this agent**: Same developer agent, second pass for feature work.

**Task prompt**:
```
Agent: chrome-extension-developer

Goal:
Implement all text processing features on top of the foundation.

Context:
- Foundation from Phase 2 is working
- Prompts from ollama-llm-agent output
- Architecture from docs/architecture.md

Scope:
Phase 3A -- Text processing features:
- Grammar and spelling correction
- Writing style suggestions
- Sentence reformulation
- Translation (EN, DE, RO -- all direction pairs)
- Default language mode (translate + correct in one flow)

Phase 3B -- Content script and UX:
- Content script: detect selected text, inject results
- Context menu handlers wired to service worker
- Result display (overlay or inline replacement per architecture)
- Loading indicators
- Error states (Ollama down, model not loaded, empty input)

Phase 3C -- Settings and persistence:
- Default language persistence
- Ollama endpoint persistence
- User preferences

Constraints:
- Follow architecture document
- Use prompts from ollama-llm-agent
- Handle all error cases
- Show loading state during Ollama inference
- Clean output only (no LLM explanations in results)

Do not:
- Change the manifest permissions
- Modify the messaging contract types without updating all consumers
- Skip error handling
- Hardcode the Ollama endpoint (must be configurable)

Expected output:
- All five features working end-to-end
- Context menu triggers work on selected text
- Results displayed to user
- Settings persist across sessions
- Error states handled gracefully

Approval required before:
- Changing message contracts
- Adding new permissions
- Adding new dependencies

Definition of done:
- All features work in manual testing
- All three languages tested (at least manually)
- Error states visible and informative
- Settings persist
- No TypeScript errors, ESLint clean
```

**Approval gate**: All features working before QA phase.

---

### Assignment 5: chrome-extension-qa-tester -- QA and Security Review

**Why this agent**: Specialist in Chrome extension testing, debugging, and security auditing.

**Task prompt**:
```
Agent: chrome-extension-qa-tester

Goal:
Perform comprehensive QA testing and security audit of the completed extension.

Context:
- Completed extension in /Users/lucianhanga/lgit/chrome.correct.and.reformulate.plugin/
- Architecture: docs/architecture.md
- Features: grammar correction, style improvement, reformulation, translation (EN/DE/RO), default language mode
- Stack: TypeScript, Vite, React, Tailwind CSS, pnpm, Vitest
- Ollama integration via OpenAI-compatible API on localhost:11434

Scope:
1. Full QA pass per your standard checklist
2. Security audit (permissions, message validation, DOM safety, CSP, storage)
3. Manifest validation
4. Service worker lifecycle testing
5. Content script safety review
6. Run pnpm typecheck, pnpm lint, pnpm test, pnpm build
7. Test all features in all three languages
8. Test error states (Ollama down, model not loaded, empty input, very long input)
9. Test edge cases (special characters, RTL text if applicable, mixed-language text)
10. Write unit tests for shared logic (messaging, storage, prompts)
11. Produce full QA report

Constraints:
- Do not broaden permissions to fix issues
- Do not weaken TypeScript strict mode
- Do not remove existing tests
- Fix only what is broken; recommend fixes for larger issues

Do not:
- Add features
- Change architecture
- Modify prompts without consulting ollama-llm-agent
- Skip the security audit

Expected output:
1. Full QA report (per standard format)
2. Security audit findings
3. Bug list with severity
4. Unit tests added for shared logic
5. Recommended fixes for any issues found
6. Final status assessment

Approval required before:
- Any permission changes
- Any architecture changes
- Disabling any tests or lint rules

Definition of done:
- QA report complete
- No critical or high findings remaining
- Unit tests pass
- Build passes
- Security checklist satisfied
- Extension works end-to-end
```

**Approval gate**: QA report reviewed by user, no critical issues.

---

## Execution Order

```
Step 1: USER DECISIONS
        User answers open questions from meeting notes
        (UI model, scope, output format, translation UX)

Step 2: ollama-llm-agent (Assignment 1)
        Model evaluation and prompt engineering
        OUTPUT -> model recommendation, prompts, integration code
        GATE -> User approves model choice

Step 3: chrome-extension-architect (Assignment 2)
        Architecture design (uses ollama-llm-agent output as input)
        OUTPUT -> architecture document, manifest, message contracts, diagrams
        GATE -> User approves architecture

Step 4: chrome-extension-developer (Assignment 3)
        Foundation implementation (uses architecture as blueprint)
        OUTPUT -> working scaffold, loads in Chrome
        GATE -> Extension loads and connects to Ollama

Step 5: chrome-extension-developer (Assignment 4)
        Feature implementation (uses architecture + prompts)
        OUTPUT -> all features working
        GATE -> Manual testing confirms features work

Step 6: chrome-extension-qa-tester (Assignment 5)
        QA and security review
        OUTPUT -> QA report, tests, fixes
        GATE -> No critical/high findings

Step 7: DELIVERY
        Orchestrator produces final delivery summary
        User has a working, tested, secure extension
```

---

## Dependencies

```
User Decisions --> ollama-llm-agent --> chrome-extension-architect --> chrome-extension-developer (foundation)
                                                                  --> chrome-extension-developer (features)
                                                                  --> chrome-extension-qa-tester
```

- Architect depends on ollama-llm-agent output (integration pattern, model details)
- Developer depends on architect output (architecture, manifest, message contracts)
- Developer (features) depends on developer (foundation) output
- QA depends on developer (features) output
- No agents run in parallel (sequential with gates)

---

## What Needs User Approval Before Proceeding

### Immediate Decisions (before any agent is dispatched)

1. **UI interaction model** -- Which combination?
   - [ ] Popup (settings + quick text input)
   - [ ] Context menu (right-click on selected text)
   - [ ] Content script (buttons near text fields)
   - [ ] Side panel (persistent workspace)

2. **v1 scope** -- All features or start smaller?
   - [ ] All five features (correct, style, reformulate, translate, default language mode)
   - [ ] Start with correct + translate, add others later

3. **Output format** -- How to show results?
   - [ ] Replace text in-place
   - [ ] Show overlay with accept/reject
   - [ ] Show diff/comparison
   - [ ] Copy to clipboard

4. **Translation UX** -- Auto-detect source language or manual selection?

### Later Approvals (at gates)

5. **Model selection** -- After ollama-llm-agent evaluation (Step 2)
6. **Architecture** -- After architect produces design (Step 3)
7. **Dependencies** -- Any npm packages beyond the base stack
8. **QA findings** -- Accept/reject fixes for any issues found (Step 6)

---

## Risk Summary

| Phase | Key Risk | Mitigation |
|-------|----------|------------|
| Model eval | Model poor at Romanian | Test RO specifically; have fallback model |
| Model eval | Latency too high | Benchmark; consider smaller model for quick tasks |
| Architecture | Over-complex UI | Start simple; iterate based on user feedback |
| Development | Vite + MV3 plugin issues | Developer agent experienced with this stack |
| Development | Service worker lifecycle | Persist state; handle reconnection |
| QA | Insufficient test coverage | QA agent writes tests; manual testing for all languages |
| Overall | Scope creep | Orchestrator controls scope; approval gates enforce boundaries |
