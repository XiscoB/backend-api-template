import { Injectable, Logger } from '@nestjs/common';

/**
 * Delivery Retry Service (Stub)
 *
 * This service is currently missing/broken in the main branch.
 * Implementing a stub to allow the application to boot and tests to run.
 *
 * @see task.md
 */
@Injectable()
export class DeliveryRetryService {
  private readonly logger = new Logger(DeliveryRetryService.name);

  processRetryQueue(): Promise<void> {
    this.logger.warn('processRetryQueue called but service is stubbed.');
    return Promise.resolve();
  }

  scheduleRetry(notificationId: string): Promise<void> {
    this.logger.warn(`scheduleRetry called for ${notificationId} but service is stubbed.`);
    return Promise.resolve();
  }
}
