> Documentation Layer: Canonical Contract

# Rate Limiting

Request rate limiting for backend-base using configurable backends (Memory or Redis).

## Overview

Rate limiting is **opt-in** via decorator. No global rate limiting by default.

```typescript
@UseGuards(RateLimitGuard)
@RateLimit('rl-public-strict')
@Get('sensitive')
sensitiveEndpoint() { ... }
```

### Why Opt-In?

- Avoids accidental protection changes
- Downstream projects choose their own policies
- Easier testing and debugging
- No performance overhead on undecorated endpoints

---

## Usage

### Public Endpoints (IP-based)

```typescript
import { UseGuards } from '@nestjs/common';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { RateLimit } from '../common/decorators/rate-limit.decorator';

@Public()
@UseGuards(RateLimitGuard)
@RateLimit('rl-public-semi-strict')  // 60 req / 60s per IP
@Get('search')
search() { ... }
```

### Authenticated Endpoints (User-based)

```typescript
@UseGuards(RateLimitGuard)
@RateLimit('rl-auth-semi-strict')  // 120 req / 60s per user
@Patch('me')
updateProfile() { ... }
```

### Key Resolution

| Scope  | Key Source    | Notes                                 |
| ------ | ------------- | ------------------------------------- |
| `ip`   | `request.ip`  | Respects Express trust proxy settings |
| `user` | `Identity.id` | Never JWT sub. Denies if no identity. |

---

## Available Tiers

| Tier                       | Limit | Window | Scope | Use Case                           |
| -------------------------- | ----- | ------ | ----- | ---------------------------------- |
| `rl-public-flexible`       | 300   | 60s    | IP    | Health checks, high-traffic public |
| `rl-public-semi-strict`    | 60    | 60s    | IP    | General public APIs (default)      |
| `rl-public-strict`         | 20    | 60s    | IP    | Sensitive public endpoints         |
| `rl-auth-flexible`         | 240   | 60s    | User  | Frequently polled APIs             |
| `rl-auth-semi-strict`      | 120   | 60s    | User  | General authenticated (default)    |
| `rl-auth-strict`           | 30    | 60s    | User  | Sensitive authenticated            |
| `rl-internal-admin-strict` | 10    | 60s    | User  | Internal admin console             |

See [rate-limit.config.ts](../src/config/rate-limit.config.ts) for definitions.

---

## Backend Drivers

Configure via environment variable:

```env
RATE_LIMIT_DRIVER=memory   # Default
RATE_LIMIT_DRIVER=redis    # Requires REDIS_URL
```

### Memory Backend (Default)

In-process rate limiting. No external dependencies.

| Characteristic | Value                        |
| -------------- | ---------------------------- |
| Scope          | Per-instance (not shared)    |
| Persistence    | None (resets on app restart) |
| Dependencies   | None                         |
| Configuration  | None required                |

**When to use:**

- Single-instance deployments
- Development and testing
- When global consistency is not required

### Redis Backend (Optional)

Distributed rate limiting for horizontal scaling.

| Characteristic | Value                                          |
| -------------- | ---------------------------------------------- |
| Scope          | Global (shared across instances)               |
| Persistence    | Survives app restarts (while Redis is running) |
| Dependencies   | Redis server                                   |
| Configuration  | `REDIS_URL=redis://host:port`                  |

**When to use:**

- Multiple app instances behind a load balancer
- Rate limits must be consistent globally
- Production deployments with auto-scaling

**Validated guarantees** (see [REDIS_RATE_LIMITING_VALIDATION.md](./REDIS_RATE_LIMITING_VALIDATION.md)):

- ✅ Global enforcement across all instances sharing the same Redis
- ✅ Atomic counters via Redis INCR (race-condition safe)
- ✅ Automatic window expiry via Redis TTL

### Intentional Degradation Model (Redis -> Memory)

When `RATE_LIMIT_DRIVER=redis`, Redis remains the **primary distributed limiter**. If Redis becomes unhealthy,
the system degrades to an in-memory limiter to preserve protection.

This fallback is intentionally **per-instance**:

- Each application instance enforces its own fallback counters
- Cross-instance global coordination is not provided during degradation
- This is acceptable because fallback mode is an outage/degradation posture, not steady-state design

Architectural intent:

- Prioritize **safety** (never silently disable protection)
- Accept reduced global consistency during dependency failure
- Restore distributed enforcement when Redis is healthy again

### Intentional Recovery Detection Strategy

Redis recovery detection is intentionally **request-triggered** and cooldown-throttled:

- Recovery is checked only when a protected request arrives after cooldown
- There is no background Redis polling loop
- A single probe is allowed at a time (no async probe storms)

This tradeoff is intentional for template reliability:

- Avoid timer lifecycle complexity
- Avoid aggressive retry traffic under load
- Avoid boot-critical fragility
- Keep behavior boring, deterministic, and easy to reason about

Recovery is therefore lazy and traffic-driven **by design**.

---

## Failure Behavior

### Startup Behavior (Validated)

The application validates configuration at startup and degrades safely when Redis is unavailable:

| Scenario                                       | Behavior                  | Exit Code |
| ---------------------------------------------- | ------------------------- | --------- |
| `RATE_LIMIT_DRIVER=memory` (default)           | Always works              | N/A       |
| `RATE_LIMIT_DRIVER=redis`, Redis available     | Distributed rate limiting | N/A       |
| `RATE_LIMIT_DRIVER=redis`, missing `REDIS_URL` | **Fails fast**            | 1         |
| `RATE_LIMIT_DRIVER=redis`, invalid `REDIS_URL` | **Fails fast**            | 1         |
| `RATE_LIMIT_DRIVER=redis`, Redis unreachable   | Boots in memory fallback  | N/A       |
| Invalid `RATE_LIMIT_DRIVER` value              | **Fails fast**            | 1         |

> If Redis is unreachable at startup and fallback is enabled, the app logs fallback activation and starts in memory fallback mode.

### Runtime Failures (Redis Backend)

When Redis becomes unavailable at runtime:

| Observation    | Behavior                                                                |
| -------------- | ----------------------------------------------------------------------- |
| Request status | Protected by fallback limiter (429 when thresholds are exceeded)        |
| Rate limiting  | Degrades to per-instance memory enforcement                             |
| App state      | Continues running                                                       |
| Logs           | Structured transition logs for fallback activation, probe, and recovery |

If both Redis and fallback memory paths fail for the same request, the system fails closed with HTTP 429.

### Redis Runtime Health Signal

`RedisService` exposes a synchronous health signal:

```typescript
isHealthy(): boolean
```

**What it represents:**

- Runtime connection state based on ioredis events (`ready`, `error`, `end`, `close`, `reconnecting`)
- `true` = connected and ready
- `false` = not connected, reconnecting, or errored

**What it does NOT represent:**

- Not a startup/configuration validation (that's fail-fast at boot)
- Not a guarantee that rate limiting is enforced
- Not a monitoring or alerting mechanism

**Relationship to rate limiting:**

| Health State | Enforcement                                      | Headers (future)    |
| ------------ | ------------------------------------------------ | ------------------- |
| `true`       | Redis primary                                    | May be emitted      |
| `false`      | Memory fallback / fail-closed on backend failure | Must NOT be emitted |

**Intended consumers:**

- Internal guards (e.g., `RateLimitGuard` for header emission decisions)
- Not for business logic or authorization decisions

### Restart Behavior

| Event          | Memory Backend         | Redis Backend               |
| -------------- | ---------------------- | --------------------------- |
| App restarts   | Counters reset to zero | Counters preserved in Redis |
| Redis restarts | N/A                    | Counters reset to zero      |

---

## Operator Responsibilities (Redis Backend)

When running with `RATE_LIMIT_DRIVER=redis`, operators must be aware:

### What Must Be Monitored

1. **Redis health** - Use production dashboards to monitor Redis availability
2. **Rate limit error logs** - Set up alerts on `[RedisRateLimiter]` error messages
3. **Application startup** - Ensure proper health checks before routing traffic

### Key Log Patterns

| Log Pattern                                                        | Meaning                         |
| ------------------------------------------------------------------ | ------------------------------- |
| `[RedisService] Redis connected successfully`                      | Healthy startup                 |
| `[RedisRateLimiter] Redis rate limit error: Connection is closed.` | Redis unavailable at runtime    |
| `Error: Failed to connect to Redis: ...`                           | Startup failure (app will exit) |

### Operational Trade-offs

The current design chooses **safe degradation over fail-open**:

1. Redis provides distributed enforcement in healthy steady state
2. Memory fallback preserves protection during Redis outages
3. Recovery remains request-triggered and cooldown-throttled for deterministic behavior

---

## Response Format

When rate limit is exceeded, returns HTTP 429:

```json
{
  "statusCode": 429,
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again later.",
  "tier": "rl-public-strict"
}
```

---

## Redis Key Namespacing

Redis keys follow the pattern:

```
backend-base:{env}:ratelimit:{scope}:{tierName}:{key}
```

Example:

```
backend-base:production:ratelimit:ip:rl-public-strict:192.168.1.1
```

---

## Future Work: Rate Limit Headers

> [!NOTE]
> Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`) are **not yet implemented**.

When implemented, the following constraints apply:

- Headers will be **best-effort** and may not reflect exact server-side state
- During Redis runtime failures, headers may be absent or inaccurate
- Clients **must not** assume headers are always present or accurate
- Headers are informational, not authoritative

---

## Reference Examples

- **Public**: [health.controller.ts](../src/modules/health/v1/health.controller.ts) - `/detailed` endpoint
- **Authenticated**: [profiles.controller.ts](../src/modules/profiles/v1/profiles.controller.ts) - `PATCH /me`

## Validation Reference

For complete validation results including test procedures and scripts, see:

- [REDIS_RATE_LIMITING_VALIDATION.md](./REDIS_RATE_LIMITING_VALIDATION.md)

