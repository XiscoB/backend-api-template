import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecipientGroup } from './delivery.types';

/**
 * Recipient Group Service
 *
 * Centralized resolution of recipient groups to email addresses.
 *
 * Guarantees:
 * - Never throws
 * - Returns empty array if env var missing or empty
 * - Logs WARN when recipients are missing
 *
 * @example
 * const recipients = recipientGroupService.resolveGroup(RecipientGroup.INFRA_ALERTS);
 * if (recipients.length === 0) {
 *   // Handle gracefully - no crash
 * }
 */
@Injectable()
export class RecipientGroupService {
  private readonly logger = new Logger(RecipientGroupService.name);

  /**
   * Mapping from RecipientGroup to environment variable name.
   * This is the single source of truth for group → env var mapping.
   */
  private readonly ENV_VAR_MAP: Record<RecipientGroup, string> = {
    [RecipientGroup.INFRA_ALERTS]: 'INFRA_ALERT_RECIPIENTS',
    [RecipientGroup.PLATFORM_REPORTS]: 'PLATFORM_REPORT_RECIPIENTS',
    [RecipientGroup.NOTIFICATION_HEALTH_REPORTS]: 'NOTIFICATION_HEALTH_REPORT_RECIPIENTS',
    [RecipientGroup.SAFETY_MODERATION_REPORTS]: 'SAFETY_MODERATION_REPORT_RECIPIENTS',
    [RecipientGroup.GDPR_REPORTS]: 'GDPR_REPORT_RECIPIENTS',
    [RecipientGroup.WEEKLY_REPORTS]: 'WEEKLY_REPORT_RECIPIENTS',
  };

  constructor(private readonly configService: ConfigService) {}

  /**
   * Resolve a recipient group to email addresses.
   *
   * @param group - The recipient group to resolve
   * @returns Array of email addresses (empty if not configured)
   */
  resolveGroup(group: RecipientGroup): string[] {
    const envVar = this.ENV_VAR_MAP[group];
    const raw = this.configService.get<string>(envVar, '');

    if (!raw || raw.trim() === '') {
      this.logger.warn({
        message: `No recipients configured for group ${group}`,
        group,
        envVar,
      });
      return [];
    }

    const emails = raw
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    if (emails.length === 0) {
      this.logger.warn({
        message: `No valid recipients after parsing for group ${group}`,
        group,
        envVar,
      });
    }

    return emails;
  }

  /**
   * Check if a recipient group has any configured recipients.
   * Useful for early-exit checks without triggering warnings.
   *
   * @param group - The recipient group to check
   * @returns true if at least one recipient is configured
   */
  hasRecipients(group: RecipientGroup): boolean {
    const envVar = this.ENV_VAR_MAP[group];
    const raw = this.configService.get<string>(envVar, '');
    if (!raw || raw.trim() === '') return false;

    return raw
      .split(',')
      .map((email) => email.trim())
      .some((email) => email.length > 0);
  }
}
