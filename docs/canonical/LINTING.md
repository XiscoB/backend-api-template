> Documentation Layer: Canonical Contract

# Linting & Ratcheting Strategy

## Philosophy

We use ESLint as a **strict contract enforcement layer**, not a style guide.

- Invariant rules (safety, async correctness) are set to `error`.
- Style rules are disabled or handled by Prettier.

## Ratcheting Mechanism

To unblock development while maintaining strict standards for new code, we use an **explicit file-level ratcheting strategy**.

### Rules

1.  **New Code**: Must comply 100% with all invariant rules. No new violations allowed.
2.  **Legacy Code**: Existing violations are exempted via explicit file-level headers.
3.  **Fixing**: Fix violations opportunistically when touching legacy files.

### Ratchet Header

Legacy files with violations must start with this header:

```typescript
/*
 * RATCHET: Legacy ESLint violations.
 * These disables exist only for pre-existing code.
 * New code in this file MUST NOT introduce new violations.
 * Fix opportunistically when touching this file.
 */
/* eslint-disable @typescript-eslint/rule-name, ... */
```

### Manual Exemption Process

If you touch a file and can't fix all violations:

1.  Ensure you aren't adding _new_ violations.
2.  Disable _only_ the specific legacy rules that are failing.
3.  Do not use `eslint-disable-next-line` or `eslint-disable-line` if possible; prefer the file-level ratchet to signal "this whole file is legacy".

