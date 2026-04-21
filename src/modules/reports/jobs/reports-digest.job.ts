import { Injectable, Logger } from '@nestjs/common';
import { ReportsService } from '../reports.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { IdentityService } from '../../identity/identity.service';

@Injectable()
export class ReportsDigestJob {
  private readonly logger = new Logger(ReportsDigestJob.name);

  constructor(
    private readonly reportsService: ReportsService,
    private readonly notificationService: NotificationsService,
    private readonly identityService: IdentityService,
  ) {}

  /**
   * Run the Reports Digest job.
   *
   * Queries pending reports and triggers an admin notification if needed.
   */
  async run(): Promise<void> {
    this.logger.debug('Starting Reports Digest Job');

    // 1. Query pending reports
    const pendingCount = await this.reportsService.countUnresolved();

    if (pendingCount === 0) {
      // Do nothing if no reports
      return;
    }

    this.logger.log(`Found ${pendingCount} unresolved reports. triggering digest.`);

    // 2. Resolve SYSTEM identity
    const systemIdentity = await this.identityService.getOrCreateSystemIdentity();

    // 3. Emit ADMIN_REPORTS_DIGEST notification (Canonical Emission)
    // The hook will pick this up and send the email
    await this.notificationService.notifyByIdentityId({
      identityId: systemIdentity.id,
      type: 'ADMIN_REPORTS_DIGEST',
      payload: {
        pendingCount,
        generatedAt: new Date().toISOString(),
      },
      // visibleAt defaults to now
    });
  }
}
