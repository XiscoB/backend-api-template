import * as Joi from 'joi';

/**
 * Environment variable validation schema.
 *
 * All required environment variables are validated at application startup.
 * If any required variable is missing or invalid, the application will fail to start.
 *
 * This is intentional: fail fast, fail loud.
 */
export const appConfigValidationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),

  // Database
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required()
    .messages({
      'string.uri': 'DATABASE_URL must be a valid PostgreSQL connection string',
      'any.required': 'DATABASE_URL is required',
    }),

  // JWT / Auth (External Identity Provider)
  // Supports: Supabase, Auth0, Keycloak, Okta, Azure AD, etc.
  JWT_ISSUER: Joi.string().uri().required().messages({
    'string.uri': 'JWT_ISSUER must be a valid URL (e.g., https://<project>.supabase.co/auth/v1)',
    'any.required': 'JWT_ISSUER is required',
  }),
  JWT_AUDIENCE: Joi.string().required().messages({
    'any.required': 'JWT_AUDIENCE is required (e.g., "authenticated" for Supabase)',
  }),

  // Option 1: JWT Secret for HS256 (Supabase default)
  JWT_SECRET: Joi.string().optional().messages({
    'string.base': 'JWT_SECRET must be a string (Supabase JWT secret)',
  }),

  // Option 2: Public key for RS256 (PEM format or base64 encoded)
  JWT_PUBLIC_KEY: Joi.string().optional().messages({
    'string.base': 'JWT_PUBLIC_KEY must be a string (PEM format or base64 encoded)',
  }),

  // Option 3: JWKS URI for dynamic key retrieval (recommended for production)
  JWT_JWKS_URI: Joi.string().uri().optional().messages({
    'string.uri': 'JWT_JWKS_URI must be a valid URL to the JWKS endpoint',
  }),

  // JWT Algorithm (defaults to RS256, use HS256 for Supabase JWT secret)
  JWT_ALGORITHM: Joi.string()
    .valid('RS256', 'HS256', 'ES256')
    .optional()
    .default('RS256')
    .messages({
      'any.only': 'JWT_ALGORITHM must be RS256, HS256, or ES256',
    }),

  // ─────────────────────────────────────────────────────────────
  // AWS S3 Configuration (GDPR Export Storage)
  // ─────────────────────────────────────────────────────────────
  // Required for production GDPR export storage.
  // In development, local filesystem adapter is used if not configured.

  AWS_REGION: Joi.string().optional().allow('').messages({
    'string.base': 'AWS_REGION must be a valid AWS region (e.g., eu-west-1)',
  }),

  AWS_S3_BUCKET: Joi.string().optional().allow('').messages({
    'string.base': 'AWS_S3_BUCKET must be the S3 bucket name for GDPR exports',
  }),

  AWS_ACCESS_KEY_ID: Joi.string().optional().allow('').messages({
    'string.base': 'AWS_ACCESS_KEY_ID is required for S3 access',
  }),

  AWS_SECRET_ACCESS_KEY: Joi.string().optional().allow('').messages({
    'string.base': 'AWS_SECRET_ACCESS_KEY is required for S3 access',
  }),

  // GDPR Export Configuration
  GDPR_EXPORT_TTL_DAYS: Joi.number().integer().min(1).max(90).default(7).messages({
    'number.base': 'GDPR_EXPORT_TTL_DAYS must be a number',
    'number.min': 'GDPR_EXPORT_TTL_DAYS must be at least 1 day',
    'number.max': 'GDPR_EXPORT_TTL_DAYS must be at most 90 days',
  }),

  GDPR_PRESIGNED_URL_TTL_SECONDS: Joi.number().integer().min(60).max(3600).default(300).messages({
    'number.base': 'GDPR_PRESIGNED_URL_TTL_SECONDS must be a number',
    'number.min': 'GDPR_PRESIGNED_URL_TTL_SECONDS must be at least 60 seconds',
    'number.max': 'GDPR_PRESIGNED_URL_TTL_SECONDS must be at most 3600 seconds (1 hour)',
  }),

  // ─────────────────────────────────────────────────────────────
  // Internal Admin Console
  // ─────────────────────────────────────────────────────────────
  // WARNING: Only enable for rare operational interventions.
  // Requires full backend restart to enable/disable.

  ADMIN_CONSOLE_ENABLED: Joi.alternatives()
    .try(
      Joi.boolean(),
      Joi.string()
        .valid('true', 'false')
        .custom((value) => value === 'true'),
    )
    .default(false)
    .messages({
      'alternatives.match': 'ADMIN_CONSOLE_ENABLED must be true, false, "true", or "false"',
    }),

  // Admin user allowlist (bootstrap admins by user ID)
  // Comma-separated list of user subs that should have ADMIN_WRITE access
  // Example: ADMIN_USER_IDS=user-123,user-456,4c6a9628-fbf0-4ad0-8157-7b91f4b2ec8f
  ADMIN_USER_IDS: Joi.string().optional().allow('').messages({
    'string.base': 'ADMIN_USER_IDS must be a comma-separated list of user IDs',
  }),

  // ─────────────────────────────────────────────────────────────
  // Email Delivery Configuration
  // ─────────────────────────────────────────────────────────────
  // Provider-agnostic email infrastructure.
  // Default: 'console' (logs emails, no real sending)

  EMAIL_PROVIDER: Joi.string().valid('sparkpost', 'ses', 'console').default('console').messages({
    'any.only': 'EMAIL_PROVIDER must be one of: sparkpost, ses, console',
  }),

  EMAIL_ENABLED: Joi.alternatives()
    .try(
      Joi.boolean(),
      Joi.string()
        .valid('true', 'false')
        .custom((value) => value === 'true'),
    )
    .default(true)
    .messages({
      'alternatives.match': 'EMAIL_ENABLED must be true, false, "true", or "false"',
    }),

  EMAIL_DEFAULT_FROM: Joi.string().email().optional().messages({
    'string.email': 'EMAIL_DEFAULT_FROM must be a valid email address',
  }),

  EMAIL_DEFAULT_FROM_NAME: Joi.string().optional().allow('').messages({
    'string.base': 'EMAIL_DEFAULT_FROM_NAME must be a string',
  }),

  // SparkPost Configuration
  SPARKPOST_API_KEY: Joi.string().optional().allow('').messages({
    'string.base': 'SPARKPOST_API_KEY must be a string',
  }),

  SPARKPOST_API_ENDPOINT: Joi.string()
    .uri({ scheme: ['https'] })
    .optional()
    .default('https://api.sparkpost.com/api/v1')
    .messages({
      'string.uri': 'SPARKPOST_API_ENDPOINT must be a valid HTTPS URL',
    }),

  // Amazon SES Configuration
  AWS_SES_REGION: Joi.string().optional().allow('').messages({
    'string.base': 'AWS_SES_REGION must be a valid AWS region (e.g., us-east-1)',
  }),

  AWS_SES_ACCESS_KEY_ID: Joi.string().optional().allow('').messages({
    'string.base': 'AWS_SES_ACCESS_KEY_ID is required for SES',
  }),

  AWS_SES_SECRET_ACCESS_KEY: Joi.string().optional().allow('').messages({
    'string.base': 'AWS_SES_SECRET_ACCESS_KEY is required for SES',
  }),

  // ─────────────────────────────────────────────────────────────
  // Push Notification Infrastructure
  // ─────────────────────────────────────────────────────────────
  // Configuration for push token cleanup and delivery retry.

  // Push token cleanup retention (in days)
  // Inactive tokens older than this will be removed during cleanup
  PUSH_TOKEN_RETENTION_DAYS: Joi.number().integer().min(7).max(365).default(90).messages({
    'number.base': 'PUSH_TOKEN_RETENTION_DAYS must be a number',
    'number.min': 'PUSH_TOKEN_RETENTION_DAYS must be at least 7 days',
    'number.max': 'PUSH_TOKEN_RETENTION_DAYS must be at most 365 days',
  }),

  // Whether push token cleanup is enabled
  PUSH_TOKEN_CLEANUP_ENABLED: Joi.alternatives()
    .try(
      Joi.boolean(),
      Joi.string()
        .valid('true', 'false')
        .custom((value) => value === 'true'),
    )
    .default(true)
    .messages({
      'alternatives.match': 'PUSH_TOKEN_CLEANUP_ENABLED must be true, false, "true", or "false"',
    }),

  // ─────────────────────────────────────────────────────────────
  // Notification Delivery Retry Configuration
  // ─────────────────────────────────────────────────────────────
  // Retry settings for infrastructure-level delivery failures.

  // Maximum retry attempts for failed deliveries
  NOTIFICATION_RETRY_MAX_ATTEMPTS: Joi.number().integer().min(0).max(10).default(3).messages({
    'number.base': 'NOTIFICATION_RETRY_MAX_ATTEMPTS must be a number',
    'number.min': 'NOTIFICATION_RETRY_MAX_ATTEMPTS must be at least 0',
    'number.max': 'NOTIFICATION_RETRY_MAX_ATTEMPTS must be at most 10',
  }),

  // Initial delay for retry backoff (in seconds)
  NOTIFICATION_RETRY_INITIAL_DELAY_SECONDS: Joi.number()
    .integer()
    .min(1)
    .max(300)
    .default(30)
    .messages({
      'number.base': 'NOTIFICATION_RETRY_INITIAL_DELAY_SECONDS must be a number',
      'number.min': 'NOTIFICATION_RETRY_INITIAL_DELAY_SECONDS must be at least 1 second',
      'number.max': 'NOTIFICATION_RETRY_INITIAL_DELAY_SECONDS must be at most 300 seconds',
    }),

  // Whether delivery retry is enabled
  NOTIFICATION_RETRY_ENABLED: Joi.alternatives()
    .try(
      Joi.boolean(),
      Joi.string()
        .valid('true', 'false')
        .custom((value) => value === 'true'),
    )
    .default(false)
    .messages({
      'alternatives.match': 'NOTIFICATION_RETRY_ENABLED must be true, false, "true", or "false"',
    }),

  // ─────────────────────────────────────────────────────────────
  // Weekly Growth Report
  // ─────────────────────────────────────────────────────────────
  WEEKLY_GROWTH_REPORT_CRON: Joi.string()
    .description('Cron expression for the weekly growth report (Default: Mondays 9am)')
    .default('0 9 * * 1'), // Mondays at 09:00

  WEEKLY_REPORT_RECIPIENTS: Joi.string()
    .description('Comma-separated emails to receive the weekly growth report')
    .allow('')
    .default(''),

  // Weekly GDPR Compliance Report
  WEEKLY_GDPR_COMPLIANCE_REPORT_CRON: Joi.string()
    .description('Cron expression for the weekly GDPR compliance report (Default: Mondays 9am)')
    .default('0 9 * * 1'), // Mondays at 09:00

  GDPR_REPORT_RECIPIENTS: Joi.string()
    .description('Comma-separated emails to receive the weekly GDPR compliance report')
    .allow('')
    .default(''),

  // ─────────────────────────────────────────────────────────────
  // Alerts & Monitoring
  // ─────────────────────────────────────────────────────────────
  // Driver selection for rate limiting backend.
  // memory: In-process rate limiting (default, single-instance only)
  // redis: Distributed rate limiting (primary) with in-memory fallback

  RATE_LIMIT_DRIVER: Joi.string().valid('memory', 'redis').default('memory').messages({
    'any.only': 'RATE_LIMIT_DRIVER must be "memory" or "redis"',
  }),

  // Redis URL (required if RATE_LIMIT_DRIVER=redis)
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .when('RATE_LIMIT_DRIVER', {
      is: 'redis',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    })
    .messages({
      'string.uri': 'REDIS_URL must be a valid redis:// connection string',
      'any.required': 'REDIS_URL is required when RATE_LIMIT_DRIVER=redis',
    }),

  RATE_LIMIT_FALLBACK_ENABLED: Joi.alternatives()
    .try(
      Joi.boolean(),
      Joi.string()
        .valid('true', 'false')
        .custom((value) => value === 'true'),
    )
    .default(true)
    .messages({
      'alternatives.match': 'RATE_LIMIT_FALLBACK_ENABLED must be true, false, "true", or "false"',
    }),

  RATE_LIMIT_FALLBACK_MEMORY_TTL_SECONDS: Joi.number()
    .integer()
    .min(1)
    .max(86400)
    .default(60)
    .messages({
      'number.base': 'RATE_LIMIT_FALLBACK_MEMORY_TTL_SECONDS must be a number',
      'number.min': 'RATE_LIMIT_FALLBACK_MEMORY_TTL_SECONDS must be at least 1 second',
      'number.max': 'RATE_LIMIT_FALLBACK_MEMORY_TTL_SECONDS must be at most 86400 seconds',
    }),

  RATE_LIMIT_FALLBACK_MEMORY_MAX_ENTRIES: Joi.number()
    .integer()
    .min(100)
    .max(1000000)
    .default(10000)
    .messages({
      'number.base': 'RATE_LIMIT_FALLBACK_MEMORY_MAX_ENTRIES must be a number',
      'number.min': 'RATE_LIMIT_FALLBACK_MEMORY_MAX_ENTRIES must be at least 100',
      'number.max': 'RATE_LIMIT_FALLBACK_MEMORY_MAX_ENTRIES must be at most 1000000',
    }),

  RATE_LIMIT_FALLBACK_PROBE_COOLDOWN_MS: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .default(30000)
    .messages({
      'number.base': 'RATE_LIMIT_FALLBACK_PROBE_COOLDOWN_MS must be a number',
      'number.min': 'RATE_LIMIT_FALLBACK_PROBE_COOLDOWN_MS must be at least 1000ms',
      'number.max': 'RATE_LIMIT_FALLBACK_PROBE_COOLDOWN_MS must be at most 300000ms',
    }),

  RATE_LIMIT_FALLBACK_CLEANUP_INTERVAL_MS: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .default(60000)
    .messages({
      'number.base': 'RATE_LIMIT_FALLBACK_CLEANUP_INTERVAL_MS must be a number',
      'number.min': 'RATE_LIMIT_FALLBACK_CLEANUP_INTERVAL_MS must be at least 1000ms',
      'number.max': 'RATE_LIMIT_FALLBACK_CLEANUP_INTERVAL_MS must be at most 300000ms',
    }),

  // ─────────────────────────────────────────────────────────────
  // In-App Scheduler
  // ─────────────────────────────────────────────────────────────
  // Enables the in-app scheduler for background job execution.
  // Uses DB-level locking for multi-instance safety.
  // See docs/canonical/SCHEDULING.md for details.

  // Enable in-app scheduler (default: false)
  IN_APP_SCHEDULER_ENABLED: Joi.alternatives()
    .try(
      Joi.boolean(),
      Joi.string()
        .valid('true', 'false')
        .custom((value) => value === 'true'),
    )
    .default(false)
    .messages({
      'alternatives.match': 'IN_APP_SCHEDULER_ENABLED must be true, false, "true", or "false"',
    }),

  // Scheduler mode: 'cron' (production) or 'uptime-based' (dev/test only)
  // CRON mode uses fixed clock-time scheduling with cron expressions
  // UPTIME-BASED mode uses setInterval (causes drift on restarts!)
  SCHEDULER_MODE: Joi.string().valid('cron', 'uptime-based').default('cron').messages({
    'any.only': 'SCHEDULER_MODE must be "cron" or "uptime-based"',
  }),

  // Cron expression for every-minute schedule (default: every minute)
  SCHEDULER_EVERY_MINUTE_CRON: Joi.string().default('* * * * *').messages({
    'string.base': 'SCHEDULER_EVERY_MINUTE_CRON must be a valid cron expression',
  }),

  // Cron expression for daily maintenance (default: 3 AM UTC)
  SCHEDULER_DAILY_CRON: Joi.string().default('0 3 * * *').messages({
    'string.base': 'SCHEDULER_DAILY_CRON must be a valid cron expression',
  }),

  // Timezone for cron expressions (default: UTC)
  SCHEDULER_TIMEZONE: Joi.string().default('UTC').messages({
    'string.base': 'SCHEDULER_TIMEZONE must be a valid timezone string',
  }),

  // ─────────────────────────────────────────────────────────────
  // External Site Availability Monitor
  // ─────────────────────────────────────────────────────────────
  // Generic HTTP availability checks for external sites.
  // All settings are optional and fail-safe.

  // Comma-separated list of URLs to monitor
  SITE_MONITOR_TARGETS: Joi.string()
    .description('Comma-separated URLs to monitor for availability')
    .allow('')
    .default(''),

  // Expected HTTP status code (default: 200)
  SITE_MONITOR_EXPECTED_STATUS: Joi.number().integer().min(100).max(599).default(200).messages({
    'number.base': 'SITE_MONITOR_EXPECTED_STATUS must be a number',
    'number.min': 'SITE_MONITOR_EXPECTED_STATUS must be a valid HTTP status (100-599)',
    'number.max': 'SITE_MONITOR_EXPECTED_STATUS must be a valid HTTP status (100-599)',
  }),

  // Timeout per request (default: 5000ms)
  SITE_MONITOR_TIMEOUT_MS: Joi.number().integer().min(1000).max(30000).default(5000).messages({
    'number.base': 'SITE_MONITOR_TIMEOUT_MS must be a number',
    'number.min': 'SITE_MONITOR_TIMEOUT_MS must be at least 1000ms',
    'number.max': 'SITE_MONITOR_TIMEOUT_MS must be at most 30000ms',
  }),

  // Cron expression for check frequency (default: every 5 minutes)
  SITE_MONITOR_CHECK_CRON: Joi.string().default('*/5 * * * *').messages({
    'string.base': 'SITE_MONITOR_CHECK_CRON must be a valid cron expression',
  }),
})
  .when(Joi.object({ JWT_ALGORITHM: Joi.valid('HS256') }).unknown(), {
    then: Joi.object({
      JWT_SECRET: Joi.required(),
      JWT_PUBLIC_KEY: Joi.forbidden(),
      JWT_JWKS_URI: Joi.forbidden(),
    }),
    otherwise: Joi.object({
      JWT_SECRET: Joi.forbidden(),
    }).or('JWT_PUBLIC_KEY', 'JWT_JWKS_URI'),
  })
  .messages({
    'object.missing': 'One of JWT_SECRET, JWT_PUBLIC_KEY, or JWT_JWKS_URI must be provided',
    'any.unknown': 'JWT_SECRET is not allowed when using RS256 or ES256 algorithm',
  });
