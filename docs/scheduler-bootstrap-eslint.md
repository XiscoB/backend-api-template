# Fixed ESLint Async Violations in Scheduler Bootstrap

Addressed `require-await`, `no-floating-promises`, and `no-misused-promises` violations in [src/infrastructure/scheduler/scheduler.bootstrap.ts](file:///d:/DevStuff/backend-base-api/src/infrastructure/scheduler/scheduler.bootstrap.ts).

## Changes

- **[onApplicationShutdown](file:///d:/DevStuff/backend-base-api/src/infrastructure/scheduler/scheduler.bootstrap.ts#100-133)**:
  - Removed `async` keyword to fix potential `require-await` issues.
  - Added `void` operator to `task.task.stop()` to safely handle the `void | Promise` return type without forcing an async context.
  - Added explanatory comment.

- **[registerCronSchedule](file:///d:/DevStuff/backend-base-api/src/infrastructure/scheduler/scheduler.bootstrap.ts#174-208)**:
  - Changed `cron.schedule` callback from `async` to synchronous wrapper.
  - Added `void` operator to `this.executeJob(schedule)` call to explicitly ignore the promise, fixing `no-floating-promises` and `no-misused-promises`.

## Verification

### Automated Tests

Ran ESLint on the file:

```bash
npx eslint src/infrastructure/scheduler/scheduler.bootstrap.ts
```

Result: **Pass** (Exit code 0)

### Manual Verification

- Confirmed `node-cron` types define [stop()](file:///d:/DevStuff/backend-base-api/node_modules/node-cron/dist/cjs/tasks/scheduled-task.d.ts#29-30) as `void | Promise<void>`, justifying the use of `void` operator to handle both cases safely.
