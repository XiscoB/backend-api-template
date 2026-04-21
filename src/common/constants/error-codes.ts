/**
 * Centralized error codes for the API.
 *
 * These codes are part of the stable v1 API contract.
 * Do not change existing codes without versioning consideration.
 *
 * Naming convention: DOMAIN_SPECIFIC_ERROR
 */
export enum ErrorCode {
  // Authentication errors (401)
  AUTH_UNAUTHORIZED = 'AUTH_UNAUTHORIZED',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',

  // Authorization errors (403)
  AUTH_FORBIDDEN = 'AUTH_FORBIDDEN',
  AUTH_INSUFFICIENT_PERMISSIONS = 'AUTH_INSUFFICIENT_PERMISSIONS',

  // Resource errors (404)
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',

  // Validation errors (400)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  VALIDATION_INVALID_INPUT = 'VALIDATION_INVALID_INPUT',

  // Conflict errors (409)
  CONFLICT = 'CONFLICT',
  CONFLICT_DUPLICATE = 'CONFLICT_DUPLICATE',

  // Server errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
}

/**
 * Map HTTP status codes to default error codes.
 */
export const HTTP_STATUS_TO_ERROR_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.AUTH_UNAUTHORIZED,
  403: ErrorCode.AUTH_FORBIDDEN,
  404: ErrorCode.RESOURCE_NOT_FOUND,
  409: ErrorCode.CONFLICT,
  500: ErrorCode.INTERNAL_ERROR,
};

/**
 * Get error code from HTTP status, with fallback.
 */
export function getErrorCodeFromStatus(status: number): ErrorCode {
  return HTTP_STATUS_TO_ERROR_CODE[status] ?? ErrorCode.INTERNAL_ERROR;
}
