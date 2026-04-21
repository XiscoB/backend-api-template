> Documentation Layer: Canonical Contract

# Cron Observer Pattern

## Overview

The Cron Observer Pattern defines a strict architectural role for scheduled background processes in backend-base. An "Observer" is a scheduled job that monitors system state, aggregates data, or triggers external notifications based on existing data, without modifying the primitive data it observes.

This pattern exists to separate the concern of _monitoring_ from the concern of _lifecycle management_. It ensures that reporting and alerting mechanisms remain passive and do not inadvertently drive domain state, causing side effects that mask the true source of state changes.

## Observer vs Actor

The distinction between an Observer and an Actor is absolute:

- **Observer (Read-Only)**: Inspects the system state to derive insights or trigger secondary effects (like emails). It must never change the status of the entities it queries.
- **Actor (Read-Write)**: Performs state transitions, enforcement, cleanup, or data mutation. Actors drive the domain lifecycle.

Mixing these roles is dangerous. An Observer that also modifies state (e.g., "Email this user and then update their status to notified") creates tight coupling between the notification mechanism and the domain logic, making it difficult to retry failed notifications without risking double-state transitions or to change inspection logic without affecting business rules.

## Allowed Behaviors

Observers are permitted to perform the following actions:

- **Reading Data**: Querying databases or caches to identify records matching specific criteria (e.g., "find all unresolved reports old than 24 hours").
- **Aggregating Summaries**: Compiling statistics or trends from raw data into transient memory or read-only logs.
- **Triggering Notifications**: initiating communication channels (Email, Push) based on the observed state.
- **Logging**: Writing to operational logs (`InternalLog`) effectively as an append-only creation, which is considered a safe observation artifact, not a mutation of the observed domain entity.

## Forbidden Behaviors

Observers are explicitly forbidden from:

- **State Mutation**: Changing the status, validity, or properties of the primary domain entity they are observing.
- **Auto-Resolution**: Setting a flag to "processed" simply because an observation occurred.
- **Enforcement Actions**: Triggering bans, suspensions, or deletions directly. These belongs to Actors or human operators.
- **Domain Logic Execution**: Performing business rule validation that should happen at the service layer during state entry, rather than during passive observation.

## Common Use Cases

- **Moderation Digests**: Periodically querying for open reports and sending a summary email to administrators.
- **Operational Monitoring**: Checking for system health indicators or stalled workflows and alerting engineers.
- **Usage Summaries**: compiling weekly activity statistics for a user and sending a "Weekly Update" notification.

## Non-Goals

The Cron Observer Pattern is **not**:

- A replacement for event-driven architecture (queues/workers).
- A mechanism for "eventually consistent" data repair.
- A pattern for implementing batch processing logic (bulk updates).
- A license to bypass service-layer invariants for read performance.

