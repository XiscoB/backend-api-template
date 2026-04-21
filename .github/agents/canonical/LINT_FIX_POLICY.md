# Lint Fix Policy & Decision Matrix

**Goal:** Enforce strict contracts on new code while preventing regressions in legacy code, without stalling development.

---

## 🚦 The Decision Matrix

Use this matrix to determine if you should **FIX** a violation or **RATCHET** (exempt) it.

| Scenario                   | Decision         | Reasoning                                                         |
| :------------------------- | :--------------- | :---------------------------------------------------------------- | --------------------------- |
| **New File / New Feature** | **MUST FIX**     | No technical debt allowed in new work. Zero tolerance.            |
| **Touching Active Logic**  | **MUST FIX**     | If you change the behavior, you own the types.                    |
| **Touching Core Infra**    | **MUST FIX**     | High leverage. Core infra (Config, Auth) must be strict.          |
| **Renaming / Moving File** | **KEEP RATCHET** | purely structural change. Don't risk runtime breakage.            |
| **Complex Legacy Logic**   | **KEEP RATCHET** | If fixing requires rewriting >10% of the file, stop.              |
| **Test Fixtures / Mocks**  | **OPTIONAL**     | Fix if easy (`jest.Mocked`), ignore if it requires huge refactor. |
| **False Fixes (Silence)**  | **REJECT**       | Fixing a lint error by casting to any or loose unions (T          | undefined) is a regression. |

---

## 🛠 Rules of Engagement

### 1. The "Boy Scout" Rule (with Safety)

- **DO** fix small, obvious violations in files you are already editing (e.g., adding a return type).
- **DO NOT** go on a "refactoring crusade" in unrelated files.
- **DO NOT** fix violations if the fix requires runtime changes you cannot easily verify (e.g., changing `any` to `unknown` and adding strict validation logic in a critical payment path).

### 2. Ratcheting Mechanism

If you cannot fix a violation in a legacy file, you **MUST** use the file-level ratchet header.

- **DO** use the standard header defined in `LINTING.md`.
- **DO NOT** use `// eslint-disable-next-line` unless absolutely necessary (prefer file-level exemptions for legacy).
- **NEVER** add a ratchet to a **NEW** file.

### 3. Agent Protocol

- **If you created the code:** You MUST make it strict. No excuses.
- **If you are editing existing code:**
  - Can you fix the type safety without changing runtime logic? -> **FIX IT**.
  - Does fixing it require guessing at runtime shapes? -> **ASSERT `unknown`** or **SKIP**.
- **Silence != Safety:** If your "fix" involves introducing `| undefined` to a type just to make strict null checks pass, but the logic doesn't handle it, YOU HAVE FAILED.

---

## 📝 Scenarios

### Scenario A: Adding a new Controller endpoint

_You are adding `updateProfile` to `UserProfileController`._

- **Action:** You must define strict DTOs. You cannot use `any`. You cannot use `ConfigService` directly.
- **Verdict:** **STRICT COMPLIANCE.**

### Scenario B: Modifying a Legacy Service method

_You are adding a log line to `LegacyOrderService`, which is full of `no-unsafe-call` errors._

- **Action:** Add your log line. Ensure _your_ new code is typed.
- **Action:** Do **NOT** try to rewrite the entire `LegacyOrderService` to fix the 50 violations, unless explicitly tasked to refactor it.
- **Verdict:** **KEEP RATCHET.**

### Scenario C: "Drive-by" Fixes

_You notice `const x: any = ...` in a file you are editing._

- **Action:** Change it to `const x = ...` (infer).
- **Result:** It triggers `no-unsafe-call` downstream.
- **Refinement:** Can you easily type `x`?
  - Yes (it's a known interface): **FIX IT.**
  - No (it comes from a messy library): **REVERT & IGNORE.** Don't block your PR on this.

---

## 🤖 Directives for AI Agents

1.  **Do not be a hero.** Do not "clean up" usage of `any` unless you see the type definition definition immediately adjacent.
2.  **Respect the Ratchet.** If a file has a `RATCHET` header, respecting the existing violations is acceptable.
3.  **New Code is Sacred.** If you generate code that triggers `no-unsafe-*`, you have failed. Regenerate with strict types.
