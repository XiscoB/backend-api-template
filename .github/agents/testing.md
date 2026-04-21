# Testing

> **Scope**: Test structure, patterns, fixtures, E2E testing.  
> **Parent**: [agents.md](../agents.md)  
> **Note**: This documentation was inferred from observable test patterns in the codebase.

> This document defines domain-specific contracts and invariants.
> Agent behavior and process rules are defined exclusively in [AGENT_LAW.md](AGENT_LAW.md).

---

## Test Structure

```
test/
├── *.e2e-spec.ts        # E2E test files
├── jest-e2e.json        # Jest E2E configuration
├── setup-auth.ts        # Auth environment setup (must import first)
└── utils/
    └── jwt-test.utils.ts  # JWT test utilities
```

---

## E2E Test Configuration

Located in `test/jest-e2e.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  }
}
```

---

## Authentication Setup Pattern

The `setup-auth.ts` module is imported first in any E2E test that requires authentication. This sets environment variables before NestJS modules are loaded.

```typescript
// MUST be imported first - sets environment variables
import { TEST_PRIVATE_KEY } from './setup-auth';

// Then import other modules
import { Test, TestingModule } from '@nestjs/testing';
// ...
```

The setup module:

- Generates RSA test key pair (2048-bit)
- Sets `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_PUBLIC_KEY`, `JWT_ALGORITHM`
- Clears `JWT_JWKS_URI` and `JWT_SECRET`
- Sets `DATABASE_URL` if not already set

---

## JWT Test Utilities

Located in `test/utils/jwt-test.utils.ts`:

### Available Exports

| Export              | Purpose                               |
| ------------------- | ------------------------------------- |
| `TEST_PUBLIC_KEY`   | Test RSA public key                   |
| `TEST_PRIVATE_KEY`  | Test RSA private key                  |
| `WRONG_PRIVATE_KEY` | Wrong key for invalid signature tests |
| `TEST_ISSUER`       | Test issuer URL                       |
| `TEST_AUDIENCE`     | Test audience                         |
| `createTestToken()` | Create signed JWT for tests           |

### Token Creation Pattern

```typescript
function createUserToken(sub: string, email?: string): string {
  return jwt.sign(
    {
      sub,
      email,
      realm_access: { roles: ['USER'] },
    },
    TEST_PRIVATE_KEY,
    {
      algorithm: 'RS256',
      expiresIn: 3600,
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE,
    },
  );
}
```

---

## Observable Test Categories

Based on existing test files:

| Test File                              | Purpose                       |
| -------------------------------------- | ----------------------------- |
| `auth.e2e-spec.ts`                     | JWT authentication validation |
| `health.e2e-spec.ts`                   | Health endpoint               |
| `gdpr.e2e-spec.ts`                     | GDPR export lifecycle         |
| `gdpr-permanent-deletion.e2e-spec.ts`  | GDPR deletion                 |
| `gdpr-registry-validation.e2e-spec.ts` | GDPR registry validation      |
| `gdpr-structural-safety.e2e-spec.ts`   | GDPR structural safety        |

---

## Test App Setup Pattern

```typescript
describe('Feature E2E Tests', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply same configuration as production
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseTransformInterceptor());

    prisma = app.get(PrismaService);
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });
});
```

---

## Infrastructure Testing Constraints

From `.github/agents/infrastructure.md`:

- Infrastructure does not block unit tests
- Test environments use mocks/stubs
- Integration tests are optional (behind flag)
- Docker Compose is recommended for local full-stack testing

---

## Scenario Testing (Contract Verification)

End-to-end scenario tests that verify behavior against `docs/TEST_UI_CONTRACT.md`.

### Location

```
scripts/dev/scenarios/
├── run-scenarios.js     # Main entry point
├── registry.js          # Scenario registration
├── README.md            # Full documentation
├── lib/                 # Framework utilities
│   ├── assertions.js    # Test assertions
│   ├── context.js       # Test context (JWT, HTTP client)
│   ├── runner.js        # Scenario execution
│   └── safety.js        # Safety checks
└── scenarios/           # Individual scenario files
    ├── admin-operations.js
    ├── auth-failures.js
    ├── gdpr-flows.js
    ├── notification-flows.js
    ├── profile-lifecycle.js
    └── public-endpoints.js
```

### Running Scenario Tests

The scenario tests use **sealed test authentication mode** - both the scenario runner
and the backend use a shared static RSA key pair for fully automated E2E testing.

```bash
# Step 1: Start backend in scenario testing mode (Terminal 1)
SCENARIO_TESTING=true npm run start:dev

# Step 2: Run scenarios (Terminal 2)
SCENARIO_TESTING=true npm run test:scenarios

# Windows PowerShell
$env:SCENARIO_TESTING="true"; npm run start:dev
# In another terminal:
$env:SCENARIO_TESTING="true"; npm run test:scenarios
```

### Safety Checks

Scenario tests **refuse to run** unless:

- `SCENARIO_TESTING=true` is set
- `NODE_ENV` is not `production`
- Database URL looks safe (contains localhost, \_dev, \_test)
- API URL looks safe

The **backend also refuses** to enable scenario mode in production:

- Hard `process.exit(1)` if `NODE_ENV=production` AND `SCENARIO_TESTING=true`
- Console warnings at startup when scenario mode is active
- All JWT validation (signature, issuer, audience, expiry, roles) still applies

### What Scenario Tests Validate

- Public endpoints (bootstrap, health)
- Profile lifecycle (create, update, retrieve)
- Notification management (channels, list, read)
- GDPR workflows (export, suspend, recover, delete)
- Authentication failures (401 for invalid tokens)
- Validation errors (400 with field details)
- Admin console operations (when enabled)

### Authoritative Source

**`docs/TEST_UI_CONTRACT.md`** is the single source of truth.
When scenarios fail, the resolution is one of:

1. Implementation doesn't match contract → fix implementation
2. Contract is outdated → update contract

---

## TODO: Testing Documentation Needed

The following testing areas exist in the codebase but lack explicit documentation:

- [ ] Unit test patterns and conventions
- [ ] Mock/stub strategies for services
- [ ] Test database management and seeding
- [ ] CI/CD test execution configuration
- [ ] Coverage requirements and thresholds
