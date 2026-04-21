> Documentation Layer: Canonical Contract

# Scheduling Philosophy

This document explains the scheduling philosophy for background jobs in this repository.

## Why Fixed Clock-Time Scheduling Matters

### The Problem with Uptime-Based Scheduling

Uptime-based scheduling ("run every 24h since app start") is dangerous in production:

```
┌─────────────────────────────────────────────────────────────────┐
│  App starts at 10:00 AM                                         │
│  Daily job runs at 10:00 AM                                     │
│                                                                 │
│  App restarts at 2:00 PM (deploy)                               │
│  Daily job now runs at 2:00 PM (drift!)                         │
│                                                                 │
│  App crashes at 6:00 PM, restarts at 6:15 PM                    │
│  Daily job now runs at 6:15 PM (more drift!)                    │
│                                                                 │
│  After a few days: job runs at random unpredictable times       │
└─────────────────────────────────────────────────────────────────┘
```

**Problems**:

1. **Schedule drift**: Every restart shifts the schedule
2. **Unpredictable load**: Jobs run at random times, potentially during peak traffic
3. **Debugging nightmare**: "When did cleanup last run?" becomes unanswerable
4. **Missed windows**: Maintenance windows become meaningless

### The Solution: Fixed Clock-Time Scheduling

Fixed clock-time scheduling using cron expressions:

```
┌─────────────────────────────────────────────────────────────────┐
│  Cron: "0 3 * * *" (3:00 AM UTC daily)                          │
│                                                                 │
│  App starts at 10:00 AM                                         │
│  → Job scheduled for 3:00 AM tomorrow                           │
│                                                                 │
│  App restarts at 2:00 PM (deploy)                               │
│  → Job still scheduled for 3:00 AM tomorrow                     │
│                                                                 │
│  App crashes at 6:00 PM, restarts at 6:15 PM                    │
│  → Job still scheduled for 3:00 AM tomorrow                     │
│                                                                 │
│  Result: Job ALWAYS runs at 3:00 AM                             │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits**:

1. **Restart-safe**: Deploys don't affect schedule
2. **Predictable load**: Jobs run during planned maintenance windows
3. **Observable**: "Cleanup runs at 3 AM" - simple and clear
4. **Auditable**: Logs show consistent execution times

## Scheduling Strategies

### 1. Fixed Clock-Time (Production)

Use cron expressions for all production jobs.

```bash
# Environment configuration
SCHEDULER_MODE=cron
SCHEDULER_DAILY_CRON=0 3 * * *
SCHEDULER_TIMEZONE=UTC
```

**When to use**:

- All production deployments
- Staging environments
- Any environment where restarts occur

**Cron expression reference**:

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sunday=0)
│ │ │ │ │
* * * * *

Examples:
* * * * *       Every minute
0 * * * *       Every hour at minute 0
0 3 * * *       Daily at 3:00 AM
0 3 * * 0       Weekly on Sunday at 3:00 AM
0 3 1 * *       Monthly on the 1st at 3:00 AM
```

### 2. Uptime-Based (Development Only)

Uses `setInterval` for simpler local testing.

```bash
# Environment configuration (DEV ONLY!)
SCHEDULER_MODE=uptime-based
```

**When to use**:

- Local development
- Quick testing
- CI/CD integration tests

**When NOT to use**:

- ❌ Production
- ❌ Staging
- ❌ Any environment with restarts

## Multi-Instance Safety

The scheduler uses database-level locking to ensure only one instance executes a job:

```
┌─────────────────────────────────────────────────────────────────┐
│  Instance A                      Instance B                     │
│                                                                 │
│  3:00 AM - Cron triggers         3:00 AM - Cron triggers        │
│  Acquire lock: SUCCESS           Acquire lock: FAILED           │
│  Execute job                     Skip (another instance)        │
│  Release lock                                                   │
│                                                                 │
│  Result: Job runs exactly once                                  │
└─────────────────────────────────────────────────────────────────┘
```

The lock mechanism:

- Uses PostgreSQL row-level locking via `scheduler_locks` table
- Lock has TTL to prevent deadlocks from crashed processes
- Stale locks are automatically cleaned up
- Failed lock acquisition exits silently (no error)

> **Note**: We explicitly **do NOT** use Redis for scheduler locking, even if available.
> See [Architecture > Scheduler Concurrency & Locking Strategy](./ARCHITECTURE.md#scheduler-concurrency--locking-strategy) for details.

## Configuration Reference

| Variable                      | Default     | Description                                      |
| ----------------------------- | ----------- | ------------------------------------------------ |
| `IN_APP_SCHEDULER_ENABLED`    | `false`     | Enable the in-app scheduler                      |
| `SCHEDULER_MODE`              | `cron`      | `cron` (production) or `uptime-based` (dev only) |
| `SCHEDULER_EVERY_MINUTE_CRON` | `* * * * *` | Cron expression for every-minute jobs            |
| `SCHEDULER_DAILY_CRON`        | `0 3 * * *` | Cron expression for daily maintenance            |
| `SCHEDULER_TIMEZONE`          | `UTC`       | Timezone for cron expressions                    |

## Anti-Patterns

### ❌ "Every 24h since start"

```javascript
// BAD - schedule drifts on restarts
setInterval(() => runCleanup(), 24 * 60 * 60 * 1000);
```

### ❌ Reactive cleanup

```javascript
// BAD - cleanup coupled to domain events
onUserDeleted(async (user) => {
  await cleanupUserData(user); // Should be scheduled, not reactive
});
```

### ❌ In-memory flags for testing

```javascript
// BAD - hidden global state
let skipNextRun = false;

if (process.env.TEST && !skipNextRun) {
  await runJob();
}
```

### ❌ Cron-based testing

```javascript
// BAD - waiting for timing
it('should run cleanup', async () => {
  // Wait 61 seconds for the cron to trigger
  await sleep(61000);
  expect(cleanupRan).toBe(true);
});
```

## Best Practices

### ✅ Use cron expressions in production

```bash
SCHEDULER_MODE=cron
SCHEDULER_DAILY_CRON=0 3 * * *
```

### ✅ Test jobs explicitly

```bash
# Good - explicit execution
npm run job:cleanup
npm run job:notifications
```

### ✅ Keep jobs idempotent

```typescript
// Good - safe to run multiple times
async runCleanup() {
  // Delete records older than 90 days
  // If called twice, second call has nothing to delete
  await this.prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoffDate } }
  });
}
```

### ✅ Use low-traffic windows for maintenance

```bash
# Daily at 3 AM UTC (typically low traffic)
SCHEDULER_DAILY_CRON=0 3 * * *
```

## Relation to Phase 9

The scheduler executes Phase 9 infrastructure jobs:

| Job                 | Schedule    | Purpose                                |
| ------------------- | ----------- | -------------------------------------- |
| `every-minute`      | `* * * * *` | Process notifications, retry queue     |
| `daily-maintenance` | `0 3 * * *` | Cleanup audit logs, expired deliveries |

These are infrastructure-only jobs:

- ✅ Hygiene/cleanup
- ✅ Retry processing
- ✅ Notification delivery
- ❌ Not domain logic
- ❌ Not user-facing

## Migration from Uptime-Based

If you're currently using uptime-based scheduling:

1. Set `SCHEDULER_MODE=cron`
2. Configure cron expressions for desired times
3. Deploy during a low-traffic window
4. Jobs will run at the next scheduled time

No code changes required - the same services are called regardless of mode.

## External Scheduling (Option 7)

For advanced deployments, consider external scheduling:

| Solution           | Use Case               |
| ------------------ | ---------------------- |
| Kubernetes CronJob | K8s clusters           |
| AWS EventBridge    | AWS deployments        |
| Cloud Functions    | Serverless             |
| Dedicated worker   | High-volume processing |

To migrate:

1. Disable in-app scheduler: `IN_APP_SCHEDULER_ENABLED=false`
2. Configure external scheduler to call CLI scripts or HTTP endpoints
3. Same services are used - no code changes required

---

## Summary

| Mode           | When to Use          | Restart-Safe |
| -------------- | -------------------- | ------------ |
| `cron`         | Production, Staging  | ✅ Yes       |
| `uptime-based` | Local dev only       | ❌ No        |
| External cron  | Advanced deployments | ✅ Yes       |

**Remember**: Fixed clock-time scheduling is not optional for production.
Uptime-based scheduling exists only for development convenience.

