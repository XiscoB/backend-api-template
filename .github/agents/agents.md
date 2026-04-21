> Agent behavior is defined in [AGENT_LAW.md](AGENT_LAW.md) (Tier 0).
> This file is a navigation index only.

# Backend API — Agent Documentation Index

This file is the entry point for locating repository documentation.
Load topic-specific files based on the task at hand.

---

## Topic Files

| Topic                 | File                               | Contents                                       |
| --------------------- | ---------------------------------- | ---------------------------------------------- |
| **Authentication**    | `.github/agents/auth.md`           | JWT, roles, identity model, authorization      |
| **Database**          | `.github/agents/database.md`       | Prisma, schema, migrations, table design       |
| **API Development**   | `.github/agents/api.md`            | Controllers, services, DTOs, versioning        |
| **Infrastructure**    | `.github/agents/infrastructure.md` | Redis, Email, Queues, Cron, environment config |
| **GDPR & Governance** | `.github/agents/gdpr.md`           | Data classification, exports, audit logging    |
| **Testing**           | `.github/agents/testing.md`        | E2E tests, JWT test utilities, test patterns   |
| **Agent Behavior**    | `.github/agents/AGENT_LAW.md`      | Behavioral definitions (Tier 0)                |

---

## Multi-Topic Task Loading

| Task Type                   | Relevant Files                                   |
| --------------------------- | ------------------------------------------------ |
| New API endpoint            | `api.md`                                         |
| Endpoint with auth          | `api.md` + `auth.md`                             |
| Database change             | `database.md` + `gdpr.md`                        |
| New domain feature          | `api.md` + `database.md` + `gdpr.md`             |
| Infrastructure addition     | `infrastructure.md`                              |
| Full feature implementation | `api.md` + `database.md` + `auth.md` + `gdpr.md` |
| Writing or fixing tests     | `testing.md` + relevant domain file              |

---

## Repository Overview

**backend-base-api** is a reusable NestJS backend template (pre-v1, foundation phase).

It includes:

- Business logic patterns, guards, decorators, filters, interceptors
- JWT claims validation (authorization)
- Data validation patterns and API versioning structure
- Identity-first ownership model

Authentication is handled externally by an OIDC-compatible identity provider.
The repository does not contain login/logout flows, credentials, token issuance, UI, or project-specific business domains.

---

## Supporting Documentation

| Document                      | Location                                                                  | Description                                     |
| ----------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| Table design guidelines       | `docs/create_tables_guideline.md`                                         | Conventions for database table schema           |
| Architecture Decision Records | `docs/adr/`                                                               | Historical and active architectural decisions   |
| GDPR implementation details   | `docs/GDPR_*.md`                                                          | GDPR export, audit, and data governance docs    |
| ESLint & type-safety policies | `LINT_FIX_POLICY.md`, `TYPE_SAFETY_PATTERNS.md`, `AGENT_CODEGEN_RULES.md` | Lint fix strategy, type patterns, codegen rules |
| Copilot instructions          | `.github/copilot-instructions.md`                                         | Editor-level Copilot configuration              |
