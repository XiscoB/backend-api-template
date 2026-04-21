> Documentation Layer: Canonical Contract

# Report Table Documentation

## Overview

A provider-agnostic, identity-centric `Report` table has been implemented. It serves as a foundational primitive for moderation and abuse reporting workflows, allowing users and systems to flag content or identities without coupling the moderation logic to specific authentication providers or business domains.

## Design Principles

- **Provider-Agnostic Authentication**: The system does not depend on specific external IDP identifiers. It links primarily to internal `Identity` UUIDs.
- **Identity as Ownership Root**: All reporting relationships (reporter, reported user, resolver) are resolvable solely through the `Identity` table.
- **Domain Decoupling**: Content is referenced via opaque IDs (`reportedContentId`) and discriminator strings (`contentType`), avoiding foreign keys to domain-specific tables.
- **Manual Moderation Support**: The schema facilitates human-in-the-loop workflows (resolution timestamps, resolver identity) but does not enforce specific moderation policies.
- **Explicit Deployment**: State transitions are strictly tracked via fields (resolution status, validation outcome), avoiding implicit behavior.

## Report Model

The `Report` model (`reports`) maintains strict lifecycle management for moderation requests.

### Core Fields

- **`id`**: Unique UUID for the report.
- **`reporterIdentityId`**: (UUID) Reference to the `Identity` filing the report.
- **`reportedIdentityId`**: (Optional UUID) Reference to the `Identity` being reported.
- **`category`**: (String) High-level reason for the report (e.g., "spam", "harassment").
- **`details`**: (Optional String) Detailed user-provided explanation.
- **`reportedContentId`**: (Optional String) Opaque identifier of the specific content (e.g., post ID, comment ID).
- **`contentType`**: (String) Discriminator string separating content types (e.g., "post", "comment").
- **`source`**: (String) Origin of the report (e.g., "user", "system", "admin").

### Moderation Lifecycle

- **`resolved`**: (Boolean, default: `false`) The primary status flag. `false` indicates an open report; `true` indicates a closed/processed report.
- **`valid`**: (Optional Boolean) The outcome of the resolution:
  - `null`: Pending review.
  - `true`: Valid report (violation confirmed).
  - `false`: Invalid report (dismissed/spam).
- **`resolvedAt`**: (Optional DateTime) Timestamp when the report was resolved.
- **`resolvedByIdentityId`**: (Optional UUID) Reference to the administrator/moderator who resolved the report.

### Snapshots & Metadata

- **`reportedContentSnapshot`**: (Optional JSON) Best-effort capture of the content state at the time of reporting.
- **`reportedUserSnapshot`**: (Optional JSON) Best-effort capture of the reported user's profile at the time of reporting.
- **`deletedAt`**: (Optional DateTime) Timestamp for soft-deletion, preserving the record for audit/legal holds.
- **`createdAt`**: (DateTime) Timestamp of report creation.
- **`updatedAt`**: (DateTime) Timestamp of last update.

## Identity Relations

The `Identity` model includes reverse relations for efficient access:

- **`reportsFiled`**: (`Report[]`) Reports created by the identity. Useful for detecting abuse of the reporting system.
- **`reportsReceived`**: (`Report[]`) Reports filed against the identity. Useful for assessing moderation history.
- **`reportsResolved`**: (`Report[]`) Reports resolved by the identity. Useful for administrator audit trails.

## Indexing

Prisma indexes (`@@index`) support specific operational access patterns:

- **`[resolved, valid]`**: Optimized for moderation queues fetching unresolved or unvalidated reports.
- **`[createdAt]`**: Optimized for chronological sorting and SLA monitoring.
- **`[reporterIdentityId]`**: Optimized for looking up a user's reporting history.
- **`[reportedIdentityId]`**: Optimized for checking a user's standing.

## Non-Goals

The schema implementation explicitly avoids:

- **Authorization Logic**: Access control (who can report, who can resolve) is application-layer logic.
- **Auto-Moderation**: The schema stores state but does not define rules for automated banning or muting.
- **Strict Enums**: `category` and `contentType` are strings to allow application-level evolution without database migrations.
- **External ID Storage**: No external identifiers (e.g., Auth0 `sub`) are stored in the report.

## Operational Flow

The following flow describes the intended usage of the schema fields:

### 1. Creation

- **Action**: A user or system creates a report.
- **Inputs**: `reporterIdentityId`, `category`, `details`, `contentType`, and optional `reportedContentId`.
- **State**: `resolved: false`, `valid: null`.

### 2. Resolution

- **Action**: An administrator reviews and acts on the report.
- **Updates**:
  - Sets `resolved` to `true`.
  - Sets `valid` to `true` (violation) or `false` (no violation).
  - Populates `resolvedAt` and `resolvedByIdentityId`.
- **Constraint**: This status change effectively removes the item from the open moderation queue.

### 3. Background Analysis

- **Pattern**: Scheduled jobs (e.g., cron) can query for `resolved: false` items to generate digests.
- **Audit**: Operational summaries can be logged to `InternalLog` without modifying the report state.

