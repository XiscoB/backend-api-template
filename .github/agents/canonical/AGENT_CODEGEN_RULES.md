# Agent Code Generation Verification Contract

This document defines **INVARIANT RULES** that AI Agents must follow _before_ generating code.
Violation of these rules results in rejected code.

**Canonical References:**

- [TYPE_SAFETY_PATTERNS.md](./TYPE_SAFETY_PATTERNS.md) (How to fix types)
- [LINT_FIX_POLICY.md](./LINT_FIX_POLICY.md) (When to fix types)

---

## 🛑 The 5 Cardinal Rules of Generation

### 1. No Explicit or Implicit `any`

- **Rule:** You are FORBIDDEN from writing `: any` or `as any`.
- **Rule:** The pattern `variable as unknown as TargetType` (Double Casting) is **FORBIDDEN** unless used inside a `*.spec.ts` file or a designated Type Adapter function.
- **Rule:** If a type is unknown or unclear, you MUST default to `unknown` and then narrow it using type guards or validation libraries (e.g., Zod).
- **Rule:** Do not generate code that relies on implicit `any` returns from libraries. Wrap them immediately.

### 2. Guard the Boundaries

- **Rule:** NEVER use `ConfigService` or `process.env` directly in feature code. Use `AppConfigService`.
- **Rule:** NEVER cast external data (API responses, JSON) directly to a type. Validate it first.

### 3. Strict Helper Purity

- **Rule:** Type Adapters and Helper functions must return the **Strict Target Type**.
- **Rule:** Do not return `Target | undefined` from a sanitizer helper. Handle existence/optionality at the **call site**, not inside the helper.
- **Reason:** Baking `undefined` logic into the helper hides strict type violations and encourages loose typing.

### 4. Strict Testing Practices

- **Rule:** Do not create loose mocks (`const m = {} as any`).
- **Rule:** Use `jest.Mocked<T>` or `Partial<T>` and define only what is needed, but typed correctly.

### 5. Zero Technical Debt

- **Rule:** Do not generate "TODO: fix this later" comments for type safety.
- **Rule:** If you cannot type it strictly, you cannot generate it.

---

## ✅ DO / ❌ DO NOT

| Category          | ❌ DO NOT Generate                     | ✅ DO Generate                                                     |
| :---------------- | :------------------------------------- | :----------------------------------------------------------------- | ------------------------------------------------- |
| **Unknown Types** | `arg: any` or `data as any`            | `arg: unknown` + narrowing (see below)                             |
| **Double Casts**  | `data as unknown as User`              | `isValid(data) ? data : throw`                                     |
| **Config**        | `this.config.get('DB_URL')`            | `this.config.databaseUrl`                                          |
| **JSON/External** | `const data = JSON.parse(str) as User` | `const raw = JSON.parse(str); const data = UserSchema.parse(raw);` |
| **Mocks**         | `const mock = { ... } as any`          | `const mock: jest.Mocked<Service> = { ... }`                       |
| **Loose Helpers** | `normalize(x): T                       | undefined`                                                         | `normalize(x): T` (Handle undefined at call site) |
| **Async**         | `return await service.call()`          | `return service.call()` (unless try/catch)                         |

---

## 📝 Examples

### Scenario 1: Handling Unknown Input

**❌ BAD:**

```typescript
function handle(payload: any) {
  console.log(payload.userId); // Unsafe
}
✅ GOOD:

TypeScript
import { z } from 'zod';

const PayloadSchema = z.object({ userId: z.string() });

function handle(payload: unknown) {
  // Option A: Zod
  const data = PayloadSchema.parse(payload);
  console.log(data.userId);

  // Option B: Type Guard
  if (typeof payload === 'object' && payload !== null && 'userId' in payload) {
      console.log((payload as any).userId); // Only safe inside guard if guard is strict
  }
}
Scenario 2: Dependency Injection
❌ BAD:

TypeScript
constructor(private config: ConfigService) {}
// ...
const key = this.config.get('API_KEY'); // Returns any/string | undefined
✅ GOOD:

TypeScript
constructor(private config: AppConfigService) {}
// ...
const key = this.config.apiKey; // Guaranteed string
🚨 If Unsure: STOP
If you encounter a library or pattern where you cannot find a strictly typed solution:

STOP generation.

ASK the user for a strictly typed adapter or permission to create one.

DO NOT silence the error with eslint-disable.
```
