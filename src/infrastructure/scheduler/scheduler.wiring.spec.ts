/**
 * Scheduler Wiring Smoke Test
 *
 * Verifies that schedule factories execute correctly in REAL module wiring.
 * This test imports the actual SchedulerModule and its domain dependencies,
 * overriding only infrastructure services that require external connections.
 *
 * NOTE: NestJS multi-provider aggregation has quirks in test contexts.
 * This test verifies that:
 * 1. The module compiles (all factories run successfully)
 * 2. Schedules are registered (at least one exists)
 * 3. Registered schedules have the correct shape
 *
 * This is a wiring-only test. It does NOT:
 * - Execute cron jobs
 * - Wait for timers
 * - Test job logic or locking
 * - Depend on Redis
 * - Manipulate env vars
 */

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SchedulerModule } from './scheduler.module';
import { SCHEDULES_TOKEN, Schedule } from './scheduler.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SchedulerBootstrapService } from './scheduler.bootstrap';

describe('Scheduler wiring (compile-time smoke)', () => {
  it('should compile SchedulerModule with real schedule factories', async () => {
    const module = await Test.createTestingModule({
      imports: [SchedulerModule],
    })
      // Override only infrastructure requiring external connections
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            IN_APP_SCHEDULER_ENABLED: false,
            SCHEDULER_MODE: 'cron',
            SCHEDULER_EVERY_MINUTE_CRON: '* * * * *',
            SCHEDULER_DAILY_CRON: '0 5 * * *',
            SCHEDULER_TIMEZONE: 'UTC',
            WEEKLY_GROWTH_REPORT_CRON: '0 9 * * 1',
            GDPR_INTEGRITY_CRON: '*/15 * * * *',
            GDPR_COMPLIANCE_REPORT_CRON: '0 9 * * 1',
            WEEKLY_PLATFORM_RELIABILITY_CRON: '0 9 * * 1',
            WEEKLY_NOTIFICATION_HEALTH_CRON: '0 9 * * 1',
            WEEKLY_SAFETY_MODERATION_CRON: '0 9 * * 1',
            SITE_MONITOR_CRON: '*/5 * * * *',
            SITE_MONITOR_URLS: '',
            EMAIL_ENABLED: false,
            EMAIL_PROVIDER: 'console',
          };
          return config[key] ?? defaultValue;
        },
      })
      .compile();

    // Verify SchedulerBootstrapService is resolvable (proves module graph wired)
    const bootstrapService = module.get(SchedulerBootstrapService);
    expect(bootstrapService).toBeDefined();

    // Verify SCHEDULES_TOKEN is resolvable (proves factories executed)
    // Note: NestJS does not aggregate multi-providers via module.get().
    // Full schedule enumeration is validated via startup diagnostics.
    const schedule = module.get<Schedule>(SCHEDULES_TOKEN);
    expect(schedule).toBeDefined();
    expect(schedule.name).toBeDefined();
    expect(schedule.cron).toBeDefined();
    expect(Array.isArray(schedule.jobs)).toBe(true);

    await module.close();
  });
});
