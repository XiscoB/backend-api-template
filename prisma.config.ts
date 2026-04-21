/**
 * Prisma Config for CLI operations (v7+)
 *
 * This file configures how the Prisma CLI interacts with your database.
 * Required for Prisma ORM 7.x.
 *
 * @see https://www.prisma.io/docs/orm/reference/prisma-config-reference
 */

import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  // Schema location
  schema: 'prisma/schema.prisma',

  // Datasource configuration for CLI operations
  datasource: {
    url: env('DATABASE_URL'),
  },

  // Migration configuration
  migrations: {
    path: 'prisma/migrations',
    // Seed script (optional)
    // seed: 'ts-node prisma/seed.ts',
  },
});
