# Infrastructure

> **Scope**: Redis, Email, Queues, Cron jobs, environment configuration.  
> **Parent**: [agents.md](../agents.md)

> This document defines domain-specific contracts and invariants.
> Agent behavior and process rules are defined exclusively in [AGENT_LAW.md](AGENT_LAW.md).

---

## Tech Stack (Fixed)

- **NestJS** (Node.js)
- **PostgreSQL**
- **Prisma ORM**
- **JWT (OIDC‑compatible)**
- **URL‑based API versioning**

---

## Infrastructure Components (Allowed)

The following infrastructure components **may be added** when needed, following strict guidelines:

### Redis (Caching & Queues)

- **Purpose**: Caching, session storage, queue management
- **Configuration**: Must be fully environment-driven
- **Provider-agnostic**: Code does not assume a specific Redis provider (AWS ElastiCache, Redis Cloud, local, etc.)
- **Optional vs Required**: Redis is optional for caching and async tasks; Redis is required when used for critical data consistency
- **Graceful degradation**: The application gracefully handles Redis unavailability in development
- **Module location**: `src/common/redis/` or `src/infrastructure/redis/`

### Scheduled Jobs (Cron)

- **Purpose**: Background tasks, cleanup, periodic processing
- **Library**: `@nestjs/schedule` (NestJS native)
- **Configuration**: All schedules are environment-configurable
- **Execution context**: Jobs use SYSTEM identity for database operations
- **Service layer**: Cron jobs call application services; direct database writes inside jobs are not permitted
- **Module location**: `src/jobs/` or `src/common/jobs/`
- **Documentation**: Each job documents its purpose, frequency, and dependencies

### Email System

- **Purpose**: Transactional emails only (no marketing campaigns)
- **Provider-agnostic**: Supports provider swap via environment variables
- **Configuration**: API keys, sender addresses, templates via environment
- **Template approach**: Simple placeholder replacement (no complex templating engines)
- **Module location**: `src/common/email/` or `src/infrastructure/email/`
- **Separation of concerns**: Email sending is triggered by domain services. Email content, formatting, and delivery logic are infrastructure-only.
- **Interface pattern**:
  ```typescript
  interface EmailService {
    send(to: string, template: string, variables: Record<string, string>): Promise<void>;
  }
  ```

### Queue System

- **Purpose**: Async processing, job distribution
- **Library**: BullMQ (Redis-based)
- **Alternative queue systems require an ADR**
- **Configuration**: Connection and retry logic via environment
- **Job patterns**: Jobs are idempotent and include proper error handling
- **Module location**: `src/queues/` or `src/infrastructure/queues/`

---

## Infrastructure Guidelines

When adding infrastructure components:

### Environment-First Design

- **All credentials via environment variables**
- **No hardcoded provider URLs or API endpoints**
- **Graceful degradation in development** (optional services)
- **Fail-fast validation** for production-required services

### Provider Neutrality

- Code does not assume specific providers:
  - ❌ AWS SES-specific methods
  - ❌ SendGrid-specific error handling
  - ✅ Generic email interface with provider adapters

### Documentation Expectations

Infrastructure additions include:

1. Updated `.env.example` with all required variables
2. Setup instructions in the relevant README
3. Documented fallback behavior if service unavailable
4. ADR for architectural decisions

### Testing Infrastructure

- Infrastructure does not block unit tests
- Test environments use mocks/stubs
- Integration tests are optional (behind flag)
- Docker Compose is recommended for local full-stack testing

---

## Scheduling Rule

Infrastructure maintenance jobs use fixed wall-clock scheduling in production.

Uptime-based schedulers (“every 24h since app start”) are permitted only for local development and are disabled by default.

This prevents schedule drift after restarts and ensures predictable maintenance windows.

---

## Environment Variables

### Required Variables

| Variable       | Required | Description                               |
| -------------- | -------- | ----------------------------------------- |
| `DATABASE_URL` | Yes      | PostgreSQL connection string              |
| `NODE_ENV`     | No       | Environment mode (default: `development`) |
| `PORT`         | No       | Server port (default: `3000`)             |

Constraints:

- All required variables are validated at startup
- Application **fails fast** if configuration is invalid
- No defaults for security-critical values

---

## Infrastructure Anti-Patterns

The following are not permitted in this codebase:

- Hardcoded infrastructure provider credentials or endpoints
- Infrastructure without environment-based configuration
- Complex templating engines for emails
- Marketing/bulk email functionality
- Infrastructure components required in development environment
- Assumptions about specific queue/cache provider

---

## CI Script Runtime Contract

- Scripts invoked directly in CI via `node` (for example under `scripts/ci/`) MUST be plain JavaScript unless they are explicitly precompiled before execution.
- Application build output (`dist/`) is for application code and does not include infrastructure tooling scripts.
- Rationale: deterministic CI execution with no runtime TypeScript dependency and no coupling between CI tooling and Nest build output.
