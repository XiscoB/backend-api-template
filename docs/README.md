# Backend Base Documentation

> Documentation Layer: Documentation Index / Navigation

This directory contains the documentation for the `backend-base` template.
The documentation is structured by intent to help you find the right information quickly.

## Start Here

If you are new to the repository, read in this order:

1. [canonical/ARCHITECTURE.md](./canonical/ARCHITECTURE.md)
2. [canonical/AUTH_CONTRACT.md](./canonical/AUTH_CONTRACT.md)
3. [canonical/BOOTSTRAP_ARCHITECTURE.md](./canonical/BOOTSTRAP_ARCHITECTURE.md)
4. [canonical/SCHEDULING.md](./canonical/SCHEDULING.md)
5. [guides/SETUP.md](./guides/SETUP.md)

## Documentation Structure

### 📚 [Canonical](./canonical/)

**The Source of Truth.**
This folder contains authoritative specifications, contracts, and architectural invariants.
If you are implementing a feature or fixing a bug, these documents define _how it must work_.

- **Architecture**: High-level design and core systems.
- **Contracts**: API contracts, auth flows, and integration boundaries.
- **Specifications**: Feature-specific rules (e.g., GDPR, Notifications).

### 📖 [Guides](./guides/)

**How-To and Operations.**
Practical guides for developers and operators.

- **Setup**: Development environment and deployment.
- **Usage**: Scripts, tools, and troubleshooting.
- **Operations**: Day-to-day management tasks.

### 🏛 [History](./historical/)

> ⚠️ Historical Document  
> This file reflects the system state at the time it was written.
> Refer to canonical/ for current behavior.

**Context and Archives.**
Historical context, past audits, and implementation summaries.
**These documents are NOT authoritative.** They describe the system state at a specific point in time or explain _why_ a change was made.
Use these for context, but refer to `canonical/` for current behavior.

### ⚖️ [ADR](./adr/)

**Architectural Decision Records.**
Immutable records of significant design decisions, their context, and consequences.
ADRs explain _why_ a decision was made; current behavior is defined elsewhere.

## Conflict Resolution

If two documents disagree:

1.  **Canonical specs** in `canonical/` supersede everything else.
2.  **ADRs** in `adr/` explain why decisions were made. Current behavior is defined by `canonical/` and the codebase.
3.  **Historical docs** in `historical/` are outdated by definition.

## Contributing

- **Do not** modernize historical documents. Correct them by adding a note or creating a new current spec.
- **Explicit is better than implicit.** Document invariants clearly.
- **Keep it boring.** Prefer standard patterns over clever ones.

### GDPR Ownership Requirement

For GDPR ownership requirements and enforcement behavior, use the canonical contract:

- [canonical/GDPR_INVARIANTS.md](./canonical/GDPR_INVARIANTS.md)
