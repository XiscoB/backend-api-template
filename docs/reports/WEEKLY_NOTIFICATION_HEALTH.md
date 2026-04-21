# Weekly Notification Health Report

Weekly, informational report about the health of the notification system. Observational only — not an alerting mechanism.

## Metrics

1. **Notification Volume** - Total created, breakdown by type, WoW trend
2. **Delivery Outcomes** - SENT/FAILED/SKIPPED counts, failure rate with trend
3. **Channel Usage** - EMAIL/PUSH/NONE distribution with percentages
4. **Failure Analysis** - Top failing event types and grouped reasons
5. **Configuration Health** - Email channel states explaining silent skips

> [!NOTE]
> Configuration Health counts are identity-based, not per-email-channel.

## Key Files

| File                                                                            | Purpose          |
| ------------------------------------------------------------------------------- | ---------------- |
| `src/modules/reports/jobs/weekly-notification-health-report.job.ts`             | Main job         |
| `src/infrastructure/scheduler/schedules/weekly-notification-health.schedule.ts` | Schedule factory |
| `src/modules/notifications/adapters/admin-email.hook.ts`                        | Email handler    |

## Configuration

| Variable                                 | Default      | Description            |
| ---------------------------------------- | ------------ | ---------------------- |
| `WEEKLY_NOTIFICATION_HEALTH_REPORT_CRON` | `0 10 * * 1` | Mondays at 10:00       |
| `NOTIFICATION_HEALTH_REPORT_RECIPIENTS`  | _(required)_ | Comma-separated emails |

## Email Semantics

The report includes clarifying notes:

- **SKIPPED**: No delivery attempt was made (e.g. no active channels or notifications disabled), not a delivery failure.
- **Active channel**: `enabled=true` for transactional notifications (`promoEnabled` irrelevant).

## Data Sources

Read-only from:

- `NotificationLog`
- `NotificationDeliveryLog`
- `UserEmailChannel`
