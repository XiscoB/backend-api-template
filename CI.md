# CI Contract Documentation

This document is normative. If behavior contradicts `CI.md`, the behavior is wrong.

## 1. Purpose of CI

CI is a contract enforcement mechanism. It protects architectural guarantees by ensuring that the codebase adheres to strict security, identity, and schema rules before acceptance.

It is **not** a product CI or generic quality pipeline. It is not designed to catch every bug, but to prevent architectural corruption.

## 2. What CI Enforces

The pipeline explicitly enforces:

- **JWT Validation and Fail-Fast Configuration**: Ensures the application refuses to boot with insecure authentication settings.
- **Provider-Agnostic JWT Algorithms and Role Extraction**: Verifies that token processing handles roles correctly regardless of the OIDC provider.
- **Identity Lazy Creation, Reuse, and Isolation**: Guarantees that users are created only when needed, reused idempotently, and data is completely isolated between identities.
- **Authorization Guard Behavior**: Confirms that `JwtAuthGuard` and role-based guards reject unauthorized access as specified.
- **Prisma Schema Validity**: Ensures the database schema is valid and consistent with migrations.
- **GDPR Ownership and Registry Integrity**: Verifies that all personal data is correctly mapped in the GDPR registry and ownership checks are enforceable.
- **Code Formatting Consistency**: Enforces Prettier formatting rules.
- **TypeScript / ESLint Architectural Rules**: Prevents type errors and violations of project conventions.

## 3. What CI Does NOT Enforce (By Design)

The following are explicitly excluded from the contract:

- **Coverage Thresholds**: Signal > quantity. We value testing the right things (contracts) over hitting arbitrary percentages.
- **Test Counts**: We do not optimize for the number of tests.
- **Performance Benchmarks**: Not the responsibility of this foundational contract.
- **Load Testing**: Excluded to minimize runtime and complexity.
- **PR-based CI Runs**: CI does not run on every PR to reduce noise and cost.
- **Multi-version Node Compatibility**: The template targets a specific runtime (Node 20 LTS).
- **Product-Specific Behavior**: Business logic validation belongs in product-specific pipelines, not the base template.

These exclusions are intentional to ensure cost minimization, template neutrality, and high signal-to-noise ratio.

## 4. Execution Model

- **Reference Branch**: CI runs **only** on the `master` branch.
- **Trigger**: Push events only.
- **Concurrency**: Single job execution.
- **Runtime**: Node 20 LTS.
- **Database**: Real PostgreSQL instance (no DB mocking).
- **Delegation**: Execution is strictly delegated to `scripts/ci.sh`. The YAML configuration is purely for orchestration. Any logic added to CI YAML instead of `scripts/ci.sh` is considered a contract violation.

## 5. Local Development Expectations

- Contributors are expected to run CI locally before merging.
- `scripts/ci.sh` is the canonical entry point for all verification.
- CI YAML configuration should not be relied upon for logic; it only calls the script.

**To run CI locally:**

```bash
bash scripts/ci.sh
```

## 6. Cost Philosophy

CI is designed to be effectively free.

- **Minimalism**: Only architectural contracts are enforced.
- **Master-Only**: Eliminates redundant runs on work-in-progress code.
- **No Matrix**: We test against the defined production runtime (Node 20 LTS) only.

This approach ensures the pipeline remains cheap, boring, and predictable.

## 7. Modification Rules

- **CI may not be weakened** to make tests pass.
- **Architectural tests may not be skipped** under any circumstances.
- **Coverage gates may not be added** to this contract.
- **Provider-specific logic may not be introduced** into the core CI pipeline.
- **Any CI change must preserve contract enforcement** above all else.
