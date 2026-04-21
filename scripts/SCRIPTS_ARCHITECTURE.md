# Scripts Architecture

This document explains the governance model and runtime decisions for the `/scripts` directory. It is descriptive, not normative, and provides clarity on the structure, runtime, and safety guarantees of the scripts ecosystem.

## 1. Architectural Intent

The primary goal of the `/scripts` directory structure is **isolation and containment**.

- **Segregation prevents entropy**: By explicitly separating concerns, we prevent development shortcuts from leaking into production pipelines.
- **Risk Profiles**: CI, Ops, and Dev environments have fundamentally different risk profiles and structural requirements.
- **Maintainability**: Clear boundaries ensure that future agents and developers understand the intended scope of each tool without ambiguity.

## 2. Folder Roles

The `/scripts` directory is segregated into three distinct areas, each with a specific purpose and governance model.

### scripts/ci
This directory contains scripts used exclusively by the Continuous Integration pipeline.
- **Purpose**: Build, validation, and verification gates.
- **Execution**: Scripts must be deterministic and reproducible.
- **Side Effects**: No side effects outside of validation and build artifacts.
- **Governance**: Highly strict; failures here block the pipeline.

### scripts/ops
This directory contains operational tools for production maintenance and administration.
- **Purpose**: Production operational tasks, data migrations, and system administration.
- **Execution**: Explicit intent execution; never auto-run.
- **Safety**: Fully typed and controlled to prevent accidental damage.
- **Governance**: Strict typing and safety checks.

### scripts/dev
This directory is a sandbox for developer experimentation and local utilities.
- **Purpose**: Rapid prototyping, local environment setup, and experimental tools.
- **Execution**: Non-critical; usage is opt-in.
- **Segregation**: Not part of automated pipelines; failures here do not block builds.
- **Governance**: Pragmatic flexibility; allows for faster iteration.

## 3. Runtime Model

The scripts ecosystem uses a unified runtime model to ensure consistency and type safety.

### Runtime Execution
- **Engine**: CI and Ops scripts execute via `ts-node` to run TypeScript directly.
- **Language**: `.ts` was adopted over `.js` to enforce strict typing boundaries and leverage the repository's existing type definitions.
- **Benefits**:
  - **Type Safety**: Prevents runtime errors common in untyped JavaScript scripts.
  - **Lint Integration**: Allows standard toolchain linting rules to apply.
  - **Consistency**: Aligns script development with the backend application standards.

### Configuration
A dedicated `tsconfig.scripts.json` exists to manage the compilation context for scripts.
- **Isolation**: Separates script compilation from the main application build to prevent circular dependencies or mental overhead.
- **Scope**: Clearly bounds the compiler to script-specific needs without interfering with the application's `tsconfig.json`.

## 4. Governance Model (Environment Scope Strictness)

The governance model differentiates strictness based on the critical nature of the script's environment.

| Environment Scope | Directory | Strictness | Description |
| :--- | :--- | :--- | :--- |
| **Production-Critical** | `scripts/ci`, `scripts/ops` | **Full Strict** | Fully typed, linted, and deterministic. No loose typing or unsafe patterns. |
| **Sandbox** | `scripts/dev` | **Pragmatic** | Flexible linting and strictness rules to facilitate experimentation. |

### Governance Principles
- **CI/Ops**: Must remain fully typed and strict. These are production-grade artifacts.
- **Dev**: May allow pragmatic flexibility but must never be auto-run or included in production pipelines.

## 5. Safety Principles

To maintain system integrity, the following safety principles apply to the scripts directory. These are guidelines for architectural consistency.

### Direct Prisma Access
Direct usage of Prisma in scripts is not categorically forbidden but must be intentional.
- **Intentionality**: Bypass of application logic domains must be done knowing the risks.
- **Invariants**: Scripts interacting with the database must respect domain invariants.
- **Business Logic**: Care must be taken to not unintentionally bypass critical business logic protections.

### Type Safety & Determinism
- **Ops Integrity**: Operational scripts must remain fully typed to ensure no runtime surprises during critical operations.
- **Dev Isolation**: Development scripts may use unsafe patterns for speed but must remain isolated from automated processes.
- **CI Reliability**: CI scripts must behave deterministically to ensure reliable build gates.
