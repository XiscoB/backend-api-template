import { execSync } from 'node:child_process';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

function toDeterministicTestDbUrl(): URL {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!base) {
    throw new Error(
      'Missing DATABASE_URL (or TEST_DATABASE_URL) for E2E tests. Provide a PostgreSQL connection URL.',
    );
  }

  const testUrl = new URL(base);
  testUrl.pathname = '/backend_test';
  return testUrl;
}

function toAdminUrl(testUrl: URL): URL {
  const adminUrl = new URL(testUrl.toString());
  adminUrl.pathname = '/postgres';
  return adminUrl;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

const globalSetup: () => Promise<void> = async (): Promise<void> => {
  const testDbUrl = toDeterministicTestDbUrl();
  process.env.DATABASE_URL = testDbUrl.toString();

  const adminUrl = toAdminUrl(testDbUrl);
  const dbName = testDbUrl.pathname.replace(/^\//, '');

  const client = new Client({ connectionString: adminUrl.toString() });

  try {
    await client.connect();

    const checkResult = await client.query('SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1', [
      dbName,
    ]);

    if (checkResult.rowCount === 0) {
      await client.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
    }
  } finally {
    await client.end();
  }

  try {
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: testDbUrl.toString(),
      },
    });
  } catch (error: unknown) {
    throw new Error(
      'Failed to run Prisma migrations for E2E setup. Ensure dev dependencies are installed (including prisma CLI) and retry.',
      { cause: error },
    );
  }
};

export default globalSetup;
