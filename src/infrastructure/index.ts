/**
 * Infrastructure module exports.
 *
 * Infrastructure components provide cross-cutting concerns
 * that are not domain-specific:
 * - Email delivery
 * - Cleanup jobs (hygiene-only)
 * - Scheduler (in-app background job execution)
 * - Caching (future)
 * - Queue management (future)
 */

export * from './email';
export * from './cleanup';
export * from './scheduler';
