# Architecture

> Documentation Layer: Positioning / Architectural Framing

## Purpose

This repository is an opinionated reference architecture for compliance-heavy SaaS backends.
Its core design goal is deterministic behavior under security, concurrency, and privacy constraints.

## High-Level System Overview

The backend follows a modular service architecture with clear ownership boundaries:

- **API layer**: request/response boundary, DTOs, guards, versioned endpoints.
- **Identity layer**: maps external authentication identity to internal ownership identity.
- **Infrastructure layer**: environment-driven integrations (database, Redis, queues, email, scheduling primitives).
- **GDPR layer**: classification, lifecycle governance, export/deletion orchestration, immutable auditability.
- **Scheduler layer**: safe background execution under horizontal scaling.

The database is the authoritative system of record for domain state.

## Identity as the Ownership Root

Identity is the ownership anchor for domain data.

- JWT `sub` is used at request boundaries.
- Internal ownership is anchored by `identityId` through the Identity model.
- Domain tables reference `identityId`, not JWT claims.
- Identity state gates access independently of identity provider availability.

This keeps ownership stable even if the external identity provider changes.

## External Authentication Validation Model

This backend validates externally issued JWTs and does not implement identity-provider responsibilities.

What it does:

- Validates JWT signatures and required claims.
- Accepts configured algorithms (`HS256` and `RS256`) based on environment.
- Extracts canonical roles from supported claim locations.

What it does not do:

- Issue tokens.
- Store passwords.
- Implement login/logout/register/refresh flows.
- Depend on provider-specific APIs for runtime authorization decisions.

## Module Boundaries

- **API**: transport and contract enforcement.
- **Identity**: `externalUserId` mapping, ownership root, lifecycle flags.
- **Infrastructure**: provider adapters and operational wiring (env-first).
- **GDPR**: data governance and lifecycle invariants.
- **Scheduler**: bounded orchestration of periodic background work.

Cross-cutting rules:

- Controllers remain thin.
- Services own business logic.
- Background jobs call services; they do not become domain logic containers.

## Invariants

The following invariants are architectural and must remain true:

- JWT `sub` is boundary identity; domain ownership is `identityId`.
- Authentication success does not imply authorization success.
- Access blocking for deletion/suspension is backend-authoritative.
- Background processing is safe under multi-instance deployment.
- Concurrency coordination is explicit; race-condition-prone assumptions are not accepted.
- GDPR classification and auditability are explicit, not implicit.

## Intentionally Boring by Design

The architecture prioritizes explicitness over novelty:

- deterministic over clever,
- safe over convenient,
- stable over trendy.

This posture is intentional for compliance-heavy systems where predictability, operability, and reviewability are primary goals.

## Multi-Instance Deployment Assumptions

The system assumes horizontal scaling.

- Multiple instances may run schedulers concurrently.
- Work execution must rely on explicit coordination and idempotent handlers.
- Infrastructure degradation must not remove protection layers silently.

## Identity Provider Replacement Resilience

Provider replacement is a boundary concern, not a domain refactor.

- JWT issuer/audience/key material are environment-driven.
- Role extraction is provider-agnostic within canonical role contracts.
- Domain ownership remains stable because it depends on internal Identity mapping, not provider-specific storage.

## Why This Fits a Reference SaaS Backend

This architecture is suitable as a reference backend because it makes critical concerns explicit and testable:

- identity ownership and authorization boundaries,
- safe concurrency assumptions for background processing,
- GDPR lifecycle governance as first-class architecture,
- deterministic operational behavior under failure.

It is designed to be understandable, defensible, and reusable without embedding product-specific assumptions.
