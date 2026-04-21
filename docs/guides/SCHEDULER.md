> Documentation Layer: Operational Guide

# Scheduler & Background Jobs

This backend includes a **provider-agnostic, scalable scheduler** for running background tasks.

## 🚀 Overview

The scheduler is designed to be:

- **Simple**: Just a cron dispatcher.
- **Scalable**: Uses DB-level locking (`scheduler_locks` table) to ensure jobs run effectively once across multiple instances.
- **Controllable**: Can be enabled/disabled via environment variables.

### Modes

1.  **CRON Mode** (Default, Production)
    - Uses standard cron expressions (e.g., `0 0 * * *`).
    - Jobs run at fixed wall-clock times.
    - Safe for production.

2.  **UPTIME-BASED Mode** (Dev/Test only)
    - Uses `setInterval` (e.g., `every minute`).
    - Approximates schedules based on app uptime.
    - **WARNING**: Causes drift on restarts. Use only for testing.

---

## ⚙️ Configuration

Control the scheduler via `.env`:

| Variable                   | Description                                                     | Default |
| :------------------------- | :-------------------------------------------------------------- | :------ |
| `IN_APP_SCHEDULER_ENABLED` | Master switch. Set `true` to enable scheduling in this process. | `false` |
| `SCHEDULER_MODE`           | `cron` or `uptime-based`.                                       | `cron`  |
| `SCHEDULER_TIMEZONE`       | Timezone for cron evaluation.                                   | `UTC`   |

---

## 🛠️ Managing Jobs

### 1. Built-in Jobs

| Job                | Schedule     | Description                                               |
| :----------------- | :----------- | :-------------------------------------------------------- |
| **Reports Digest** | Daily        | Checks for unresolved reports and emails admins (if > 0). |
| **Cleanup**        | Daily        | Deletes expired operational logs, GDPR data, etc.         |
| **Notifications**  | Every Minute | Retries failed notifications (email/push).                |

### 2. Running Jobs Manually

You can run individual jobs manually without waiting for the scheduler or booting the full app server. This is useful for testing and debugging.

Use the provided scripts:

```bash
# Run the Reports Digest job immediately
npm run build
node scripts/jobs/run-reports-digest.js
```

### 3. Adding a New Job

To add a new background task:

1.  **Create the Job Service**
    Create a standard NestJS provider with a `run()` method.

    ```typescript
    // src/modules/my-module/my.job.ts
    @Injectable()
    export class MyJob {
      async run() {
        console.log('Doing work...');
      }
    }
    ```

2.  **Add to a Schedule Factory**
    Register the job in `src/infrastructure/scheduler/schedules/`.
    - Use `daily.schedule.ts` for once-a-day tasks.
    - Use `every-minute.schedule.ts` for high-frequency tasks.

    _Example (`daily.schedule.ts`):_

    ```typescript
    export const createDailySchedule = (config, myJob: MyJob): Schedule => ({
      name: 'daily',
      cron: config.schedulerDailyCron,
      jobs: [
        async () => await myJob.run(), // <--- Add this
      ],
    });
    ```

3.  **Update `SchedulerModule`**
    Import your module and inject the job into the factory in `src/infrastructure/scheduler/scheduler.module.ts`.

---

## 📧 Testing Email Output

When running jobs that send emails (like Reports Digest), behavior depends on your `EMAIL_PROVIDER`:

- **`EMAIL_PROVIDER=console`** (Default):
  Emails are **logged to the terminal**.
  Look for: `[StubEmailAdapter] Sending email to: ...`

- **`EMAIL_PROVIDER=sparkpost` / `ses`**:
  Real emails are sent.

- **No Email?**:
  The Reports Digest job intentionally sends **nothing** if there are 0 unresolved reports.

