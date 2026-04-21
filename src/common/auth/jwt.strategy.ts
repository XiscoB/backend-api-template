import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt, SecretOrKeyProvider } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { AppConfigService } from '../../config/app-config.service';
import { JwtPayload, AuthenticatedUser } from './auth.types';
import { filterToAppRoles } from '../constants/roles';

/**
 * JWT Strategy options with JWKS provider (RS256/ES256).
 */
interface JwksStrategyOptions {
  jwtFromRequest: ReturnType<typeof ExtractJwt.fromAuthHeaderAsBearerToken>;
  issuer: string;
  audience: string;
  algorithms: string[];
  secretOrKeyProvider: SecretOrKeyProvider;
}

/**
 * JWT Strategy options with static key (RS256/ES256 public key or HS256 secret).
 */
interface StaticKeyStrategyOptions {
  jwtFromRequest: ReturnType<typeof ExtractJwt.fromAuthHeaderAsBearerToken>;
  issuer: string;
  audience: string;
  algorithms: string[];
  secretOrKey: string;
}

/**
 * Build JWT strategy options based on configuration.
 *
 * Supports five modes:
 * 0. Scenario testing mode (static test public key) — test automation only
 * 1. HS256 with JWT secret (Supabase default)
 * 2. RS256 with static public key
 * 3. ES256 with static public key
 * 4. RS256/ES256 with JWKS (recommended for production)
 */
function buildStrategyOptions(
  configService: AppConfigService,
): JwksStrategyOptions | StaticKeyStrategyOptions {
  const algorithm = configService.jwtAlgorithm;

  // Option 0: Scenario testing mode with static test keys
  // SAFETY: scenarioTestingEnabled already checks !isProduction
  if (configService.scenarioTestingEnabled) {
    // eslint-disable-next-line no-console
    console.warn(
      '[JwtStrategy] ⚠️  SCENARIO TESTING MODE ENABLED ⚠️\n' +
        '  → Using static test public key for JWT validation\n' +
        '  → This mode accepts JWTs signed by scripts/dev/scenarios/lib/test-keys.js\n' +
        '  → DO NOT use in production!',
    );

    return {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      issuer: configService.scenarioTestIssuer!,
      audience: configService.scenarioTestAudience!,
      algorithms: ['RS256'],
      secretOrKey: configService.scenarioTestPublicKey!,
    };
  }

  const baseOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    issuer: configService.jwtIssuer,
    audience: configService.jwtAudience,
    algorithms: [algorithm],
  };

  // ─────────────────────────────────────────────────────────────
  // Algorithm/Key Mismatch Detection (Fail-Fast)
  // ─────────────────────────────────────────────────────────────

  // HS256 requires JWT_SECRET
  if (algorithm === 'HS256' && !configService.jwtSecret) {
    throw new Error(
      'JWT configuration error: JWT_ALGORITHM is set to HS256 but JWT_SECRET is not provided. ' +
        'HS256 requires a symmetric secret for token validation.',
    );
  }

  // RS256/ES256 with JWT_SECRET is a mismatch (secret is for HS256 only)
  if ((algorithm === 'RS256' || algorithm === 'ES256') && configService.jwtSecret) {
    throw new Error(
      `JWT configuration error: JWT_ALGORITHM is set to ${algorithm} but JWT_SECRET is provided. ` +
        `Asymmetric algorithms require JWT_PUBLIC_KEY or JWT_JWKS_URI, not a symmetric secret. ` +
        'Use HS256 if you want to use JWT_SECRET.',
    );
  }

  // RS256/ES256 requires either public key or JWKS URI
  if (
    (algorithm === 'RS256' || algorithm === 'ES256') &&
    !configService.jwtPublicKey &&
    !configService.jwtJwksUri
  ) {
    throw new Error(
      `JWT configuration error: JWT_ALGORITHM is set to ${algorithm} but neither JWT_PUBLIC_KEY nor JWT_JWKS_URI is provided. ` +
        'Asymmetric algorithms require a public key or JWKS endpoint for token validation.',
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Build Strategy Options
  // ─────────────────────────────────────────────────────────────

  // Option 1: HS256 with JWT secret (Supabase pattern)
  if (algorithm === 'HS256' && configService.jwtSecret) {
    // eslint-disable-next-line no-console
    console.log('[JwtStrategy] Using HS256 with JWT secret for validation');

    return {
      ...baseOptions,
      secretOrKey: configService.jwtSecret,
    };
  }

  // Option 2: RS256/ES256 with JWKS (dynamic key retrieval with caching)
  if (configService.jwtJwksUri) {
    // eslint-disable-next-line no-console
    console.log(
      `[JwtStrategy] Using JWKS for key retrieval (${algorithm}): ${configService.jwtJwksUri}`,
    );

    // We use the standard passportJwtSecret provider from jwks-rsa.
    // Algorithm enforcement is handled strictly by the 'algorithms' option in baseOptions,
    // which is passed to passport-jwt -> jsonwebtoken.verify().
    //
    // This removes manual key inspection (kty/crv) to support ES256 (EC keys) correctly,
    // as jwks-rsa abstracts the raw key details.
    return {
      ...baseOptions,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: configService.jwtJwksUri,
      }),
    };
  }

  // Option 3: RS256/ES256 with static public key
  if (configService.jwtPublicKey) {
    // eslint-disable-next-line no-console
    console.log(`[JwtStrategy] Using static public key for validation (${algorithm})`);

    return {
      ...baseOptions,
      secretOrKey: configService.jwtPublicKey,
    };
  }

  // This should be unreachable due to mismatch detection above, but kept as safety net
  throw new Error(
    'JWT configuration error: Unable to determine JWT validation strategy. ' +
      'Provide JWT_SECRET for HS256, or JWT_PUBLIC_KEY/JWT_JWKS_URI for RS256/ES256.',
  );
}

/**
 * JWT Strategy for Passport.
 *
 * Validates JWTs issued by any OIDC-compatible identity provider.
 * Supports multiple validation modes:
 * 1. HS256 with JWT secret (Supabase default)
 * 2. RS256 with static public key
 * 3. RS256 with JWKS (recommended for production)
 *
 * The validated payload is transformed into AuthenticatedUser.
 *
 * @see docs/canonical/AUTH_CONTRACT.md for the authentication contract.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(configService: AppConfigService) {
    super(buildStrategyOptions(configService));
  }

  /**
   * Validate the JWT payload and transform it into AuthenticatedUser.
   *
   * This method is called by Passport after the JWT signature is verified.
   * The returned object will be attached to the request as `request.user`.
   *
   * Validation rules:
   * - sub claim is required (user identity)
   * - email is optional
   * - roles are extracted from multiple sources (provider-agnostic):
   *   1. app_metadata.roles (Supabase/Auth0 pattern)
   *   2. user_metadata.roles (Alternative Supabase pattern)
   *   3. realm_access.roles (Keycloak pattern)
   *   4. roles claim (generic OIDC pattern)
   * - Unknown roles are silently ignored (security best practice)
   */
  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload.sub) {
      this.logger.warn('JWT missing sub claim');
      throw new UnauthorizedException('Invalid token: missing subject');
    }

    // Extract roles from various claim locations (provider-agnostic)
    // Priority: app_metadata > user_metadata > realm_access > roles
    const rawRoles = this.extractRoles(payload);
    const roles = filterToAppRoles(rawRoles);

    // Extract Supabase admin metadata (for internal admin console)
    const app_metadata = payload.app_metadata || {};
    const internal_admin = app_metadata.internal_admin === true;
    const internal_admin_level = app_metadata.internal_admin_level;

    const user: AuthenticatedUser = {
      id: payload.sub,
      ...(payload.email && { email: payload.email }),
      roles,
      // Include admin metadata for downstream guards
      ...(internal_admin && {
        internal_admin,
        internal_admin_level: internal_admin_level || 'read',
      }),
    };

    this.logger.debug(`Authenticated user: ${user.id} with roles: [${roles.join(', ')}]`);

    return user;
  }

  /**
   * Extract roles from JWT payload.
   *
   * Supports multiple claim patterns used by different identity providers.
   * Priority order (strictly enforced, no merging across levels):
   *   1. app_metadata.roles (Supabase/Auth0 pattern)
   *   2. user_metadata.roles (Alternative Supabase pattern)
   *   3. realm_access.roles (Keycloak pattern)
   *   4. roles (Generic OIDC pattern)
   *
   * Once a higher-priority source is present (even if empty), lower sources are ignored.
   */
  private extractRoles(payload: JwtPayload): string[] {
    // Priority 1: Supabase/Auth0 app_metadata pattern
    if (Array.isArray(payload.app_metadata?.roles)) {
      return payload.app_metadata.roles;
    }

    // Priority 2: Supabase user_metadata pattern
    if (Array.isArray(payload.user_metadata?.roles)) {
      return payload.user_metadata.roles;
    }

    // Priority 3: Keycloak pattern
    if (Array.isArray(payload.realm_access?.roles)) {
      return payload.realm_access.roles;
    }

    // Priority 4: Generic roles claim
    if (Array.isArray(payload.roles)) {
      return payload.roles;
    }

    // No roles found — user will have empty roles array
    return [];
  }
}
