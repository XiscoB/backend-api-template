# Delivery Contract

This document defines the contract for alert and report delivery via email.

It is authoritative and must be kept stable over time.

---

## Purpose

A shared delivery layer exists to:

- **Prevent duplication** across jobs and modules
- **Prevent recipient hardcoding** in job code
- **Guarantee fail-safe behavior** that never blocks schedulers
- **Keep alerts and reports consistent** in formatting and routing

All scheduled jobs that emit alerts or reports must use this layer.

---

## Delivery Guarantees (MUST)

The delivery layer guarantees the following:

- **Missing recipients never crash jobs.** If no recipients are configured, delivery silently skips with a WARN log.
- **Email delivery failures never block schedulers.** All failures are caught, logged, and returned as result objects.
- **Delivery services never throw.** Callers receive a result object indicating success or skip reason.
- **Rate-limiting is not handled here.** Jobs are responsible for their own rate-limiting logic.
- **Provider-agnostic by design.** The layer delegates to `EmailService` without assuming any specific provider.

---

## Recipient Groups

Recipient routing is controlled via a closed enum: `RecipientGroup`.

Adding a new group requires a conscious change in the delivery layer.

| RecipientGroup                | Env Var                                 | Purpose                                 |
| ----------------------------- | --------------------------------------- | --------------------------------------- |
| `INFRA_ALERTS`                | `INFRA_ALERT_RECIPIENTS`                | Infrastructure alerts (scheduler, jobs) |
| `PLATFORM_REPORTS`            | `PLATFORM_REPORT_RECIPIENTS`            | Platform reliability reports            |
| `NOTIFICATION_HEALTH_REPORTS` | `NOTIFICATION_HEALTH_REPORT_RECIPIENTS` | Notification delivery health reports    |
| `SAFETY_MODERATION_REPORTS`   | `SAFETY_MODERATION_REPORT_RECIPIENTS`   | Safety and moderation reports           |
| `GDPR_REPORTS`                | `GDPR_REPORT_RECIPIENTS`                | GDPR compliance reports                 |
| `WEEKLY_REPORTS`              | `WEEKLY_REPORT_RECIPIENTS`              | Weekly growth and activity reports      |

### Behavior When Missing

- If the environment variable is missing or empty, `resolveGroup()` returns an empty array.
- A WARN log is emitted.
- The delivery service returns `{ sent: false, skippedReason: 'no_recipients' }`.
- No exception is thrown.

**Jobs must never parse environment variables directly.** All recipient resolution goes through `RecipientGroupService`.

---

## Delivery Entry Points

### AlertDeliveryService

Use for: Infrastructure alerts, safety alerts, job failure notifications.

```typescript
await alertDeliveryService.sendAlert({
  recipientGroup: RecipientGroup.INFRA_ALERTS,
  severity: 'CRITICAL', // CRITICAL | WARNING | INFO
  title: 'Job Not Running',
  htmlBody: '<p>Details...</p>',
});
```

**Input:**

- `recipientGroup`: Target recipient group
- `severity`: Alert severity level
- `title`: Alert title (appears in subject)
- `htmlBody`: Pre-formatted HTML body

**Guarantees:**

- Never throws
- Returns `AlertDeliveryResult` with `sent`, `skippedReason`, and `recipientCount`
- Adds standard footer automatically

---

### ReportDeliveryService

Use for: Periodic reports, compliance summaries, health dashboards.

```typescript
await reportDeliveryService.sendReport({
  recipientGroup: RecipientGroup.WEEKLY_REPORTS,
  reportType: 'Weekly Growth Report',
  periodStart: new Date('2026-01-20'),
  periodEnd: new Date('2026-01-27'),
  htmlBody: '<p>Report content...</p>',
});
```

**Input:**

- `recipientGroup`: Target recipient group
- `reportType`: Report type (appears in subject)
- `periodStart`: Report period start date
- `periodEnd`: Report period end date
- `htmlBody`: Pre-formatted HTML body

**Guarantees:**

- Never throws
- Returns `ReportDeliveryResult` with `sent`, `skippedReason`, and `recipientCount`
- Adds standard footer automatically

---

## Formatting Rules

Shared formatting rules enforced by `EmailFormatUtils`:

- **Alert subjects:** `[ALERT][SEVERITY] Title`
- **Report subjects:** `[WEEKLY REPORT] Report Type - Date`
- **Footer:** `<hr /><small>Generated at: ISO timestamp</small>`

### Content Rules

- No emojis
- No marketing language
- No product-specific content
- No localization
- Neutral, technical tone
- Plain, scannable HTML

Formatting utilities are intentionally simple. They perform mechanical transformations and contain no business logic.

---

## Explicit Non-Goals

This layer does **not** handle:

- **Retries:** Failed deliveries are logged but not retried
- **Analytics:** No tracking or metrics collection
- **Unsubscribe logic:** No opt-out handling
- **User preferences:** No per-user delivery settings
- **Business logic:** No threshold evaluation or conditions
- **Alert thresholds:** Jobs determine when to alert, not this layer

---

## Integration Rules

Jobs integrating with this layer must follow these rules:

1. **Jobs emit semantic events.** The job determines what happened and when to notify.
2. **Jobs call delivery services.** Use `AlertDeliveryService` or `ReportDeliveryService` directly.
3. **Jobs handle their own rate-limiting.** The delivery layer does not debounce or throttle.
4. **Jobs must not call `EmailService` directly.** All delivery goes through the delivery services.
5. **Jobs must not parse recipient env vars.** Use `RecipientGroupService.resolveGroup()`.

---

## Stability Note

This contract is intentionally boring.

Changes must favor backward compatibility over convenience.
