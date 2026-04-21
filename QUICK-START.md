# Quick Start

> Documentation Layer: Operational Guide (Single Command Source)

Fast path for local development with safe defaults.

## 1) Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm

## 2) Configure Environment

```bash
cp .env.example .env
```

Set required values in `.env`:

- `DATABASE_URL`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `JWT_ALGORITHM`
- HS256: `JWT_SECRET`
- RS256: `JWT_PUBLIC_KEY` or `JWT_JWKS_URI`

Do not enable `SCENARIO_TESTING` in production.

Authentication note:

- This backend validates JWTs; identity-provider login/token issuance flows are external.

## 3) Install + Migrate + Run

```bash
npm install
npm run prisma:migrate:deploy
npm run start:dev
```

## 4) Docker Option

```bash
cp .env.docker.example .env.docker
docker-compose --env-file .env.docker up
```

## 5) Common Commands

```bash
npm run test
npm run test:e2e
npm run lint
```

Optional local DB workflow:

```bash
npm run prisma:generate
npm run prisma:migrate:dev
```

Production migration flow:

```bash
npm run prisma:migrate:deploy
```

Scenario tests:

```bash
npm run test:scenarios
```

The scenario runner sets `SCENARIO_TESTING=true` for the test process; production mode rejects scenario mode.

## 6) Read Next

- Architecture: [docs/canonical/ARCHITECTURE.md](docs/canonical/ARCHITECTURE.md)
- Auth contract: [docs/canonical/AUTH_CONTRACT.md](docs/canonical/AUTH_CONTRACT.md)
- Setup details: [docs/guides/SETUP.md](docs/guides/SETUP.md)
