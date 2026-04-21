# Observability Overview

This document provides a map of the observability system in this backend template.
It explains what exists, why it exists, and who it serves.

---

## Purpose

Observability in this system is split by urgency and audience.

Not everything warrants an alert. Alerts are reserved for conditions that require immediate human attention. Overusing alerts creates noise, which leads to alert fatigue and eventually to ignored alerts.

Not everything warrants a report. Reports are for trends, patterns, and periodic confidence checks. They are informational, not reactive. They are scheduled, not triggered.

This separation is intentional. Mixing urgency levels or audiences in a single mechanism leads to one of two failure modes: either critical signals get buried in noise, or informational signals get escalated inappropriately.

---

## Observability Layers

### Immediate Alerts

**Purpose**: Detect urgent infrastructure failures that require prompt human intervention.

**Audience**: Developers and on-call engineers.

**Characteristics**:

- Rate-limited to prevent alert floods during cascading failures
- High signal-to-noise ratio by design
- Fail-safe: delivery failures do not block the systems being monitored
- Minimal context: only enough information to begin investigation

**Examples**:

- Scheduler and Cron Safety Alerts: Detects jobs that have stopped running, stale scheduler locks, or repeated job failures.
- External Site Availability Monitor: Checks configured external URLs and alerts on unreachable or failing endpoints.
- Notification Delivery Alerts: Detects high failure ratios or silent delivery skips in the notification pipeline.
- GDPR Pipeline Integrity Alerts: Monitors for stuck or stalled GDPR processing requests.

---

### Weekly Reports

**Purpose**: Provide trend visibility and operational confidence over time.

**Audience**: Developers, CTO, Executives, and Operations teams.

**Characteristics**:

- Informational and non-reactive
- Scheduled at fixed intervals, typically weekly
- Summarize activity and health metrics without requiring immediate action
- Self-contained: each report includes its own context and time boundaries

**Examples**:

- Weekly Platform Reliability Report: Summarizes scheduler health, job execution patterns, and internal log activity.
- Weekly Notification Health Report: Details notification volume, delivery outcomes, channel usage, and failure analysis.
- Weekly Safety and Moderation Report: Aggregates safety signals and moderation throughput.
- Weekly Growth Report: Summarizes user growth and activity trends.
- Weekly GDPR Compliance Report: Reports on data subject request processing and compliance status.

---

## What Is Explicitly Not Observed

This observability system does not include:

- **User analytics**: Tracking user behavior, engagement, or conversion funnels is a product concern, not an infrastructure concern.
- **Business KPIs**: Revenue metrics, customer acquisition costs, or other business performance indicators belong in dedicated analytics systems.
- **SLA enforcement**: This template does not track or enforce service level agreements. SLA monitoring requires purpose-built tooling with appropriate guarantees.
- **Uptime percentages**: Calculating availability percentages requires continuous, reliable measurement infrastructure that is outside the scope of this template.
- **Performance benchmarking**: Response time percentiles, throughput measurements, and performance regression detection require specialized APM tooling.

These are intentionally out of scope because:

1. They require different data collection mechanisms than operational monitoring.
2. They serve different stakeholders with different urgency profiles.
3. Mixing them with operational observability dilutes both.
4. They often require specialized tooling that is better provided by dedicated services.

---

## Design Principles

**Boring over clever**: Observability mechanisms use straightforward, predictable patterns. Novel approaches create maintenance burden and make debugging harder.

**Low noise over completeness**: It is better to miss an edge case than to flood recipients with irrelevant signals. Every alert and report should justify its existence.

**Separation of concerns**: Alerts and reports are distinct systems with distinct purposes. Detection logic is separate from delivery logic. Formatting is separate from routing.

**Fail-safe everywhere**: Observability failures must never block the systems being observed. If an alert cannot be sent, the system logs the failure and continues. If a report cannot be generated, the job completes without crashing.

**Environment-driven configuration**: Recipients, thresholds, and schedules are controlled via environment variables. No code changes are required to adjust operational parameters.

---

## Adding a New Observability Component

When adding a new observability mechanism, follow this checklist:

1. **Determine the urgency**: Is this detecting a condition that requires immediate attention, or is it summarizing a trend?
   - Immediate attention: implement as an alert
   - Trend or periodic check: implement as a report

2. **Identify the audience**: Who needs to receive this? The answer determines which recipient group to use.

3. **Reuse existing recipient groups**: Do not create new recipient configurations unless the audience is genuinely distinct from existing groups.

4. **Use established delivery infrastructure**: Alerts go through the alert delivery service. Reports go through the report delivery service. Do not create parallel delivery paths.

5. **Add tests**: Every alert condition and report generation path should have unit tests that verify behavior without sending actual emails.

6. **Document the component**: Update relevant documentation to describe what the new component monitors, when it triggers, and who receives it.

---

## Stability Statement

Observability changes slowly in this system. Stability and predictability are more valuable than novelty or optimization.

Adding a new alert or report requires justification. Removing or modifying existing ones requires even more justification, because operators and stakeholders develop expectations based on what they receive.

Consistency is more important than novelty. If existing patterns are imperfect but working, they are preferable to theoretically better approaches that require retraining operators.

Duplication is preferred over hidden coupling. If two systems need similar observability, it is acceptable for each to have its own dedicated alerting or reporting rather than sharing infrastructure in ways that create implicit dependencies.
