import { Schedule } from '../scheduler.types';
import { GdprIntegrityMonitor } from '../../../modules/gdpr/integrity/gdpr-integrity.monitor';
import { AppConfigService } from '../../../config/app-config.service';

/**
 * Creates the GDPR integrity monitor schedule.
 *
 * Frequency: Hourly (or as configured)
 * Goal: Detect stale/broken requests and audit inconsistencies
 */
export function createGdprIntegritySchedule(
  config: AppConfigService,
  monitor: GdprIntegrityMonitor,
): Schedule {
  return {
    name: 'gdpr-integrity-monitor',
    // Run hourly at minute 0 or as configured
    cron: config.gdprIntegrityCron,
    jobs: [
      async (): Promise<void> => {
        await monitor.checkIntegrity();
      },
    ],
  };
}
