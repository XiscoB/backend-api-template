# Backend API — Agent Documentation

Agent documentation is organized under the `.github/agents/` directory.

---

## Where to Look

| Purpose                  | Location                                                                |
| ------------------------ | ----------------------------------------------------------------------- |
| **Documentation index**  | [.github/agents/agents.md](.github/agents/agents.md) — topic navigation |
| **Behavioral authority** | [.github/agents/AGENT_LAW.md](.github/agents/AGENT_LAW.md)              |

---

## Directory Layout

```
.github/agents/
├── agents.md           # Documentation index (start here)
├── AGENT_LAW.md        # Behavioral authority (Tier 0)
├── auth.md             # Authentication, authorization, identity model
├── database.md         # Prisma, schema design, migrations
├── api.md              # Controllers, services, DTOs, versioning
├── infrastructure.md   # Redis, Email, Queues, Cron jobs
├── gdpr.md             # GDPR classification, data governance
└── testing.md          # E2E tests, JWT utilities, test patterns
```

| File | Description |
|------|-------------|
| [`agents.md`](.github/agents/agents.md) | Documentation index (start here) |
| [`AGENT_LAW.md`](.github/agents/AGENT_LAW.md) | Behavioral authority (Tier 0) |
| [`auth.md`](.github/agents/auth.md) | Authentication, authorization, identity model |
| [`database.md`](.github/agents/database.md) | Prisma, schema design, migrations |
| [`api.md`](.github/agents/api.md) | Controllers, services, DTOs, versioning |
| [`infrastructure.md`](.github/agents/infrastructure.md) | Redis, Email, Queues, Cron jobs |
| [`gdpr.md`](.github/agents/gdpr.md) | GDPR classification, data governance |
| [`testing.md`](.github/agents/testing.md) | E2E tests, JWT utilities, test patterns |

---

## Quick Navigation

| I want to...                     | Load these files |
| -------------------------------- | ---------------- |
| Understand the project           | [`agents.md`](.github/agents/agents.md) |
| Work on authentication/roles     | [`agents.md`](.github/agents/agents.md) + [`auth.md`](.github/agents/auth.md) |
| Modify database schema           | [`agents.md`](.github/agents/agents.md) + [`database.md`](.github/agents/database.md) + [`gdpr.md`](.github/agents/gdpr.md) |
| Create API endpoints             | [`agents.md`](.github/agents/agents.md) + [`api.md`](.github/agents/api.md) |
| Add infrastructure (email, cron) | [`agents.md`](.github/agents/agents.md) + [`infrastructure.md`](.github/agents/infrastructure.md) |
| Work on GDPR features            | [`agents.md`](.github/agents/agents.md) + [`gdpr.md`](.github/agents/gdpr.md) |
| Write or fix tests               | [`agents.md`](.github/agents/agents.md) + [`testing.md`](.github/agents/testing.md) |

All paths above are relative to `.github/agents/`.

---

## Additional References

| Document                | Location                          |
| ----------------------- | --------------------------------- |
| Table design guidelines | `docs/create_tables_guideline.md` |
| Architecture decisions  | `docs/adr/`                       |
| GDPR implementation     | `docs/GDPR_*.md`                  |
| Copilot instructions    | `.github/copilot-instructions.md` |

## Strategic Context

See [`REFERENCE_OBJETIVE.md`](REFERENCE_OBJETIVE.md) for public release goals and quality standards.
This document does not define behavioral rules.