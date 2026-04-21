/*
 * RATCHET: Legacy ESLint violations.
 * These disables exist only for pre-existing code.
 * New code in this file MUST NOT introduce new violations.
 * Fix opportunistically when touching this file.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import * as express from 'express';
import * as path from 'path';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
import { INTERNAL_ADMIN_CONFIG } from './modules/internal-admin';

/**
 * Bootstrap the NestJS application.
 *
 * This function sets up:
 * - Global validation pipe
 * - Global exception filter
 * - Global response interceptor (wraps responses in { data, meta })
 * - Security headers (helmet)
 * - CORS
 * - Graceful shutdown
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(AppConfigService);
  const reflector = app.get(Reflector);
  const port = configService.port;
  const nodeEnv = configService.nodeEnv;

  // Security: Helmet adds various HTTP headers for security
  app.use(helmet());

  // CORS: Configure based on environment
  app.enableCors({
    origin: nodeEnv === 'production' ? false : true, // In production, configure explicitly
    credentials: true,
  });

  // ─────────────────────────────────────────────────────────────
  // Internal Admin Console Static Viewer
  // ─────────────────────────────────────────────────────────────
  // Serve static files for the read-only browser viewer
  // Only when ADMIN_CONSOLE_ENABLED=true
  if (configService.adminConsoleEnabled) {
    const adminBasePath = INTERNAL_ADMIN_CONFIG.mounting.basePath;
    const viewerPath = `/${adminBasePath}/view`;
    const staticDir = path.join(process.cwd(), 'dist', 'modules', 'internal-admin', 'view');
    const expressInstance = app.getHttpAdapter().getInstance();
    expressInstance.use(viewerPath, express.static(staticDir));

    logger.warn('');
    logger.warn('⚠️  INTERNAL ADMIN CONSOLE ENABLED');
    logger.warn(`    API:    http://localhost:${port}/${adminBasePath}`);
    logger.warn(`    Viewer: http://localhost:${port}${viewerPath}/`);
    logger.warn('    Disable in production unless absolutely necessary.');
    logger.warn('');
  }

  // ─────────────────────────────────────────────────────────────
  // Scenario Testing Mode Warning
  // ─────────────────────────────────────────────────────────────
  // When SCENARIO_TESTING=true, the backend accepts JWTs signed with
  // static test keys for automated E2E testing. Never enable in production.
  if (configService.scenarioTestingEnabled) {
    logger.warn('');
    logger.warn('═══════════════════════════════════════════════════════════');
    logger.warn('⚠️  SCENARIO TESTING MODE ENABLED');
    logger.warn('═══════════════════════════════════════════════════════════');
    logger.warn('    JWT validation uses static test public key');
    logger.warn('    Anyone with test private key can forge tokens');
    logger.warn('    NEVER enable SCENARIO_TESTING in production!');
    logger.warn('═══════════════════════════════════════════════════════════');
    logger.warn('');
  }

  // Global prefix: All routes start with /api
  // Global API prefix: All routes get /api prefix
  // Admin API routes are at /api/internal/admin/*
  // Static viewer is at /internal/admin/view/* (served by express.static before Nest)
  app.setGlobalPrefix('api');

  // Global validation pipe: Validates all incoming DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties
      forbidNonWhitelisted: true, // Throw error for unknown properties
      transform: true, // Transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: false, // Explicit conversions only
      },
    }),
  );

  // Global exception filter: Standardized error responses
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response interceptor: Wraps responses in { data, meta }
  app.useGlobalInterceptors(new ResponseTransformInterceptor(reflector));

  // Graceful shutdown: Handle SIGTERM and SIGINT
  app.enableShutdownHooks();

  await app.listen(port);

  logger.log(`Application running on port ${port} in ${nodeEnv} mode`);
  logger.log(`Health check available at: http://localhost:${port}/api/v1/health`);
}

bootstrap().catch((error: Error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', error.stack);
  process.exit(1);
});
