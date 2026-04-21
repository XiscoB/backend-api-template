# Agentic System Architecture

> This document is descriptive, not normative. Binding authority is defined exclusively in AGENT_LAW.md.
> Internal architecture documentation for the repository-embedded agent governance system.
> This document describes the system as it exists. It does not propose changes.

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [System Overview](#2-system-overview)
3. [Directory and File Roles](#3-directory-and-file-roles)
4. [Authority Hierarchy and Precedence](#4-authority-hierarchy-and-precedence)
5. [Agent Execution Flow](#5-agent-execution-flow)
6. [Context Loading and Constraint Model](#6-context-loading-and-constraint-model)
7. [Design Principles](#7-design-principles)
8. [Non-Goals](#8-non-goals)
9. [Reuse Guidelines](#9-reuse-guidelines)

---

## 1. Purpose

This repository contains a structured governance system for AI coding agents (GitHub Copilot, Google Jules/Antigravity, and similar tools). The system constrains agent behavior through a layered documentation hierarchy that agents are required to read and obey before performing any work.

The core problem it solves: AI agents operating on a codebase without constraints tend to make unchecked assumptions, silently expand scope, introduce type-safety regressions, and generate code that conflicts with existing architectural decisions. This system prevents those failure modes by embedding machine-readable rules directly into the repository.

The system does not require any runtime infrastructure. It operates entirely through convention: files placed at known paths, using known formats, that agent platforms are configured to read.

---

## 2. System Overview

The agentic system consists of three functional layers:

| Layer                | Purpose                                                                        | Key Files                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entry points**     | Platform-specific bootstrap that directs agents to the documentation hierarchy | `.antigravity/system_prompt.md`, `.antigravity/manifest.json`, `.github/copilot-instructions.md`, `.github/.julesrules`, `agents.md` (root) |
| **Governance core**  | Behavioral law and documentation routing                                       | `.github/agents/AGENT_LAW.md`, `.github/agents/agents.md`                                                                                   |
| **Domain knowledge** | Task-specific contracts, invariants, and patterns                              | `.github/agents/auth.md`, `database.md`, `api.md`, `infrastructure.md`, `gdpr.md`, `testing.md`, `.github/agents/canonical/*`               |

Agents enter through platform-specific entry points, are directed to the governance core, and then load domain knowledge based on the task at hand.

---

## 3. Directory and File Roles

### 3.1 Entry Points

These files exist because different agent platforms discover instructions at different paths. They all converge on the same governance hierarchy.

#### `.antigravity/system_prompt.md`

- **Platform**: Google Antigravity / Jules
- **Role**: System prompt injected at session start. Establishes the agent's persona ("Senior Architect Agent"), declares the documentation loading rule, and enumerates hard constraints (ESLint doctrine, type safety, etc.).
- **Behavioral authority**: None. The file explicitly states: _"Behavioral rules are defined in AGENT_LAW.md (Tier 0). This file does not define agent behavior."_
- **Key function**: Directs the agent to read `.github/agents/agents.md` before any task, and to load domain-specific sub-agent files based on the task type.

#### `.antigravity/manifest.json`

- **Platform**: Google Antigravity / Jules
- **Role**: Machine-readable configuration declaring where the system prompt and documentation live, and that context loading is dynamic (not all-at-once).
- **Contents**:
  - `systemPromptPath`: `.antigravity/system_prompt.md`
  - `docsPath`: `.github/agents`
  - `contextStrategy`: `"dynamic"` — agents load topic files on demand, not the entire documentation set.

#### `.github/copilot-instructions.md`

- **Platform**: GitHub Copilot (VS Code, JetBrains, CLI)
- **Role**: Copilot's custom instructions file. Directs Copilot to follow the Agent Operating Contract in `.github/agents/agents.md` and to obey the ESLint/type-safety canonical documents.
- **Behavioral authority**: None. Same delegation pattern as the Antigravity entry point.

#### `.github/.julesrules`

- **Platform**: Google Jules
- **Role**: A lightweight rules file specifying forbidden actions (do not delete core files without permission, do not commit secrets) and requiring agents to read `agents.md` before planning any PR.
- **Behavioral authority**: None. Delegates to `AGENT_LAW.md`.

#### `agents.md` (repository root)

- **Platform**: Any (human or agent). Serves as a human-friendly signpost.
- **Role**: Points readers to `.github/agents/agents.md` (the documentation index) and `.github/agents/AGENT_LAW.md` (the behavioral authority). Includes a directory layout overview and a quick-navigation table mapping tasks to file combinations.
- **Behavioral authority**: None.

### 3.2 Governance Core

#### `.github/agents/AGENT_LAW.md` — Tier 0 (Behavioral Authority)

This is the single file with **law semantics** in the repository. It is the only file that defines binding behavioral obligations for agents. All other files either delegate to it or define domain knowledge that agents must treat as facts, not as behavioral instructions.

Contents (by section):

| Section | Title                    | Purpose                                                                                                        |
| ------- | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| §0      | Precedence               | Defines the three-tier authority hierarchy (see [Section 4](#4-authority-hierarchy-and-precedence))            |
| §1      | Task Classification      | Requires agents to classify every task (Production / Test / Infrastructure / Documentation) before starting    |
| §2      | Scope Management         | Defines scope boundaries, prohibits silent scope expansion, requires reclassification for scope changes        |
| §3      | Behavioral Obligations   | Mandates assumption surfacing, confusion stop rules, pushback obligation, simplicity enforcement               |
| §4      | Stop Rules               | Seven enumerated conditions (S1–S7) where the agent must halt and ask rather than proceed                      |
| §5      | Verification Obligations | Requires change summaries, verification accountability, task-class-specific checks, lint/type-safety adherence |
| §6      | Failure Modes            | Enumerates explicitly prohibited behaviors (guessing, silent assumption, scope creep, etc.)                    |
| §7      | Loading Protocol         | Mandatory file loading order: Tier 0 → `agents.md` → relevant Tier 1 files                                     |
| §8      | Amendment Rules          | Only human maintainers may modify this file; agents may propose changes only when asked                        |

#### `.github/agents/agents.md` — Tier 1 (Documentation Router)

This file is the navigation index. It does not contain behavioral rules. It contains:

- A topic table mapping domains (Auth, Database, API, Infrastructure, GDPR, Testing) to their respective files.
- A multi-topic task loading matrix showing which files to load for compound tasks (e.g., "new domain feature" → `api.md` + `database.md` + `gdpr.md`).
- A repository overview describing the project as a reusable NestJS backend template.
- A supporting documentation table pointing to `docs/` content, ADRs, and GDPR docs.

### 3.3 Domain Knowledge Files (Tier 1)

Each file under `.github/agents/` covers a specific domain. They all share a common structural pattern:

1. A scope declaration stating what the file covers.
2. A parent reference back to `agents.md`.
3. An explicit disclaimer: _"Agent behavior and process rules are defined exclusively in AGENT_LAW.md."_
4. Domain-specific contracts, invariants, patterns, and anti-patterns.

| File                | Domain                         | Key Contents                                                                                                                                                  |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.md`           | Authentication & Authorization | JWT contract, identity model, canonical roles (USER/ENTITY/ADMIN/SYSTEM), architectural boundaries (what the backend does NOT do), environment variables      |
| `database.md`       | Database & Schema              | Prisma 7 configuration, identity-first pattern, schema change governance, completeness invariants for DB changes, dead schema removal policy                  |
| `api.md`            | API Development                | Repository structure, versioning rules, controller/service/DTO conventions, security defaults, complete authoritative API surface (every endpoint documented) |
| `infrastructure.md` | Infrastructure                 | Tech stack declaration, infrastructure component guidelines (Redis, Cron, Email, Queue), environment-first design, provider neutrality, anti-patterns         |
| `gdpr.md`           | GDPR & Data Governance         | GDPR classification rules, deletion lifecycle (two-phase model), identity flags, audit logging requirements, export localization, completeness invariants     |
| `testing.md`        | Testing                        | E2E test structure, authentication setup pattern, JWT test utilities, test app setup pattern, scenario testing framework, infrastructure testing constraints  |

### 3.4 Canonical Policy Files (Tier 1)

Located in `.github/agents/canonical/`, these three documents govern code generation quality:

| File                      | Purpose                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LINT_FIX_POLICY.md`      | Decision matrix for when to fix vs. ratchet (exempt) lint violations. Defines the "Boy Scout Rule with Safety," the ratcheting mechanism, and agent-specific directives.   |
| `TYPE_SAFETY_PATTERNS.md` | The only acceptable patterns for resolving `@typescript-eslint/no-unsafe-*` violations. Covers NestJS boundaries, external data, libraries with bad types, and test mocks. |
| `AGENT_CODEGEN_RULES.md`  | Four cardinal rules agents must follow before generating code: no `any`, guard boundaries, strict testing, zero technical debt. Includes a DO/DO NOT table.                |

### 3.5 Skills Directory

`.github/skills/` contains only a `README.md` stating that the folder exists for tool discovery. The system prompt references skills defined here, but the directory currently contains no skill definitions beyond the README. This is noted as-is.

---

## 4. Authority Hierarchy and Precedence

The system defines a strict three-tier authority model in `AGENT_LAW.md` §0:

```
Tier 0  →  Tier 1  →  Tier 2
(law)      (domain)    (reference)
```

### Tier 0 — Agent Behavioral Law

- **File**: `AGENT_LAW.md`
- **Binding**: Yes, unconditionally.
- **Scope**: Defines how agents must behave: classification, scope management, stop rules, verification, failure modes.
- **Override**: Nothing overrides Tier 0.

### Tier 1 — Task-Scoped Agent Knowledge

- **Files**: All `.github/agents/*.md` domain files, `.github/agents/canonical/*.md` policy files.
- **Binding**: Yes, when the task touches that domain.
- **Scope**: Defines domain contracts, invariants, system guarantees (API contracts, data models, security boundaries, GDPR constraints, testing expectations).
- **Constraints on Tier 1**: Tier-1 documents MUST NOT define agent workflow, behavioral obligations, enforcement semantics, stop conditions, or verification requirements. Those are exclusively Tier 0 territory.
- **Internal precedence**: Within Tier 1, more-specific files override less-specific files (e.g., `auth.md` overrides `agents.md` on auth-specific behavior).

### Tier 2 — Human Documentation

- **Files**: Everything else — `docs/`, `.personal/`, other `*.md` files.
- **Binding**: No, unless the human explicitly instructs the agent to follow it.
- **Purpose**: Context and reference only.

### Explicit Ignore Rule

The following paths are non-authoritative and must be ignored by agents unless explicitly instructed:

- `docs/**`
- `.personal/**`
- Any file whose name starts with `IGNORE_*`

### Conflict Resolution

- Tier 0 overrides Tier 1. Tier 1 overrides Tier 2.
- If Tier 1 contradicts Tier 0, Tier 0 wins and the agent must flag the contradiction.
- If documentation contradicts intuition, documentation wins (stated in both `system_prompt.md` and `AGENT_LAW.md`).

---

## 5. Agent Execution Flow

The following describes the prescribed sequence of operations when an agent begins work in this repository, from session start to task completion.

### Phase 1: Bootstrap (Loading Protocol)

The loading protocol is defined in `AGENT_LAW.md` §7 and is mandatory. Skipping Tier 0 is a contract violation.

```
1. Read AGENT_LAW.md                    (Tier 0 — behavioral law)
2. Read .github/agents/agents.md        (Tier 1 — documentation router)
3. Load relevant Tier 1 topic file(s)   (based on task domain)
4. Do NOT preload Tier 2 docs           (unless task explicitly requires them)
```

How agents discover step 1 depends on the platform:

- **Copilot**: Reads `.github/copilot-instructions.md` → directed to `agents.md` → discovers `AGENT_LAW.md`.
- **Jules/Antigravity**: Reads `.antigravity/system_prompt.md` (via `manifest.json`) → directed to `agents.md` → discovers `AGENT_LAW.md`.
- **Any agent**: The root `agents.md` file also points directly to both files.

### Phase 2: Task Classification

Before any implementation, the agent must classify the task (`AGENT_LAW.md` §1):

```
TASK CLASSIFICATION: [Production | Test | Infrastructure | Documentation]
SCOPE: [list of files/modules expected to be touched]
```

Classification determines:

- Risk level (High / Medium / Low)
- Verification requirements (§5.3)
- Whether infrastructure risk escalation applies

If classification is unclear, the agent must ask, not guess.

### Phase 3: Assumption Surfacing

Before implementing any non-trivial change, the agent must state assumptions explicitly (`AGENT_LAW.md` §3.1):

```
ASSUMPTIONS:
- [assumption]
- [assumption]
→ Correct me now or I proceed with these.
```

### Phase 4: Implementation

During implementation, the agent operates under the constraints of its declared scope (§2) and must respect all stop rules (§4). Seven conditions require the agent to halt and ask:

| Rule | Trigger                                                         |
| ---- | --------------------------------------------------------------- |
| S1   | Task requires changing an architectural boundary                |
| S2   | Declared scope is insufficient                                  |
| S3   | Multiple plausible implementations with different tradeoffs     |
| S4   | Change affects a boot-critical path                             |
| S5   | Unsure whether a file/symbol is still in use                    |
| S6   | Conflicting documentation found                                 |
| S7   | Stalled for more than 2 failed attempts at the same sub-problem |

Code generation must comply with the canonical policy files (`LINT_FIX_POLICY.md`, `TYPE_SAFETY_PATTERNS.md`, `AGENT_CODEGEN_RULES.md`).

### Phase 5: Verification

After completing any task, the agent must provide (`AGENT_LAW.md` §5):

1. **Change summary** — structured list of what changed, what was intentionally not touched, and concerns.
2. **Verification accountability** — explicit statement of what verification was performed, or acknowledgment that it was skipped and what the human should verify.
3. **Task-class-specific verification** — e.g., for Production: TypeScript compiles, existing tests pass, no new `any` types introduced.

### Flow Diagram

```
Platform Entry Point
        │
        ▼
  AGENT_LAW.md (Tier 0)
        │
        ▼
  agents.md (Router)
        │
        ▼
  Domain File(s) (Tier 1)
        │
        ▼
  Task Classification
        │
        ▼
  Assumption Surfacing
        │
        ▼
  Implementation (with Stop Rules)
        │
        ▼
  Verification & Change Summary
```

---

## 6. Context Loading and Constraint Model

### Dynamic Context Strategy

The `manifest.json` declares `contextStrategy: "dynamic"`. This means agents do not load the entire documentation set at session start. Instead:

1. The agent loads the governance core (Tier 0 + router).
2. Based on the task, the agent loads only the relevant domain files.
3. The multi-topic task loading matrix in `agents.md` prescribes which files to load for common task types.

This is a deliberate design choice. Loading all domain files would consume context window budget unnecessarily for tasks that only touch one domain.

### Constraint Propagation

Constraints are applied through layered composition:

- **Behavioral constraints** (how the agent works) come from `AGENT_LAW.md` and apply to all tasks.
- **Domain constraints** (what the system requires) come from the relevant domain file and apply only when that domain is in scope.
- **Code generation constraints** (how code must be written) come from the canonical policy files and apply to all code-producing tasks.

There is no runtime enforcement. The system relies on the agent reading and obeying these files. If an agent platform ignores custom instructions, the system has no fallback mechanism. This is an implicit limitation.

### What Agents Are NOT Told

The system is deliberately silent on:

- How to handle multi-agent collaboration (no coordination protocol between agents).
- How to persist state across sessions (each session starts fresh from the loading protocol).
- How to handle partial reads if the context window is too small for all required files.

These are implicit gaps, not designed features.

---

## 7. Design Principles

The following principles are observable from the system's structure and documented rules. They are not stated in a single location but emerge from the collective documentation.

### 7.1 Documentation as Law

The system treats certain documentation files as having legal force over agent behavior. This is not a metaphor. `AGENT_LAW.md` uses explicit legal language ("binding," "unconditionally," "contract violation") and defines amendment rules restricting who may change the file.

### 7.2 Separation of Behavior from Knowledge

Behavioral rules (how agents work) are strictly separated from domain knowledge (what the system requires). This is enforced through:

- Tier 0 / Tier 1 separation
- Explicit disclaimers in every domain file: _"Agent behavior is defined exclusively in AGENT_LAW.md."_
- Explicit constraints on what Tier-1 files may and may not define.

### 7.3 Explicit Over Implicit

The system repeatedly favors explicit declaration:

- Agents must classify tasks explicitly before starting.
- Agents must state assumptions explicitly.
- Agents must declare scope explicitly.
- Unclassified GDPR tables are treated as incomplete changes.
- Verification status must be stated, not omitted.

### 7.4 Conservative by Default

The system's default posture is restrictive:

- Agents must not expand scope without reclassification.
- Agents must not refactor, modernize, or improve unless instructed.
- Agents must not delete code they don't fully understand.
- The "simplicity enforcement" rule requires agents to verify that a simpler solution doesn't exist.

### 7.5 Platform Convergence

Multiple entry points (Copilot, Jules, Antigravity) all converge on the same governance hierarchy. The system is designed to produce consistent agent behavior regardless of which platform is used.

### 7.6 Fail-Stop Over Fail-Continue

Seven stop rules require agents to halt rather than guess. The confusion stop rule (§3.2) explicitly prohibits picking an interpretation "because it seems right." The system treats silent failure as worse than visible failure.

---

## 8. Non-Goals

The following are explicitly not goals of this system, based on what the documentation omits or prohibits:

- **Runtime enforcement**: The system has no runtime component. It does not validate that agents actually obeyed the rules. Enforcement is entirely trust-based.
- **Multi-agent coordination**: There is no protocol for multiple agents working on the same repository simultaneously. Each agent session is independent.
- **Session persistence**: Agent state does not carry across sessions. The loading protocol runs from scratch each time.
- **Automated testing of agent compliance**: There are no tests that verify agents followed the governance rules. Compliance is verified through change summaries and human review.
- **UI or dashboard**: There is no interface for monitoring agent behavior. All governance is textual.
- **Prescriptive tooling**: The `skills/` directory exists for tool discovery but currently contains no skill definitions. The system does not prescribe specific tool integrations.
- **Agent training or fine-tuning**: The system operates through prompt engineering (system prompts, custom instructions), not model training.

---

## 9. Reuse Guidelines

This section describes how to adapt this agentic governance system for use in a different repository.

### 9.1 What to Copy

The minimum viable set of files to replicate the system:

```
.github/
├── agents/
│   ├── AGENT_LAW.md          # Copy and adapt
│   ├── agents.md             # Copy and rewrite topic table
│   └── canonical/
│       ├── LINT_FIX_POLICY.md        # Copy if using ESLint/TypeScript
│       ├── TYPE_SAFETY_PATTERNS.md   # Copy if using TypeScript
│       └── AGENT_CODEGEN_RULES.md    # Copy if using TypeScript
├── copilot-instructions.md   # Copy and adapt for Copilot
└── .julesrules               # Copy and adapt for Jules

.antigravity/                 # Copy if using Google Antigravity
├── manifest.json
└── system_prompt.md

agents.md                     # Copy to repository root as a signpost
```

### 9.2 What to Customize

#### AGENT_LAW.md

The behavioral law is largely project-agnostic. The following sections will need project-specific tailoring:

- **§1 Task Classification**: The task classes (Production, Test, Infrastructure, Documentation) and their risk levels may need adjustment. A frontend-only project, for instance, might not distinguish Infrastructure from Production.
- **§4 Stop Rules**: Boot-critical path definitions (S4) are project-specific. Enumerate your project's initialization-sensitive paths.
- **§5.3 Verification by Task Class**: The specific checks (e.g., "TypeScript compiles") depend on your tech stack.
- **§5.4 Lint and Type Safety**: Replace the canonical document names with your project's equivalents, or remove this section if not applicable.

The following sections are portable without modification:

- §0 Precedence (the tier model is universal)
- §2 Scope Management
- §3 Behavioral Obligations
- §6 Failure Modes
- §7 Loading Protocol (the three-step load sequence works for any project)
- §8 Amendment Rules

#### agents.md (Router)

Rewrite the topic table entirely. Replace auth/database/API/infrastructure/GDPR/testing with your project's domains. Keep the multi-topic task loading matrix pattern — it is valuable for compound tasks.

#### Domain Files

These are entirely project-specific. Write new domain files that document your project's contracts and invariants. Follow the structural pattern used in this repository:

1. Scope declaration
2. Parent reference
3. Behavioral delegation disclaimer
4. Domain contracts and invariants

#### Canonical Policy Files

If your project uses TypeScript and ESLint, the canonical files can be adapted. If your project uses a different language or linter, replace them with equivalent documents that define your code generation constraints.

The structural principle to preserve: **agents need explicit, searchable rules for how to handle common code quality decisions**. Without these, agents will invent their own strategies, which is what this system is designed to prevent.

#### Entry Points

Each entry point is platform-specific. Copy only the ones relevant to your agent platforms:

- `.github/copilot-instructions.md` — required for GitHub Copilot
- `.antigravity/` — required for Google Antigravity/Jules
- `.github/.julesrules` — required for Google Jules

All entry points should follow the same pattern: declare that they do not define behavior, and redirect to `AGENT_LAW.md` via `agents.md`.

### 9.3 What NOT to Copy

- **Domain files verbatim**: The auth, database, API, infrastructure, GDPR, and testing files are specific to this NestJS backend template. They document this project's contracts. Do not copy them into an unrelated project.
- **The `docs/` directory**: This is Tier 2 content specific to this project.
- **The `skills/` directory**: Currently empty in function. Only copy if you intend to define agent skills for your project.

### 9.4 Structural Invariants to Preserve

When adapting the system, preserve these structural properties:

1. **Single behavioral authority**: Exactly one file has law semantics. Do not split behavioral rules across multiple files.
2. **Explicit tier separation**: Every file should be classifiable as Tier 0, Tier 1, or Tier 2. Do not create ambiguous authority.
3. **Behavioral delegation**: Non-Tier-0 files must explicitly disclaim behavioral authority and point to the law file.
4. **Dynamic context loading**: Do not require agents to load all documentation at once. The router pattern (index → relevant topic files) preserves context window budget.
5. **Platform convergence**: All entry points must lead to the same governance hierarchy. Do not create platform-specific behavioral branches.
6. **Mandatory loading order**: The sequence Tier 0 → Router → Domain Files must be preserved. Agents that skip Tier 0 operate without constraints.

### 9.5 Known Limitations to Be Aware Of

When reusing this system, understand these limitations:

- **No enforcement mechanism**: If an agent platform ignores custom instruction files, the system has no effect. It depends entirely on the platform reading and honoring the files.
- **Context window pressure**: Large domain files consume context budget. If your project has many domains, consider whether all relevant files can fit in the agent's context window simultaneously.
- **No cross-session memory**: Each agent session starts from scratch. There is no mechanism for an agent to remember that it already read `AGENT_LAW.md` in a previous session.
- **Single-agent assumption**: The system does not account for multiple agents operating concurrently on the same codebase. Concurrent agents could make conflicting scope declarations.
- **Trust-based compliance**: The system cannot verify that an agent actually followed the rules. Compliance is observable only through the agent's outputs (change summaries, assumption declarations, etc.).

---

## Appendix A: Complete File Inventory

| Path                                               | Tier        | Platform    | Role                                                 |
| -------------------------------------------------- | ----------- | ----------- | ---------------------------------------------------- |
| `.antigravity/manifest.json`                       | Entry point | Antigravity | System configuration                                 |
| `.antigravity/system_prompt.md`                    | Entry point | Antigravity | Session bootstrap prompt                             |
| `.github/.julesrules`                              | Entry point | Jules       | Forbidden actions and documentation directive        |
| `.github/copilot-instructions.md`                  | Entry point | Copilot     | Custom instructions                                  |
| `agents.md` (root)                                 | Entry point | Any         | Human-readable signpost                              |
| `.github/agents/AGENT_LAW.md`                      | Tier 0      | All         | Behavioral authority                                 |
| `.github/agents/agents.md`                         | Tier 1      | All         | Documentation router / index                         |
| `.github/agents/auth.md`                           | Tier 1      | All         | Authentication & authorization contracts             |
| `.github/agents/database.md`                       | Tier 1      | All         | Prisma, schema, migration contracts                  |
| `.github/agents/api.md`                            | Tier 1      | All         | API surface, endpoints, versioning contracts         |
| `.github/agents/infrastructure.md`                 | Tier 1      | All         | Redis, Email, Queue, Cron contracts                  |
| `.github/agents/gdpr.md`                           | Tier 1      | All         | GDPR classification, deletion lifecycle contracts    |
| `.github/agents/testing.md`                        | Tier 1      | All         | Test patterns, E2E setup, scenario testing contracts |
| `.github/agents/canonical/LINT_FIX_POLICY.md`      | Tier 1      | All         | Lint violation decision matrix                       |
| `.github/agents/canonical/TYPE_SAFETY_PATTERNS.md` | Tier 1      | All         | Approved type safety patterns                        |
| `.github/agents/canonical/AGENT_CODEGEN_RULES.md`  | Tier 1      | All         | Code generation invariant rules                      |
| `.github/skills/README.md`                         | Tier 1      | All         | Skills directory placeholder                         |

---

## Appendix B: Cross-Reference of Behavioral Rules

The following lists where specific behavioral obligations are defined, to aid navigation.

| Obligation                                 | Defined In                | Section            |
| ------------------------------------------ | ------------------------- | ------------------ |
| Task classification required before work   | `AGENT_LAW.md`            | §1                 |
| Scope boundary enforcement                 | `AGENT_LAW.md`            | §2                 |
| Scope expansion requires reclassification  | `AGENT_LAW.md`            | §2.3               |
| Assumptions must be stated explicitly      | `AGENT_LAW.md`            | §3.1               |
| Confusion requires stop and ask            | `AGENT_LAW.md`            | §3.2               |
| Pushback obligation on bad requests        | `AGENT_LAW.md`            | §3.3               |
| Simplicity verification                    | `AGENT_LAW.md`            | §3.4               |
| Seven stop rules (S1–S7)                   | `AGENT_LAW.md`            | §4                 |
| Change summary required                    | `AGENT_LAW.md`            | §5.1               |
| Verification accountability                | `AGENT_LAW.md`            | §5.2               |
| Task-class verification matrix             | `AGENT_LAW.md`            | §5.3               |
| ESLint ratcheting principle                | `AGENT_LAW.md`            | §5.5               |
| No `any`, no `eslint-disable` in new code  | `AGENT_CODEGEN_RULES.md`  | Cardinal Rules     |
| Lint fix vs. ratchet decision              | `LINT_FIX_POLICY.md`      | Decision Matrix    |
| Type narrowing patterns                    | `TYPE_SAFETY_PATTERNS.md` | All sections       |
| Documentation loading order                | `AGENT_LAW.md`            | §7                 |
| Amendment restrictions                     | `AGENT_LAW.md`            | §8                 |
| Schema.prisma requires reading database.md | `system_prompt.md`        | Strict Constraints |
| New endpoints require E2E tests            | `system_prompt.md`        | Strict Constraints |
