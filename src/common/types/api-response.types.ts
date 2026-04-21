/**
 * Response types for the API.
 *
 * These types define the stable v1 API contract for all responses.
 * Do not change without versioning consideration.
 */

/**
 * Metadata included in all responses.
 */
export interface ResponseMeta {
  /** Unique request identifier for tracing */
  requestId?: string;

  /** ISO timestamp of the response */
  timestamp: string;
}

/**
 * Standard success response envelope.
 *
 * All successful API responses (except health checks) are wrapped in this format.
 *
 * @example
 * {
 *   "data": { "id": "123", "name": "John" },
 *   "meta": { "requestId": "abc-123", "timestamp": "2024-01-01T00:00:00.000Z" }
 * }
 */
export interface ApiResponse<T> {
  /** The response payload */
  data: T;

  /** Response metadata */
  meta?: ResponseMeta;
}

/**
 * Error details structure.
 */
export interface ApiErrorDetails {
  /** Machine-readable error code */
  code: string;

  /** Human-readable error message */
  message: string;

  /** Additional error details (validation errors, etc.) */
  details?: unknown;
}

/**
 * Standard error response format.
 *
 * All error responses follow this format.
 *
 * @example
 * {
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "message": "Invalid request payload",
 *     "details": { "fields": { "email": ["must be a valid email"] } }
 *   },
 *   "meta": { "requestId": "abc-123", "timestamp": "2024-01-01T00:00:00.000Z" }
 * }
 */
export interface ApiErrorResponse {
  /** Error information */
  error: ApiErrorDetails;

  /** Response metadata */
  meta?: ResponseMeta;
}

/**
 * Validation error details with field-grouped messages.
 *
 * @example
 * {
 *   "fields": {
 *     "displayName": ["must be a string", "must not be empty"],
 *     "email": ["must be a valid email"]
 *   }
 * }
 */
export interface ValidationErrorDetails {
  /** Field names mapped to arrays of error messages */
  fields: Record<string, string[]>;
}

/**
 * Conflict error details.
 *
 * @example
 * {
 *   "field": "externalUserId"
 * }
 */
export interface ConflictErrorDetails {
  /** The field that caused the conflict */
  field?: string;
}
