# Canonical Type Safety Patterns (TYPE_SAFETY_PATTERNS.md)

This document defines the **ONLY** acceptable ways to resolve `@typescript-eslint/no-unsafe-*` violations in this repository.

**Philosophy:**

- TypeScript is our **contract layer**.
- `any` is a breach of contract.
- We do not use `as any` to silence errors. We fix the types.

---

## 1. NestJS Boundaries & Dependency Injection

**Problem:** `ConfigService` and other DI containers often return `any` or `unknown`.
**Rule:** Never use `ConfigService` directly in feature modules.

### ❌ What NOT to do

```typescript
// BAD: Direct access, unsafe return type, hard string dependencies
constructor(private config: ConfigService) {}

connect() {
  // Violation: no-unsafe-call, no-unsafe-assignment
  const url = this.config.get('DATABASE_URL');
  return db.connect(url);
}
```

### ✅ The Canonical Approach (AppConfigService)

Use the typed AppConfigService wrapper (src/config/app-config.service.ts).

```typescript
// GOOD: Typed wrapper, validated at startup
constructor(private config: AppConfigService) {}

connect() {
  // Type is string, validated by Joi/Zod on startup
  const url = this.config.databaseUrl;
  return db.connect(url);
}
```

**Fixing Missing Keys:** If a key is missing from AppConfigService, add it there. Do not bypass it.

## 2. External Data (JSON, APIs, Env)

**Problem:** Data from the "outside world" (API responses, JSON.parse) is any or unknown.
**Rule:** You must validate strictly at the boundary before casting.

### ❌ What NOT to do

```typescript
// BAD: Blind casting or implicit any
const data = JSON.parse(jsonString); // type is any
console.log(data.id); // Violation: no-unsafe-member-access
```

### ✅ The Canonical Approach (Unknown + Narrowing)

Treat untrusted data as unknown and strict-narrow it.

```typescript
// Option A: Interface + Type Guard (Native)
interface UserPayload {
  id: string;
}

function isUserPayload(u: unknown): u is UserPayload {
  return typeof u === 'object' && u !== null && 'id' in u && typeof (u as any).id === 'string';
}

const raw: unknown = JSON.parse(jsonString);

if (!isUserPayload(raw)) {
  throw new Error('Invalid payload');
}
// raw is now Safe
console.log(raw.id);
```

### ✅ The Canonical Approach (Zod Validator)

If zod is available, use it for complex schemas.

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
});

const raw = JSON.parse(jsonString);
const result = UserSchema.parse(raw); // Throws if invalid, returns typed object
console.log(result.id);
```

## 3. Persistence Boundaries (Prisma / ORM)

**Problem:** `Prisma.InputJsonValue` is strict. DTOs often use `Record<string, unknown>` or `any`, which are not assignable.
**Rule:** You must ensure the data is serializable _before_ passing it to Prisma.

### ❌ What NOT to do

```typescript
// BAD: "Trust me, bro" casting
const payload: Record<string, unknown> = dto.data;

// Violation: Bypasses serialization checks (e.g. fails on undefined, functions, or Symbols)
const data = payload as unknown as Prisma.InputJsonValue;
```

### ✅ The Canonical Approach (Sanitization Helper)

Use a helper that guarantees JSON safety by stripping non-serializables. The helper MUST return `Prisma.InputJsonValue` by construction. It should not handle `undefined` (omission) logic; let the caller decide.

```typescript
// GOOD: Helper guarantees value is valid JSON.
// Do NOT accept or return 'undefined' here. Handle existence at the call-site.
function toPrismaJson(data: unknown): Prisma.InputJsonValue {
  // JSON.parse(JSON.stringify) guarantees the result is a valid JSON typeset.
  return JSON.parse(JSON.stringify(data));
}

// Usage:
const updateInput = {
  // Caller handles 'undefined' logic (e.g., skip field if missing)
  snapshot: dto.data ? toPrismaJson(dto.data) : undefined,
};
```

## 4. Libraries with Bad Types

**Problem:** Third-party libraries sometimes return any.
**Rule:** Wrap the library call in a typed adapter.

### ❌ What NOT to do

```typescript
// BAD: Leaking `any` from the library into your logic
const result = terribleLib.doThing(); // type is any
process(result.status); // Violation: no-unsafe-member-access
```

### ✅ The Canonical Approach (Typed Adapter)

Cast immediately at the source, ideally with assertion.

```typescript
interface LibResult {
  status: string;
}

// GOOD: Contain the unsafety in one line
const result = terribleLib.doThing() as LibResult;
process(result.status);
```

## 5. Tests and Mocks

**Problem:** Tests often use mock<T>() which returns any for everything, breaking strict safety.
**Rule:** Use jest.Mocked<T> or strict definitions.

### ❌ What NOT to do

```typescript
// BAD: Creating an 'any' bag
const mockService = {
  findAll: jest.fn().mockReturnValue(['test']),
} as any; // Disables strict checking entirely
```

### ✅ The Canonical Approach (Partial Wrappers)

Use Partial<T> or strongly typed references.

```typescript
const mockService: jest.Mocked<PermissionsService> = {
  findAll: jest.fn().mockResolvedValue(['test']),
  // ... other methods as needed, or cast as unknown as Interface if partial
} as unknown as jest.Mocked<PermissionsService>;
```

## 6. Agent Guidelines

**Context:** AI Agents often try to "fix" lint errors by slapping `as any` or `// eslint-disable` on the line.

**Directive:**

- **NEVER** use `as any`.
- **NEVER** use `eslint-disable` for `no-unsafe-*` rules.
- **ALWAYS** trace the `any` to its source (usually a function return or a library call) and fix the type definition there.
- **NEVER** use double-casting ('as unknown as Target') to bypass type incompatibility. You must use a Type Guard function or a Normalization Helper.

### Example of an Agent Fix:

**Lint Error:** Unsafe member access `.id` on an `any` value.

**BAD Agent Action:**

```typescript
console.log((data as any).id);
```

**GOOD Agent Action:**

1.  Look at where `data` comes from.
2.  Ah, it comes from `JSON.parse()`.
3.  Change `const data = JSON.parse(...)` to `const data: unknown = JSON.parse(...)`.
4.  Add a validation step or type assertion logic.
