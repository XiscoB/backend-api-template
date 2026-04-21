/**
 * Run GDPR Integrity Monitor
 *
 * Usage:
 *   npx ts-node scripts/jobs/run-gdpr-integrity.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../src/app.module';
import { GdprIntegrityMonitor } from '../../../src/modules/gdpr/integrity/gdpr-integrity.monitor';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { AppConfigService } from '../../../src/config/app-config.service';

void (async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Resolve services
  const monitor = app.get(GdprIntegrityMonitor);
  const prisma = app.get(PrismaService);
  const appConfig = app.get(AppConfigService);

  console.log('--- GDPR Integrity Monitor & Alerting Tool ---');

  // Check config
  const recipients = appConfig.alertEmailRecipients;
  console.log(
    `Configured Recipients: ${recipients.length > 0 ? recipients.join(', ') : 'NONE (Alerts disabled)'}`,
  );

  try {
    console.log('Running integrity check...');
    await monitor.checkIntegrity();
    console.log('Check complete.');

    // Check logs to see what happened
    const recentLogs = await prisma.internalLog.findMany({
      where: { source: 'GdprIntegrityMonitor' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    console.log('\n--- Recent Internal Logs ---');
    recentLogs.forEach((log) => {
      console.log(`[${log.level}] ${log.message} (${log.createdAt.toISOString()})`);
      if (log.context) console.log(JSON.stringify(log.context, null, 2));
    });
  } catch (err) {
    console.error('Failed to run monitor:', err);
  } finally {
    await app.close();
  }
})();
