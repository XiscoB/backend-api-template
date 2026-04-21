# GDPR

> Documentation Layer: Positioning / Architectural Framing

## Purpose

In this backend, GDPR is architectural infrastructure, not an add-on feature.
Privacy guarantees are modeled as domain invariants tied to identity ownership and lifecycle state.

## Identity Ownership Model

Ownership is identity-rooted.

- External authentication identity is mapped through Identity.
- Domain ownership is anchored by `identityId`.
- JWT `sub` is a request-boundary identifier, not a domain ownership key.

This separation keeps privacy lifecycle control internal and stable across identity-provider changes.

## Data Classification Approach

GDPR classification is explicit per table.
Each table must be intentionally categorized as included, excluded, or system-only according to existing contracts.
There is no implicit default classification path.

This supports governance completeness and prevents silent data surface growth.

## Two-Phase Deletion Model

Deletion follows a two-phase lifecycle:

1. **Logical deletion phase**
   - mark deletion request state,
   - immediately block authenticated access via backend authorization,
   - preserve reversibility within configured lifecycle constraints,
   - record required audit entries.

2. **Final deletion/anonymization phase**
   - execute registry-driven data processing,
   - finalize irreversible privacy state,
   - preserve auditable completion evidence.

Backend enforcement remains authoritative throughout lifecycle transitions.

## Auditability Requirements

GDPR operations require immutable auditability.
Export, deletion, and lifecycle state actions must produce durable audit records according to repository contracts.
Auditability is required for compliance reviewability and operational forensics.

## Domain Invariants

The GDPR model depends on explicit invariants:

- identity lifecycle flags are authoritative for access gating,
- deletion/suspension state can block access even with valid authentication,
- GDPR classification coverage is explicit,
- lifecycle transitions are observable and auditable,
- privacy processing does not depend on identity-provider API availability.

## Why GDPR Is Architectural

GDPR affects identity, access, background orchestration, exports, and deletion semantics.
Because it spans core system boundaries, it is treated as architecture-level behavior with explicit contracts.

## Provider Replacement Safety via Identity Abstraction

Identity abstraction protects GDPR behavior from provider coupling.

- external provider changes affect token validation boundary configuration,
- internal ownership and lifecycle state remain stable,
- privacy workflows continue without provider-specific data model dependencies.

## Export and Deletion Modeling

GDPR export and deletion are modeled as governed workflows, not ad hoc endpoint behavior.

- Export respects classification boundaries and localization requirements.
- Deletion follows lifecycle orchestration and finalization constraints.
- Both workflows require auditability and deterministic status semantics.

This preserves compliance posture under scaling, failure, and provider replacement scenarios.
