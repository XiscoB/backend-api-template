> Documentation Layer: Operational Guide

# Setup Guide

This guide provides a minimal, provider-agnostic setup path for local development and CI.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm
- An OIDC-compatible identity provider that issues JWTs

## Minimal Required Environment

Copy `.env.example` to `.env` and configure the following required values:

- `DATABASE_URL`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `JWT_ALGORITHM`
- **HS256 mode:** `JWT_SECRET`
- **RS256 mode:** `JWT_PUBLIC_KEY` or `JWT_JWKS_URI`

The application validates this at startup and fails fast on incomplete JWT configuration.

## JWT Validation Modes

### HS256

Use when your identity provider signs tokens with a symmetric secret.

```env
JWT_ALGORITHM=HS256
JWT_SECRET=replace-with-secret
```

### RS256

Use when your identity provider signs tokens asymmetrically.

```env
JWT_ALGORITHM=RS256
# Choose one:
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...-----END PUBLIC KEY-----
# or
JWT_JWKS_URI=https://issuer.example.com/.well-known/jwks.json
```

## Local Development

```bash
npm install
npm run prisma:migrate:deploy
npm run start:dev
```

## Docker Development

```bash
cp .env.docker.example .env.docker
docker-compose --env-file .env.docker up
```

Important safety defaults:

- `SCENARIO_TESTING` defaults to `false`
- `IN_APP_SCHEDULER_ENABLED` defaults to `false`

## CI Expectations

CI should provide explicit environment values; no interactive or provider SDK setup is required.

Expected CI behavior:

- Uses disposable test database
- Runs migrations before tests
- Runs with deterministic test auth setup for e2e scenarios
- Keeps production-only unsafe modes disabled

## Optional Variables

Most infrastructure variables are optional by default (email provider settings, Redis, scheduler tuning). Keep them unset unless the corresponding feature is enabled.

