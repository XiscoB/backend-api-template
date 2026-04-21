import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * JWT Authentication Guard.
 *
 * This guard is applied globally via APP_GUARD.
 * All routes require a valid JWT by default.
 *
 * To make a route public, use the @Public() decorator.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Proceed with JWT validation
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: Error | null, user: TUser | false, info: Error | undefined): TUser {
    // Debug logging for JWT errors
    if (err ?? !user) {
      this.logger.debug(
        `JWT validation failed - err: ${err?.message}, info: ${info?.name} - ${info?.message}`,
      );
    }

    if (err) {
      this.logger.warn(`JWT error: ${err.message}`);
      throw err;
    }

    if (!user) {
      // Provide helpful error messages
      if (info?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token has expired');
      }
      if (info?.name === 'JsonWebTokenError') {
        this.logger.warn(`JsonWebTokenError: ${info.message}`);
        throw new UnauthorizedException('Invalid token');
      }
      if (info?.message === 'No auth token') {
        throw new UnauthorizedException('No authorization token provided');
      }
      this.logger.warn(`Auth failed - info: ${JSON.stringify(info)}`);
      throw new UnauthorizedException('Authentication required');
    }

    return user;
  }
}
