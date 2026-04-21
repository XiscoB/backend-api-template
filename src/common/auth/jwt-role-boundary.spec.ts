import { AppConfigService } from '../../config/app-config.service';
import { JwtStrategy } from './jwt.strategy';

const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANmQh3QwU9xQJ8AqF/1g4gkQnR9vPj2z
oK4+SV6x8qE3+6Q3lX9X4yI8nTjW3Q0m7XfYx8qGQn8eX1v8f5J3WwECAwEAAQ==
-----END PUBLIC KEY-----`;

const createConfig = (): AppConfigService =>
  ({
    get jwtAlgorithm() {
      return 'RS256';
    },
    get scenarioTestingEnabled() {
      return false;
    },
    get scenarioTestIssuer() {
      return undefined;
    },
    get scenarioTestAudience() {
      return undefined;
    },
    get scenarioTestPublicKey() {
      return undefined;
    },
    get jwtIssuer() {
      return 'https://issuer.example.com';
    },
    get jwtAudience() {
      return 'backend-api';
    },
    get jwtSecret() {
      return undefined;
    },
    get jwtJwksUri() {
      return undefined;
    },
    get jwtPublicKey() {
      return TEST_PUBLIC_KEY;
    },
  }) as AppConfigService;

describe('JwtStrategy role boundary enforcement', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    strategy = new JwtStrategy(createConfig());
  });

  it('safely ignores malformed role arrays and falls back to next valid claim source', () => {
    const malformedPayload = {
      sub: 'user-1',
      app_metadata: { roles: 'ADMIN' },
      user_metadata: { roles: ['ENTITY'] },
    } as never;

    const user = strategy.validate(malformedPayload);

    expect(user.roles).toEqual(['ENTITY']);
  });

  it('returns deterministic empty role set when no claim source has an array', () => {
    const malformedPayload = {
      sub: 'user-2',
      app_metadata: { roles: undefined },
      user_metadata: { roles: undefined },
      realm_access: { roles: undefined },
      roles: undefined,
    } as never;

    const user = strategy.validate(malformedPayload);

    expect(user.roles).toEqual([]);
  });

  it('enforces canonical roles and silently drops unknown provider roles', () => {
    const user = strategy.validate({
      sub: 'user-3',
      roles: ['USER', 'offline_access', 'ADMIN', 'provider_internal'],
    });

    expect(user.roles).toEqual(['USER', 'ADMIN']);
  });
});
