# Scheduler

> Documentation Layer: Positioning / Architectural Framing

## Purpose

Scheduler behavior is designed for safe, deterministic background processing in multi-instance deployments.
The primary goal is correctness under horizontal scaling, not maximal throughput.

## Multi-Instance Concurrency Model

This backend assumes multiple instances may execute scheduler loops at the same time.
Scheduler safety therefore depends on explicit coordination and idempotent job behavior.

Core expectations:

- no race conditions in background processing,
- no implicit single-instance assumptions,
- no execution path that bypasses coordination.

## Idempotency Expectations

Scheduled job handlers must be idempotent at the service level.
Repeated invocation of the same logical work unit must not corrupt state or produce unsafe side effects.

Idempotency is required for resilience against:

- retries,
- instance restarts,
- lock expiry and reacquisition scenarios,
- partial infrastructure failures.

## Locking Strategy (Conceptual)

Concurrency coordination is explicit and must remain compatible with current repository contracts.

- Coordination is anchored in authoritative shared state.
- Lock acquisition governs whether a job proceeds or is skipped.
- Lock lifetime/expiry handling must prevent permanent deadlocks.
- Stale lock recovery is required to keep the system live.

If coordination cannot be established, the safe behavior is to skip execution rather than run unsafely.

## Horizontal Scaling Safety

Schedulers must remain safe when instance count increases.

- Production scheduling uses fixed wall-clock timing.
- Uptime-relative schedules are development-only behavior.
- Job safety properties must hold regardless of replica count.

This prevents schedule drift and duplicate unsafe execution after restarts.

## Failure Behavior

Failure semantics are explicit and defensive.

- Lock acquisition failure: skip the job cycle.
- Dependency failure: degrade safely with explicit signaling.
- Partial execution: rely on idempotent service behavior and retriable orchestration.

No failure mode should silently disable protection assumptions.

## Database and Redis Interaction

The database remains the authoritative domain state.
Redis may support coordination/caching/queueing patterns where configured, but scheduler safety assumptions must remain explicit and auditable.

Schedulers orchestrate service operations; they do not bypass service-layer invariants with ad hoc direct mutation patterns.

## Public Reference Objective Alignment

This scheduler model aligns with the public reference objective requirements:

- explicit concurrency safety,
- deterministic behavior under restart/scaling,
- safe failure modes,
- interview-defensible operational reasoning.

## Non-Negotiable Scheduler Statements

- No race conditions are acceptable.
- No unsafe background processing assumptions are acceptable.
