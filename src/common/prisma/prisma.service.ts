import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * Prisma service for Prisma ORM 7.x
 *
 * Provides access to the Prisma client throughout the application.
 * Handles connection lifecycle and graceful shutdown.
 *
 * Uses PostgreSQL adapter pattern required by Prisma 7.x.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private pool: Pool;

  constructor() {
    // Create PostgreSQL connection pool
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Connection pool settings (match Prisma v6 behavior)
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 10, // Default max connections
    });

    // Create Prisma adapter
    const adapter = new PrismaPg(pool);

    // Initialize Prisma Client with adapter
    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to database...');
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
    await this.pool.end(); // Close connection pool
    this.logger.log('Database connection closed');
  }
}
