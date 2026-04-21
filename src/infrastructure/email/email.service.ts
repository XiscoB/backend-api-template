import { Inject, Injectable, Logger } from '@nestjs/common';
import { EmailAdapter, EMAIL_ADAPTER } from './types/email-adapter.interface';
import {
  EmailPayload,
  EmailResult,
  EmailRecipientResult,
  RenderedEmail,
} from './types/email.types';
import { EmailTemplateResolver } from './templates/template-resolver.service';
import { EmailConfigService } from './config/email-config.service';

/**
 * Email service.
 *
 * The main entry point for sending emails. This service:
 * - Resolves templates with variables
 * - Renders final email content
 * - Delegates delivery to the configured adapter
 *
 * Design principles:
 * - Single entry point for all email operations
 * - Template resolution is internal (adapters never see templates)
 * - Provider-agnostic (adapter handles actual delivery)
 * - Batch-ready without API changes
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Inject(EMAIL_ADAPTER) private readonly adapter: EmailAdapter,
    private readonly templateResolver: EmailTemplateResolver,
    private readonly config: EmailConfigService,
  ) {}

  /**
   * Send an email using the configured adapter.
   *
   * This is the primary method for sending emails.
   * For single recipients, pass an array with one element.
   *
   * @param payload - Email payload with template key, recipients, and variables
   * @returns Result with accepted/rejected counts and optional per-recipient details
   */
  async send(payload: EmailPayload): Promise<EmailResult> {
    // Check if email is enabled
    if (!this.config.enabled) {
      this.logger.debug('Email sending is disabled');
      return {
        provider: 'disabled',
        acceptedCount: 0,
        rejectedCount: payload.recipients.length,
      };
    }

    // Validate payload: either templateKey or rawHtml+rawSubject
    const hasTemplate = !!payload.templateKey;
    const hasRawHtml = !!payload.rawHtml;

    if (!hasTemplate && !hasRawHtml) {
      this.logger.error(
        'Email payload validation failed: either templateKey or rawHtml must be provided',
      );
      return {
        provider: this.adapter.name,
        acceptedCount: 0,
        rejectedCount: payload.recipients.length,
      };
    }

    if (hasRawHtml && !payload.rawSubject) {
      this.logger.error(
        'Email payload validation failed: rawSubject is required when using rawHtml',
      );
      return {
        provider: this.adapter.name,
        acceptedCount: 0,
        rejectedCount: payload.recipients.length,
      };
    }

    // Validate recipients
    if (!payload.recipients || payload.recipients.length === 0) {
      return {
        provider: this.adapter.name,
        acceptedCount: 0,
        rejectedCount: 0,
      };
    }

    // Render emails for each recipient
    const renderedEmails = this.renderEmails(payload);

    // Send via adapter
    const results = await this.sendViaAdapter(renderedEmails);

    // Compile results
    return this.compileResults(results);
  }

  /**
   * Get the name of the active email provider.
   */
  getProviderName(): string {
    return this.adapter.name;
  }

  /**
   * Render emails for all recipients.
   *
   * Supports two modes:
   * 1. Template mode: Uses templateKey to resolve locale-based templates
   * 2. Raw mode: Uses rawHtml + rawSubject directly (no template resolution)
   */
  private renderEmails(payload: EmailPayload): RenderedEmail[] {
    const rendered: RenderedEmail[] = [];

    for (const recipient of payload.recipients) {
      try {
        let subject: string;
        let html: string;
        let text: string | undefined;

        if (payload.rawHtml !== undefined) {
          // Raw mode: use provided content directly
          // TypeScript knows this is RawEmailPayload here
          subject = payload.rawSubject;
          html = payload.rawHtml;
          text = payload.rawText;
        } else {
          // Template mode: resolve template with variables
          // TypeScript knows this is TemplateEmailPayload here
          const variables = {
            ...payload.variables,
            ...recipient.variables,
          };

          const template = this.templateResolver.resolve(
            payload.templateKey,
            payload.locale,
            variables,
          );

          subject = template.subject;
          html = template.html;
          text = template.text;
        }

        // Build rendered email
        const email: RenderedEmail = {
          from: payload.from,
          fromName: payload.fromName,
          to: recipient.email,
          toName: recipient.name,
          subject,
          html,
          text,
          replyTo: payload.replyTo,
          messageId: recipient.messageId,
          metadata: payload.metadata,
        };

        rendered.push(email);
      } catch (error) {
        this.logger.error(
          `Failed to render email for ${recipient.email}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        // Skip this recipient - will be counted as rejected
      }
    }

    return rendered;
  }

  /**
   * Send rendered emails via the adapter.
   */
  private async sendViaAdapter(emails: RenderedEmail[]): Promise<EmailRecipientResult[]> {
    const results: EmailRecipientResult[] = [];

    // Use batch method if available
    if (this.adapter.sendBatch && emails.length > 1) {
      const adapterResults = await this.adapter.sendBatch(emails);

      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        const result = adapterResults[i];

        results.push({
          email: email.to,
          accepted: result?.accepted ?? false,
          messageId: result?.messageId,
          error: result?.error,
        });
      }
    } else {
      // Send individually
      for (const email of emails) {
        try {
          const result = await this.adapter.send(email);

          results.push({
            email: email.to,
            accepted: result.accepted,
            messageId: result.messageId,
            error: result.error,
          });
        } catch (error) {
          results.push({
            email: email.to,
            accepted: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return results;
  }

  /**
   * Compile individual results into a summary.
   */
  private compileResults(results: EmailRecipientResult[]): EmailResult {
    const acceptedCount = results.filter((r) => r.accepted).length;
    const rejectedCount = results.length - acceptedCount;

    return {
      provider: this.adapter.name,
      acceptedCount,
      rejectedCount,
      recipientResults: results,
    };
  }
}
