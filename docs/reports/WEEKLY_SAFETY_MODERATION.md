# Weekly Safety & Moderation Report

Weekly, observational report summarizing safety signals and moderation throughput for executives and operations. This report is informational only.

## Metrics

1. **Report Volume** - Total created, breakdown by contentType/category, WoW trend
2. **Moderation Throughput** - Resolved count, resolution rate, avg resolution time
3. **Moderation Backlog** - Unresolved reports with aging buckets (7d/14d/30d)
4. **Resolution Outcomes** - Valid (actionable), invalid (dismissed), pending
5. **Identity Safety Signals** - Aggregate counts of flagged/suspended/banned

> [!NOTE]
> Backlog includes reports where `resolved = false` regardless of age. Soft-deleted reports are excluded.

> [!NOTE]
> Identity signal counts reflect current state, not newly flagged this week.

## Key Files

| File                                                                          | Purpose          |
| ----------------------------------------------------------------------------- | ---------------- |
| `src/modules/reports/jobs/weekly-safety-moderation-report.job.ts`             | Main job         |
| `src/infrastructure/scheduler/schedules/weekly-safety-moderation.schedule.ts` | Schedule factory |
| `src/modules/notifications/adapters/admin-email.hook.ts`                      | Email handler    |

## Configuration

| Variable                               | Default      | Description            |
| -------------------------------------- | ------------ | ---------------------- |
| `WEEKLY_SAFETY_MODERATION_REPORT_CRON` | `0 11 * * 1` | Mondays at 11:00       |
| `SAFETY_MODERATION_REPORT_RECIPIENTS`  | _(required)_ | Comma-separated emails |

## Data Sources

Read-only from:

- `Report`
- `Identity`

## Non-Goals

This report does NOT:

- Infer intent or guilt
- Apply business-specific moderation rules
- Expose identity-level details
- Include alerts or thresholds
- Hard-code categories or content types
