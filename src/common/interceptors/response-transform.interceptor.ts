import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { ApiResponse } from '../types/api-response.types';

/**
 * Metadata key for skipping response wrapping.
 */
export const SKIP_RESPONSE_WRAP_KEY = 'skipResponseWrap';

/**
 * Response Transform Interceptor.
 *
 * Wraps all successful responses in the standard API envelope:
 * {
 *   data: T,
 *   meta: { requestId?: string, timestamp: string }
 * }
 *
 * Use @SkipResponseWrap() decorator to skip wrapping for specific endpoints
 * (e.g., health checks).
 */
@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T> | T> {
    // Check if response wrapping should be skipped
    const skipWrap = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_WRAP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipWrap) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = this.getRequestId(request);

    // Skip wrapping for non-JSON content types (streams, files, etc.)
    const contentType = response.getHeader('content-type');
    if (
      contentType &&
      typeof contentType === 'string' &&
      !contentType.includes('application/json')
    ) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data: T) => {
        // Pass through null/undefined
        if (data === null || data === undefined) {
          return data;
        }

        // Skip wrapping for streams, buffers, and non-plain objects
        if (this.shouldSkipWrapping(data)) {
          return data;
        }

        // If data is already wrapped (has 'data' and 'meta' keys), don't double-wrap
        if (this.isAlreadyWrapped(data)) {
          return data;
        }

        const response: ApiResponse<T> = {
          data,
          meta: {
            ...(requestId && { requestId }),
            timestamp: new Date().toISOString(),
          },
        };

        return response;
      }),
    );
  }

  /**
   * Check if response is already in the wrapped format.
   */
  private isAlreadyWrapped(data: unknown): boolean {
    if (data === null || typeof data !== 'object') {
      return false;
    }

    const obj = data as Record<string, unknown>;
    return 'data' in obj && 'meta' in obj;
  }

  /**
   * Check if data should skip wrapping.
   *
   * Skips wrapping for:
   * - Streams (ReadableStream, Node.js streams)
   * - Buffers
   * - Non-plain objects that shouldn't be JSON-serialized
   */
  private shouldSkipWrapping(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    // Skip Buffer instances
    if (Buffer.isBuffer(data)) {
      return true;
    }

    // Skip streams (check for common stream properties)
    if ('pipe' in data && typeof (data as Record<string, unknown>).pipe === 'function') {
      return true;
    }

    // Skip ReadableStream (Web Streams API)
    if ('getReader' in data && typeof (data as Record<string, unknown>).getReader === 'function') {
      return true;
    }

    return false;
  }

  /**
   * Get request ID from headers.
   */
  private getRequestId(request: Request): string | undefined {
    const requestId =
      request.headers['x-request-id'] ??
      request.headers['x-correlation-id'] ??
      request.headers['request-id'];

    if (typeof requestId === 'string') {
      return requestId;
    }

    return undefined;
  }
}
