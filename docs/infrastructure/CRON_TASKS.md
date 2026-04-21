# Cron Tasks Reference

Single source of truth for all cron-scheduled tasks in the system.

---

## Purpose

This document provides a centralized reference for all scheduled jobs registered in the scheduler infrastructure.

Key points:

- All schedules are configurable via environment variables.
- Default schedules are safe but not mandatory. Deployments may override them.
- This document reflects defaults, not guarantees. Actual execution depends on configuration and infrastructure state.
- Every scheduled job uses DB-level locking to ensure single-instance execution.

---

## Cron Tasks Table

| Task Name                          | Job Class                                              | Default Schedule                 | Config Env Var                           | Purpose                                                                                 |
| ---------------------------------- | ------------------------------------------------------ | -------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| Notification Processing            | `NotificationsCronService.processPendingNotifications` | `* * * * *` (every minute)       | `SCHEDULER_EVERY_MINUTE_CRON`            | Processes pending notifications from the queue                                          |
| Scheduler Safety Alerts            | `SchedulerAlertsJob`                                   | `* * * * *` (every minute)       | `SCHEDULER_EVERY_MINUTE_CRON`            | Detects stalled jobs, stuck locks, and repeated errors; sends rate-limited infra alerts |
| Daily Cleanup                      | `CleanupCronService.runAllCleanups`                    | `0 3 * * *` (daily at 03:00 UTC) | `SCHEDULER_DAILY_CRON`                   | Runs infrastructure cleanup (logs, expired tokens, orphaned data)                       |
| Reports Digest                     | `ReportsDigestJob`                                     | `0 3 * * *` (daily at 03:00 UTC) | `SCHEDULER_DAILY_CRON`                   | Sends digest of unresolved reports (skips if none pending)                              |
| External Site Monitor              | `SiteMonitorJob`                                       | `*/5 * * * *` (every 5 minutes)  | `SITE_MONITOR_CHECK_CRON`                | Checks external URL availability; sends rate-limited alerts on failure                  |
| GDPR Integrity Monitor             | `GdprIntegrityMonitor`                                 | `0 * * * *` (hourly at :00)      | `GDPR_INTEGRITY_CRON`                    | Detects stale GDPR requests and audit inconsistencies                                   |
| GDPR Compliance Report             | `GdprComplianceReportJob`                              | `0 9 * * 1` (Mon 09:00 UTC)      | `WEEKLY_GDPR_COMPLIANCE_REPORT_CRON`     | Summarizes GDPR pipeline status and pending requests                                    |
| Weekly Growth Report               | `WeeklyGrowthReportJob`                                | `0 9 * * 1` (Mon 09:00 UTC)      | `WEEKLY_GROWTH_REPORT_CRON`              | User growth and activity trend summary                                                  |
| Weekly Platform Reliability Report | `WeeklyPlatformReliabilityReportJob`                   | `0 9 * * 1` (Mon 09:00 UTC)      | (hardcoded)                              | Scheduler health and internal log summary                                               |
| Weekly Notification Health Report  | `WeeklyNotificationHealthReportJob`                    | `0 10 * * 1` (Mon 10:00 UTC)     | `WEEKLY_NOTIFICATION_HEALTH_REPORT_CRON` | Notification volume, delivery outcomes, failure analysis                                |
| Weekly Safety & Moderation Report  | `WeeklySafetyModerationReportJob`                      | `0 11 * * 1` (Mon 11:00 UTC)     | `WEEKLY_SAFETY_MODERATION_REPORT_CRON`   | Safety signals and moderation throughput summary                                        |

---

## Scheduling Philosophy

Default schedules follow these principles:

1. **Alert jobs run frequently and are rate-limited.** Scheduler alerts and site monitor checks run every minute or every 5 minutes but throttle outbound alerts to prevent spam. Rate-limiting uses `InternalLog` as soft state with a 30-minute debounce window.

2. **Weekly reports are staggered.** Monday report jobs are scheduled at 09:00, 10:00, and 11:00 UTC to avoid simultaneous execution and reduce peak load.

3. **Heavy or IO-bound jobs are not scheduled simultaneously.** Daily cleanup and reports digest share a schedule but run sequentially within the same schedule execution.

4. **Schedules are conservative.** Defaults favor stability over freshness. Production deployments may adjust based on load characteristics.

5. **Hourly jobs run at minute 0.** The GDPR integrity monitor runs at the top of each hour to provide predictable execution timing.

---

## Configuration Notes

| Property                | Details                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Override mechanism**  | All cron expressions can be overridden via environment variables.                                                    |
| **Fallback behavior**   | Missing configuration falls back to the default values listed in the table above.                                    |
| **Invalid expressions** | Invalid cron expressions are handled gracefully. The scheduler logs an error but does not crash application startup. |
| **Timezone**            | All schedules use UTC by default. Override with `SCHEDULER_TIMEZONE`.                                                |
| **Master switch**       | The scheduler is disabled by default. Set `IN_APP_SCHEDULER_ENABLED=true` to enable.                                 |
| **Scheduler mode**      | Default is `cron` (clock-time). Alternative `uptime-based` mode is for dev/test only and causes drift on restart.    |

---

## Operational Notes

- **Scheduler lock.** Cron execution depends on the `SchedulerLock` table. Only one application instance executes each job at a time.

- **Lock acquisition.** Jobs acquire a lock before running and release it on completion. Lock TTL prevents deadlocks from crashed processes.

- **Delivery failures do not block jobs.** Alert and report jobs use fail-safe delivery. Email send failures are logged but do not prevent job completion.

- **Missing recipients.** If recipient configuration is empty (e.g., `INFRA_ALERT_RECIPIENTS`), alerts are logged but not sent. This is safe and intentional.

- **Rate-limiting.** Alert jobs (Scheduler Alerts, Site Monitor) use `InternalLog` entries to track recent alerts and avoid flooding.

- **Job isolation.** Each job within a schedule runs independently. An error in one job does not prevent subsequent jobs from executing.

---

## Non-Goals

This document does not:

- **Guarantee execution timing.** Actual execution depends on infrastructure availability, lock contention, and job duration.

- **Define SLAs or uptime guarantees.** Scheduled jobs are best-effort within the system.

- **Replace external monitoring systems.** This documents what the system schedules, not what external tools observe.

- **Describe business workflows.** This is a technical reference. For user-facing behavior, see domain-specific documentation.

- **Prescribe configuration.** Defaults are documented for reference. Production values are deployment-specific.
