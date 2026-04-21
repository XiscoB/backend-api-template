import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';

/**
 * Authentication module.
 *
 * IMPORTANT: This module handles JWT VALIDATION only.
 * It does NOT handle:
 * - Login/logout
 * - Token issuance
 * - Token refresh
 * - Password management
 *
 * All of the above are handled by the external identity provider.
 * The backend only validates incoming JWTs and extracts user claims.
 *
 * @see docs/canonical/AUTH_CONTRACT.md
 */
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
