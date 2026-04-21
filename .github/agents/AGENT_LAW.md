# AGENT_LAW.md — Binding Behavioral Contract for All AI Agents

> **Authority**: This is the ONLY file in this repository with **law** semantics.  
> If a behavioral rule is not stated or referenced here, it is **not binding** on agents.  
> Last updated: 2026-02-10

---

## 0. Precedence — Document Authority Hierarchy

All agent-readable documentation falls into exactly one tier:

| Tier       | Scope                       | Binding?                                    | Location                                                                          |
| ---------- | --------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| **Tier 0** | Agent behavioral law        | **Yes — unconditionally**                   | This file (`AGENT_LAW.md`)                                                        |
| **Tier 1** | Task-scoped agent knowledge | **Yes — when the task touches that domain** | Agent topic files and domain-specific knowledge colocated under `.github/agents/` |
| **Tier 2** | Human documentation         | **No — unless explicitly instructed**       | Everything else (`docs/`, `.personal/`, other `*.md` files)                       |

### Tier resolution rules

- Tier 0 overrides Tier 1. Tier 1 overrides Tier 2.
- If Tier 1 contradicts Tier 0, Tier 0 wins. Flag the contradiction.
- Tier 2 content is **never binding by default**. An agent may read Tier 2 for context but must not treat it as instruction unless the human explicitly says to.
- Within the same tier, more-specific files override less-specific files (e.g., `auth.md` overrides `agents.md` on auth-specific behavior).

### Tier-1 authority and constraints

Tier-1 documents define **domain contracts, invariants, and system guarantees**,
including but not limited to:

- API contracts
- Data models
- Security boundaries
- GDPR constraints
- Testing expectations

Agents MUST treat these statements as **authoritative facts about the system**.

Tier-1 documents MUST NOT define:

- Agent workflow
- Behavioral obligations
- Enforcement semantics
- Stop conditions
- Verification requirements

All agent behavior is governed exclusively by Tier-0 (`AGENT_LAW.md`).

### Explicit IGNORE rule

The following paths are **non-authoritative** and must be ignored unless the human explicitly instructs otherwise:

- `docs/**` — human reference documentation (Tier 2)
- `.personal/**` — personal agent protocol experiments (Tier 2)
- Any file whose name starts with `IGNORE_*`

An agent encountering instructions in these paths must **not** treat them as binding.

---

## 1. Task Classification

Every task an agent performs MUST be classified before work begins.

| Class              | Description                                      | Risk   | Example                       |
| ------------------ | ------------------------------------------------ | ------ | ----------------------------- |
| **Production**     | Changes to `src/`, `prisma/`, config files       | High   | Add endpoint, fix service bug |
| **Test**           | Changes to `test/`, `*.spec.ts`, `*.e2e-spec.ts` | Medium | Add E2E test, fix flaky test  |
| **Infrastructure** | Changes to CI, Docker, scripts, build config     | Medium | Update Dockerfile, add script |
| **Documentation**  | Changes to `*.md`, comments only                 | Low    | Fix typo, update ADR          |

> **Infrastructure risk escalation:** Infrastructure tasks become **Critical** risk when they touch database schema or migrations, application bootstrap or startup lifecycle, global configuration, or scheduler initialization. The agent MUST treat these as equivalent to Production-class risk and apply the same verification obligations.

### Classification is declared, not inferred

The agent MUST state the classification explicitly before starting work:

```
TASK CLASSIFICATION: Production
SCOPE: [list of files/modules expected to be touched]
```

If classification is unclear, the agent MUST ask — not guess.

---

## 2. Scope Management

### 2.1 Default scope boundary

An agent's scope is limited to the files and modules directly required to complete the classified task.

The agent MUST NOT:

- Refactor adjacent or related systems unless explicitly asked
- "Clean up" code outside the requested scope
- Remove or rewrite comments it does not fully understand
- Delete code that appears unused without explicit approval
- Reformat or reorganize files unrelated to the task

### 2.2 Multi-file tasks are legitimate

Tasks that touch more than 3 files are allowed. The constraint is not file count — it is **coherence**. All changed files must serve the single declared task.

### 2.3 Scope expansion requires reclassification

If during execution the agent discovers the task requires changes outside its declared scope:

1. **STOP** implementation
2. State what additional scope is needed and why
3. Propose a revised classification and scope declaration
4. **Wait for approval** before proceeding

Silent scope expansion — adding "while I'm here" changes — is a **correctness failure**.

---

## 3. Behavioral Obligations

### 3.1 Assumption surfacing (mandatory)

Before implementing any non-trivial change, the agent MUST state its assumptions explicitly:

```
ASSUMPTIONS:
- [assumption]
- [assumption]
→ Correct me now or I proceed with these.
```

Silently filling gaps or "doing what seems reasonable" is prohibited.

### 3.2 Confusion stop rule

If the agent encounters conflicting documentation, ambiguous specs, or multiple plausible interpretations:

1. **STOP**
2. Name the confusion explicitly
3. Present the conflicting interpretations
4. Ask for resolution
5. **Do not proceed until resolved**

Guessing is a failure. Picking an interpretation "because it seems right" is not allowed.

### 3.3 Pushback obligation

Agents are not yes-machines. If a requested approach violates core principles, introduces unnecessary complexity, or creates technical debt, the agent MUST:

1. State the issue clearly
2. Explain the concrete downside
3. Propose a simpler alternative

If the human explicitly overrides, proceed. Silence is a failure.

### 3.4 Simplicity enforcement

Before finalizing any implementation, the agent MUST verify:

- Can this be done with fewer moving parts?
- Would a senior developer ask "why didn't you just…"?
- Are abstractions earning their complexity?

If a simple, boring solution exists and the agent chooses a complex one, the agent has failed.

---

## 4. Stop Rules

The agent MUST stop and re-plan (not silently continue) when ANY of these conditions is met:

| #   | Trigger                                                                                                                                                                                                                         | Required action                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| S1  | Task requires changing an architectural boundary                                                                                                                                                                                | Stop. Surface. Ask.                            |
| S2  | Agent discovers the declared scope is insufficient                                                                                                                                                                              | Stop. Reclassify per §2.3.                     |
| S3  | Two or more plausible implementations exist with different tradeoffs                                                                                                                                                            | Stop. Present options. Let human choose.       |
| S4  | The change would affect a **boot-critical path** — including but not limited to: application startup and entry points, lifecycle hooks, scheduler initialization, global module registration, or any global initialization path | Stop. Declare intent. Get explicit approval.   |
| S5  | Agent is unsure whether a file/symbol is still in use                                                                                                                                                                           | Stop. Ask. Do not delete.                      |
| S6  | Conflicting documentation found (any tier)                                                                                                                                                                                      | Stop per §3.2.                                 |
| S7  | Task stalls for more than 2 failed attempts at the same sub-problem                                                                                                                                                             | Stop. Report what was tried. Ask for guidance. |

---

## 5. Verification Obligations

After completing any task, the agent MUST:

### 5.1 Change summary (mandatory)

Provide a structured summary:

```
CHANGES MADE:
- [file]: what changed and why

NOT TOUCHED (intentionally):
- [file]: why it was left unchanged

CONCERNS:
- [risk, tradeoff, or thing to double-check]
```

This is required even for small changes.

### 5.2 Verification accountability

The agent MUST explicitly state what verification steps it performed. If the agent was unable to run verification (e.g., no terminal access, environment not available), it MUST say so and list what the human should verify manually.

Omitting verification status — neither claiming it was done nor acknowledging it was skipped — is a correctness failure.

### 5.3 Verification by task class

| Class              | Required verification                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| **Production**     | TypeScript compiles. Existing tests pass. No new `any` types or `eslint-disable` comments introduced. |
| **Test**           | New tests pass. No changes to production code unless explicitly scoped.                               |
| **Infrastructure** | Config is syntactically valid. No secrets exposed.                                                    |
| **Documentation**  | Links resolve. No contradictions with code introduced.                                                |

### 5.4 Lint and type safety

The following canonical documents are **Tier 1** authority for all lint and type decisions. Agents MUST follow them:

- **LINT_FIX_POLICY** — when and how to fix lint issues
- **TYPE_SAFETY_PATTERNS** — approved patterns for type boundaries
- **AGENT_CODEGEN_RULES** — code generation constraints

These documents are referenced by name. Their location within the repository may change; the agent should locate them via search if the path is not already known.

### 5.5 ESLint Semantics and Enforcement Model

ESLint rules in this repository represent **system safety invariants**, not stylistic preferences.

Agents MUST treat ESLint findings as **signals**, not automatic fix instructions.

### Verification mutability rule (mandatory)

Verification is **read-only by default**.

Agents MUST NOT run tools in mutating mode (e.g. `eslint --fix`, auto-formatters, codemods, or fix-on-save actions) during verification **unless the human explicitly instructs them to do so**.

If a tool requires mutating mode to operate, the agent MUST:

1. Stop
2. Explain why mutation is required
3. Ask for explicit approval before proceeding

#### Interpretation rules

- ESLint errors may represent:
  - real correctness issues
  - unsafe legacy assumptions
  - intentionally deferred technical debt

- The presence of an ESLint violation does **not** imply it must be fixed immediately.

- Whether a violation must be addressed depends on:
  - the declared task classification
  - the declared scope
  - explicit human instruction
  - applicable Tier-1 policies (e.g. ratcheting rules)

#### Ratcheting principle

Unless explicitly instructed otherwise:

- Agents MUST NOT introduce new ESLint violations
- Agents MUST NOT perform mass lint cleanup
- Agents MUST NOT fix unrelated violations outside the declared scope

Touching a file does not imply responsibility for all existing violations in that file.

#### Required agent behavior

When encountering ESLint violations, the agent MUST do one of the following:

1. Fix the violation **within scope**
2. Explain why the violation is out of scope
3. Flag the violation as legacy or requiring separate work

Silently ignoring or silently fixing ESLint violations is a correctness failure.

#### Authority

The following documents define **how** ESLint violations may be addressed

---

## 6. Failure Modes (Explicitly Prohibited)

The following behaviors are correctness failures regardless of outcome:

- Making assumptions without stating them
- Proceeding while confused
- Guessing instead of asking
- Silently resolving ambiguities
- Expanding scope without reclassification
- Being overly agreeable to bad requests
- Over-engineering simple problems
- Modifying code or comments without understanding them
- Leaving dead or unreachable code without flagging it
- Making changes without explaining _why_
- Treating Tier 2 documents as binding instructions
- Ignoring stop rules (§4)
- Omitting verification status (§5.2)

---

## 7. Loading Protocol

When an agent starts a session in this repository:

1. **Read this file first** — it is Tier 0
2. **Read `.github/agents/agents.md`** — it is the Tier 1 router
3. **Load the relevant Tier 1 topic file(s)** based on the task (see navigation table in `agents.md`)
4. **Do NOT preload Tier 2 docs** unless the task explicitly requires them

This loading order is mandatory. Skipping Tier 0 is a contract violation.

---

## 8. Amendment Rules

- Only human maintainers may amend this file.
- Agents MUST NOT modify this file.
- Agents MAY propose changes to this file **only when the human explicitly asks them to**.
- If an agent believes a rule in this file is wrong or counterproductive, it must flag it as a concern — not silently ignore or work around it.
