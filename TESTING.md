# Testing in Backend Base

This repository follows an **infra-first, log-centric** testing philosophy.
We prioritize **integration tests** over unit tests because our core logic relies on database state, invariants, and side-effects (logs) rather than in-memory transformations.

## 1. Testing Philosophy

### Why Integration Tests?

The complexity of this backend lies in **state transitions** and **data integrity**, not algorithmic complexity.

- **Unit tests** are used _only_ for pure functions (e.g., date calculations, regex parsers).
- **Integration tests** are the standard. They boot the NestJS application (or a subset of modules) and interact with a **real database**.

Integration tests may be slower than unit tests; this is an accepted tradeoff for correctness and invariant enforcement.

### Real Infrastructure (No Mocks for Data)

We do **NOT** mock the database (Prisma).

- Mocks hide schema mismatches.
- Mocks fail to catch foreign key constraint violations.
- Mocks cannot verify complex queries or transactions.

We **DO** mock external providers (Email, Push, S3).

- We test that we _attempted_ to send an email (by checking the call to the adapter).
- We do _not_ test that AWS SES actually received it.

### What We Test

1.  **Invariants**: "Cron is the sole writer of logs."
2.  **State**: "Creating a request sets status to PENDING."
3.  **Side-Effects**: "Processing a notification creates a delivery log."

### What We Do NOT Test

1.  **Provider Behavior**: We assume SendGrid/Expo works.
2.  **Infra Timing**: We do not test that a cron runs exactly at 00:00. We test what happens _when_ it runs.

---

## 2. Environment Requirements

Tests **MUST** run against a real PostgreSQL database.
You cannot run tests without a configured environment.

### Required Variables

| Variable       | Value              | Reason                                                                   |
| :------------- | :----------------- | :----------------------------------------------------------------------- |
| `NODE_ENV`     | `test`             | Ensures we don't accidentally run prod logic or connect to prod hooks.   |
| `DATABASE_URL` | `postgresql://...` | **MUST** point to a dedicated test database (e.g., `backend_base_test`). |

> [!WARNING]
> **NEVER** use your development or production database for testing. Tests often wipe tables (`TRUNCATE` or `deleteMany`) before running.

### Example Setup (Shell Agnostic)

Environment variable syntax differs between PowerShell and Bash.

In your `.env.test` (or manually exported):

```bash
# .env.test
NODE_ENV=test
DATABASE_URL="postgresql://user:password@localhost:5432/backend_base_test?schema=public"
```

Running via CLI:

```bash
# Powershell
$env:DATABASE_URL="postgresql://..."; npm test

# Bash
DATABASE_URL="postgresql://..." npm test
```

---

## 3. Database & Prisma Expectations

The Prisma schema is a strict contract. Tests ensure that your code obeys the schema.

### Workflow

1.  **Schema Drift**: If `schema.prisma` changes, tests _will_ fail until the test DB is updated.
2.  **Migrations**: You must apply migrations to the test database before running tests.

### Commands

```bash
# 1. Update generated client
npm run prisma:generate

# 2. Push schema to TEST database (destructive, creates tables)
# ensure DATABASE_URL points to the TEST DB!
npm run prisma:migrate:deploy
```

If tests crash with "Table not found", you forgot to migrate the test database.

---

## 4. Integration Test Structure

Integration tests live alongside the code in `src/`, typically named `*.spec.ts`.
End-to-End (HTTP) tests live in `test/` and use `supertest`.

### Anatomy of an Integration Test

We use `Test.createTestingModule` to spin up a partial app.

```typescript
// src/modules/example/example.service.spec.ts
describe('Example Integration', () => {
  let prisma: PrismaService;
  let service: ExampleService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule], // Or specific modules
    }).compile();

    app = module.createNestApplication();
    await app.init();

    // Resolve real services
    prisma = module.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    // CLEAN SLATE: Wipe relevant tables
    await prisma.exampleEntity.deleteMany();
  });

  it('writes to the database', async () => {
    await service.doSomething();
    const result = await prisma.exampleEntity.count();
    expect(result).toBe(1);
  });
});
```

### Why Manual Provider Construction?

Sometimes we avoid importing the full `AppModule` if we want to isolate a specific behavior or inject a custom provider mock (e.g., mocking the `EmailAdapter` while keeping the `NotificationsService` real).

---

## 5. Notification System Tests (Worked Example)

Ref: `src/modules/notifications/notifications-system.spec.ts`

This is our gold standard for invariant testing. It validates the pipeline:
**Intent → Cron → Delivery → Audit**

### The Invariants being tested:

1.  **Intent**: Calling `notify()` writes a `ScheduledNotification` to DB. It does _not_ send an email.
2.  **Materialization**: The Cron job reads `ScheduledNotification`, locks it, and creates a `NotificationLog`.
    - _Why?_ Because the Cron is the **sole writer** of history.
3.  **Delivery**: A limitation of the system. Delivery (Email/Push) is a **side-effect** of the `NotificationLog` appearing.
4.  **Audit**: We assert that `NotificationDeliveryLog` was created.

### How the test asserts this:

Instead of checking "did the function return true?", the test checks the **database state**:

```typescript
// 1. Trigger Action
await notificationsService.createScheduled({ ... });

// 2. Assert DB State (Intent)
const scheduled = await prisma.scheduledNotification.findFirst();
expect(scheduled.status).toBe('PENDING');

// 3. Run Cron Manually
await cronService.processPendingNotifications();

// 4. Assert DB State (Materialization)
const log = await prisma.notificationLog.findFirst();
expect(log).toBeDefined();

// 5. Assert Mock Call (Side Effect)
expect(mockEmailAdapter.send).toHaveBeenCalled();
```

---

## 6. Common Failures & Debugging

### `P1001: Can't reach database server`

- **Cause**: `DATABASE_URL` is missing or incorrect.
- **Fix**: Check your `.env` or shell variables. Ensure Postgres is running.

### `Relation "Table" does not exist`

- **Cause**: You connected to the DB, but it's empty.
- **Fix**: Run `prisma migrate deploy` against the test DB.

### `Nest cannot resolve dependency`

- **Cause**: You imported a Service but forgot its Module or Provider in `Test.createTestingModule`.
- **Fix**: Add the missing provider or import the module containing it.

### Random Flakiness

- **Cause**: Tests interacting with each other via shared DB state.
- **Fix**: Ensure `beforeEach` cleans up **all** tables touched by the test.

---

## 7. What Tests Must NOT Do

1.  **Do NOT test external APIs**:
    - Right: `expect(adapter.send).toHaveBeenCalled()`
    - Wrong: `await sendGrid.sendRealEmail()`
2.  **Do NOT rely on `setTimeout`**:
    - Avoid `await sleep(1000)`. Use deterministic checks or manual triggers (e.g., calling the cron method directly instead of waiting for the scheduler).
3.  **Do NOT test Framework internals**:
    - Don't test that `@Cron()` works. Test the **method** the cron calls.
4.  **Do NOT use production Data**:
    - Tests must create their own clean state (`uuidv4()` unique users) to avoid collisions and data leaks.
