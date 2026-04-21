import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCode, getErrorCodeFromStatus } from '../constants/error-codes';
import {
  ApiErrorResponse,
  ValidationErrorDetails,
  ConflictErrorDetails,
} from '../types/api-response.types';

/**
 * Global HTTP Exception Filter.
 *
 * Catches all exceptions and returns a standardized error response
 * following the v1 API contract.
 *
 * Response format:
 * {
 *   error: { code: string, message: string, details?: unknown },
 *   meta: { requestId?: string, timestamp: string }
 * }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, errorCode, message, details } = this.extractErrorInfo(exception);
    const requestId = this.getRequestId(request);

    const errorResponse: ApiErrorResponse = {
      error: {
        code: errorCode,
        message,
        ...(details !== undefined && { details }),
      },
      meta: {
        ...(requestId && { requestId }),
        timestamp: new Date().toISOString(),
      },
    };

    // Log based on severity
    this.logError(statusCode, request, message, exception);

    response.status(statusCode).json(errorResponse);
  }

  /**
   * Extract error information from the exception.
   */
  private extractErrorInfo(exception: unknown): {
    statusCode: number;
    errorCode: string;
    message: string;
    details?: unknown;
  } {
    // Handle HTTP exceptions from NestJS
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Determine error code based on exception type
      const errorCode = this.getErrorCodeFromException(exception, statusCode);

      // Extract message and details
      const { message, details } = this.parseExceptionResponse(exceptionResponse, exception);

      return { statusCode, errorCode, message, details };
    }

    // Handle Prisma errors
    if (this.isPrismaError(exception)) {
      return this.handlePrismaError(exception);
    }

    // Handle unknown errors - never expose internal details
    if (exception instanceof Error) {
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    } else {
      this.logger.error('Unhandled non-Error exception', String(exception));
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    };
  }

  /**
   * Get error code based on exception type.
   */
  private getErrorCodeFromException(exception: HttpException, statusCode: number): string {
    // Check for specific exception types
    if (exception instanceof UnauthorizedException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null) {
        const msg = (response as Record<string, unknown>).message;
        if (typeof msg === 'string') {
          if (msg.includes('expired')) return ErrorCode.AUTH_TOKEN_EXPIRED;
          if (msg.includes('invalid') || msg.includes('Invalid'))
            return ErrorCode.AUTH_TOKEN_INVALID;
        }
      }
      return ErrorCode.AUTH_UNAUTHORIZED;
    }

    if (exception instanceof ForbiddenException) {
      return ErrorCode.AUTH_FORBIDDEN;
    }

    if (exception instanceof NotFoundException) {
      return ErrorCode.RESOURCE_NOT_FOUND;
    }

    if (exception instanceof BadRequestException) {
      return ErrorCode.VALIDATION_ERROR;
    }

    if (exception instanceof ConflictException) {
      return ErrorCode.CONFLICT;
    }

    // Fall back to status-based mapping
    return getErrorCodeFromStatus(statusCode);
  }

  /**
   * Parse exception response to extract message and details.
   */
  private parseExceptionResponse(
    exceptionResponse: string | object,
    exception: HttpException,
  ): { message: string; details?: unknown } {
    if (typeof exceptionResponse === 'string') {
      return { message: exceptionResponse };
    }

    const responseObj = exceptionResponse as Record<string, unknown>;
    const message = this.extractMessage(responseObj, exception);

    // Handle validation errors (class-validator)
    if (Array.isArray(responseObj.message) && responseObj.message.length > 0) {
      const details = this.formatValidationErrors(responseObj.message);
      return { message: 'Invalid request payload', details };
    }

    return { message };
  }

  /**
   * Format validation errors into grouped field structure.
   *
   * Groups all validation messages by field name for cleaner client consumption.
   */
  private formatValidationErrors(messages: unknown[]): ValidationErrorDetails {
    const fields: Record<string, string[]> = {};

    for (const msg of messages) {
      if (typeof msg === 'string') {
        // Extract field name from message (e.g., "displayName must be...")
        const match = msg.match(/^(\w+)\s+(.+)$/);
        if (match) {
          const [, field, message] = match;
          if (!fields[field]) {
            fields[field] = [];
          }
          fields[field].push(message);
        } else {
          // Fallback for messages without field prefix
          if (!fields['_general']) {
            fields['_general'] = [];
          }
          fields['_general'].push(msg);
        }
      }
    }

    return { fields };
  }

  /**
   * Extract conflict details from Prisma meta.
   *
   * Safely extracts the field name that caused a unique constraint violation
   * without exposing raw Prisma internals.
   */
  private extractConflictDetails(meta?: Record<string, unknown>): ConflictErrorDetails {
    if (!meta) {
      return {};
    }

    // Prisma P2002 meta contains 'target' which is an array of field names
    const target = meta.target;
    if (Array.isArray(target) && target.length > 0 && typeof target[0] === 'string') {
      return { field: target[0] };
    }

    return {};
  }

  /**
   * Check if exception is a Prisma error.
   */
  private isPrismaError(exception: unknown): boolean {
    if (exception === null || typeof exception !== 'object') {
      return false;
    }

    const exceptionObj = exception as Record<string, unknown>;
    if (!('code' in exceptionObj) || typeof exceptionObj.code !== 'string') {
      return false;
    }

    return exceptionObj.code.startsWith('P');
  }

  /**
   * Handle Prisma-specific errors.
   */
  private handlePrismaError(exception: unknown): {
    statusCode: number;
    errorCode: string;
    message: string;
    details?: unknown;
  } {
    const prismaError = exception as { code: string; meta?: Record<string, unknown> };

    switch (prismaError.code) {
      case 'P2002': // Unique constraint violation
        return {
          statusCode: HttpStatus.CONFLICT,
          errorCode: ErrorCode.CONFLICT_DUPLICATE,
          message: 'Resource already exists',
          details: this.extractConflictDetails(prismaError.meta),
        };

      case 'P2025': // Record not found
        return {
          statusCode: HttpStatus.NOT_FOUND,
          errorCode: ErrorCode.RESOURCE_NOT_FOUND,
          message: 'Resource not found',
        };

      default:
        this.logger.error(`Prisma error: ${prismaError.code}`, JSON.stringify(prismaError));
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          errorCode: ErrorCode.INTERNAL_ERROR,
          message: 'Internal server error',
        };
    }
  }

  /**
   * Extract a user-friendly message from the exception response.
   */
  private extractMessage(response: Record<string, unknown>, exception: HttpException): string {
    if (typeof response.message === 'string') {
      return response.message;
    }

    if (Array.isArray(response.message) && response.message.length > 0) {
      // For validation errors, return stable generic message
      return 'Invalid request payload';
    }

    return exception.message || 'An error occurred';
  }

  /**
   * Get request ID from headers or generate placeholder.
   */
  private getRequestId(request: Request): string | undefined {
    // Check for common request ID headers
    const requestId =
      request.headers['x-request-id'] ??
      request.headers['x-correlation-id'] ??
      request.headers['request-id'];

    if (typeof requestId === 'string') {
      return requestId;
    }

    return undefined;
  }

  /**
   * Log error based on severity.
   */
  private logError(
    statusCode: number,
    request: Request,
    message: string,
    exception: unknown,
  ): void {
    const logMessage = `${statusCode} ${request.method} ${request.url} - ${message}`;

    if (statusCode >= 500) {
      if (exception instanceof Error) {
        this.logger.error(logMessage, exception.stack);
      } else {
        this.logger.error(logMessage);
      }
    } else if (statusCode >= 400) {
      this.logger.warn(logMessage);
    }
  }
}
