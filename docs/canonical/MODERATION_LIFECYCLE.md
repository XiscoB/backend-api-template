> Documentation Layer: Canonical Contract

# Moderation Lifecycle

## Purpose

The moderation system enables a structured, human-centric workflow for identifying, reviewing, and addressing potentially abusive content or behavior. It allows reporters to flag specific entities (users or content) for review without triggering immediate enforcement.

This system is designed to be **manual-first**, prioritizing human judgment over automated enforcement. This ensures that context, intent, and nuance are considered before any punitive action is taken, protecting users from false positives inherent in purely algorithmic moderation.

## Actors

### Reporter

The entity initiating the report. This can be:

- **User**: An end-user flagging content they believe violates community standards.
- **System**: An automated heuristic or internal tool flagging anomalies for human review (e.g., rate-limit spikes).

### Moderator / Administrator

The human agent responsible for reviewing pending reports. The Moderator has the authority to:

- Review report details and snapshots.
- Determine the validity of the report.
- Resolve the report state.

### System (Observer)

The underlying platform acts purely as an observer and record-keeper during the lifecycle. It does not:

- Automatically hide content based on report volume.
- Automatically suspend users based on report validity.
- Alter the report state without explicit Moderator action.

## Lifecycle Stages

### 1. Report Creation

A report is generated when a Reporter flags an Identity or a specific piece of content. At this stage:

- The report is persisted with a link to the Reporter and the Reported Identity.
- Where applicable, a snapshot of the content validation state is captured to preserve context even if the original content is edited or deleted later.
- The report enters the system as **Unresolved**.

### 2. Pending Review

The report resides in a queue visible to Moderators.

- It remains in an open state effectively until a Moderator claims or acts upon it.
- No side effects (shadow-banning, hiding) occur during this phase.
- The reported user handles their account normally unless independent administrative action (outside this lifecycle) is taken.

### 3. Resolution

A Moderator reviews the evidence and makes a binary determination regarding the report's validity.

- **Valid Resolution**: The Moderator confirms the report was accurate and a violation occurred. This closes the report but does not inherently trigger a penalty; it merely records the violation confirmation.
- **Invalid Resolution**: The Moderator determines the report was inaccurate, mistaken, or malicious. This closes the report and exonerates the reported content/user for this specific instance.

### 4. Post-Resolution State

Once resolved, the report is finalized.

- It is removed from the active review queue.
- It becomes an immutable part of the history for both the Reporter (reporting history) and the Reported Identity (violation history).
- It is retained for auditability and pattern analysis.

## Design Guarantees

### No Automatic Enforcement

The reporting system is strictly decoupled from enforcement logic. A "Valid" resolution does not automatically trigger a suspension, ban, or content removal. All enforcement actions are separate, deliberate choices made by administrators.

### No Irreversible Actions

The moderation lifecycle tracks status (Open -> Closed) and validity (Valid/Invalid). It does not perform destructive actions on data.

### Full Auditability

Every report acts as a permanent record. Who reported, who was reported, who resolved it, and when it was resolved generally remains accessible for audit trails, ensuring accountability for both reporters and moderators.

### Identity-Based Accountability

All actions are rooted in the Identity system. Reports are not anonymous from the system's perspective; they are always attributable to a persistent Identity, preventing abuse of the reporting mechanism itself.

## Explicit Non-Goals

The moderation lifecycle strictly does **not**:

- **Define Content Policy**: It provides the mechanism for reporting, not the rules for what is allowed.
- **Provide Automated Filtering**: It does not pre-scan text or images for profanity or illegal content.
- **Manage Statutory Retention**: While it retains report history, it is not a compliance archive for legal holds or GDPR subject access requests (though it may interact with those systems).
- **Handle Appeals**: The lifecycle ends at resolution. Dispute resolution or appeals are separate workflows outside this specific distinct lifecycle.

