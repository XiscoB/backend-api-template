import { SchedulerAlertsJob } from '../../src/infrastructure/scheduler/jobs/scheduler-alerts.job';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { EmailService } from '../../src/infrastructure/email/email.service';
import { AppConfigService } from '../../src/config/app-config.service';

/*
 * Verification Script for Scheduler Alerts Job
 *
 * Bypasses Jest/NestJS testing module complexity to verify logic directly.
 * Usage: npx ts-node scripts/verify-scheduler-alerts.ts
 */

async function main() {
  console.log('--- Starting Verification ---');

  const mockRecipients = ['admin@example.com'];

  // Mocks — use Partial<T> to avoid as-unknown-as laundering
  const mockPrisma = {
    schedulerLock: {
      findMany: () => Promise.resolve([]),
    },
    internalLog: {
      groupBy: () => Promise.resolve([]),
      create: (data: Record<string, unknown>) => {
        console.log('Log created:', data);
        return Promise.resolve();
      },
    },
  } as Partial<PrismaService> as PrismaService;

  const mockEmail = {
    send: (payload: { rawSubject?: string }) => {
      console.log('Email sent:', payload.rawSubject);
      return Promise.resolve({ success: true });
    },
  } as Partial<EmailService> as EmailService;

  const mockConfig = {
    infraAlertRecipients: mockRecipients,
  } as Partial<AppConfigService> as AppConfigService;

  // Instantiate
  const job = new SchedulerAlertsJob(mockPrisma, mockEmail, mockConfig);
  console.log('Job instantiated.');

  // Test 1: Job Not Running
  console.log('\nTest 1: Job Not Running check...');
  const now = new Date();
  const lastRun = new Date(now.getTime() - (60 * 1000 + 30 * 60 * 1000)); // 31 mins ago

  mockPrisma.schedulerLock.findMany = () =>
    Promise.resolve([
      {
        jobName: 'every-minute',
        lastRunAt: lastRun,
        lockedBy: 'worker',
        lockedAt: lastRun,
        expiresAt: new Date(),
      } as Record<string, unknown>,
    ] as never[]);

  await job.run(); // Should trigger email

  // Test 2: Stale Lock
  console.log('\nTest 2: Stale Lock check...');
  const expiresAt = new Date(now.getTime() - 10 * 60 * 1000); // Expired 10 mins ago

  // Reset mocks
  mockPrisma.schedulerLock.findMany = (args?: Record<string, unknown>) => {
    const where = args?.where as Record<string, unknown> | undefined;
    if (where?.expiresAt) {
      return Promise.resolve([
        {
          jobName: 'daily-cleanup',
          lockedBy: 'worker-1',
          lockedAt: new Date(now.getTime() - 20 * 60 * 1000),
          expiresAt: expiresAt,
          lastRunAt: new Date(),
        } as Record<string, unknown>,
      ] as never[]);
    }
    return Promise.resolve([]); // Return empty for missed schedule check
  };

  await job.run(); // Should trigger email

  // Test 3: Repeated Errors
  console.log('\nTest 3: Repeated Errors check...');
  mockPrisma.schedulerLock.findMany = () => Promise.resolve([]); // No lock issues

  (mockPrisma.internalLog as Record<string, unknown>).groupBy = () =>
    Promise.resolve([
      {
        source: 'PaymentService',
        _count: { id: 10 },
        _min: { createdAt: new Date() },
        _max: { createdAt: new Date() },
      },
    ]);

  await job.run(); // Should trigger email

  console.log('\n--- Verification Complete ---');
}

main().catch(console.error);
