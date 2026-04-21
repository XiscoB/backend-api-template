import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailNotificationService } from '../notifications/email-notification.service';

/**
 * Context for deletion confirmation email.
 */
export interface DeletionEmailContext {
  identityId: string;
  requestId: string;
  anonymizedAt: Date;
}

@Injectable()
export class GdprDeletionEmailService {
  private readonly logger = new Logger(GdprDeletionEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailNotificationService: EmailNotificationService,
  ) {}

  /**
   * Store email for later delivery (T+0).
   *
   * Email comes from JWT claim passed by controller.
   * Locale is best-effort from Profile, defaults to 'en'.
   *
   * Failure does NOT block deletion.
   *
   * @param requestId - The GDPR deletion request ID
   * @param email - Email from authenticated JWT claim (may be undefined)
   * @param identityId - Identity ID for locale lookup
   * @returns true if captured, false if no email or error
   */
  async captureEmailForDeletion(
    requestId: string,
    email: string | undefined,
    identityId: string,
  ): Promise<boolean> {
    if (!email) {
      this.logger.debug(`No email provided for deletion request ${requestId}`);
      return false;
    }

    try {
      // Best-effort locale from Profile (non-blocking)
      const locale = await this.resolveLocaleBestEffort(identityId);

      await this.prisma.gdprDeletionEmail.create({
        data: {
          requestId,
          email,
          locale,
        },
      });

      this.logger.log(`Captured email for deletion request ${requestId}`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to capture email for deletion: ${msg}`);
      return false; // Non-blocking
    }
  }

  /**
   * Send confirmation and delete record (after anonymization).
   *
   * Called AFTER final deletion/anonymization completes.
   * Always deletes record regardless of send success.
   *
   * @param requestId - The GDPR deletion request ID
   * @param context - Context for the email (identityId, anonymizedAt)
   */
  async sendAndDeleteConfirmation(requestId: string, context: DeletionEmailContext): Promise<void> {
    const record = await this.prisma.gdprDeletionEmail.findUnique({
      where: { requestId },
    });

    if (!record) {
      this.logger.debug(`No email record for request ${requestId}`);
      return;
    }

    try {
      await this.sendDeletionConfirmationEmail(record.email, {
        ...context,
        locale: record.locale,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to send deletion confirmation: ${msg}`);
      // Continue to delete regardless
    } finally {
      // ALWAYS delete - no retries
      await this.prisma.gdprDeletionEmail
        .delete({
          where: { requestId },
        })
        .catch((e: unknown) => this.logger.error(`Failed to delete email record: ${String(e)}`));
    }
  }

  /**
   * Best-effort locale resolution.
   *
   * Returns 'en' immediately on any error - non-blocking.
   */
  private async resolveLocaleBestEffort(identityId: string): Promise<string> {
    try {
      const profile = await this.prisma.profile.findUnique({
        where: { identityId },
        select: { language: true },
      });
      return profile?.language ?? 'en';
    } catch {
      return 'en';
    }
  }

  /**
   * Send deletion confirmation email.
   *
   * Delegates to EmailNotificationService.
   */
  private async sendDeletionConfirmationEmail(
    email: string,
    context: DeletionEmailContext & { locale: string },
  ): Promise<void> {
    await this.emailNotificationService.sendAccountDeletionConfirmation(email, {
      identityId: context.identityId,
      anonymizedAt: context.anonymizedAt,
      language: context.locale,
    });
  }
}
