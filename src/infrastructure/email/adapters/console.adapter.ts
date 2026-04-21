import { Injectable, Logger } from '@nestjs/common';
import { EmailAdapter } from '../types/email-adapter.interface';
import { RenderedEmail, AdapterSendResult } from '../types/email.types';

/**
 * Console email adapter.
 *
 * A development/testing adapter that logs emails instead of sending them.
 * Useful for local development and testing without email provider configuration.
 *
 * Design principles:
 * - Zero configuration required
 * - Visible output for debugging
 * - Same interface as production adapters
 */
@Injectable()
export class ConsoleAdapter implements EmailAdapter {
  private readonly logger = new Logger(ConsoleAdapter.name);

  readonly name = 'console';

  /**
   * "Send" an email by logging it to the console.
   */
  send(email: RenderedEmail): Promise<AdapterSendResult> {
    const messageId = `console-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    this.logger.log('═'.repeat(60));
    this.logger.log('📧 EMAIL (Console Adapter - Not Actually Sent)');
    this.logger.log('─'.repeat(60));
    this.logger.log(
      `From:     ${email.fromName ? `${email.fromName} <${email.from}>` : email.from}`,
    );
    this.logger.log(`To:       ${email.toName ? `${email.toName} <${email.to}>` : email.to}`);
    if (email.replyTo) {
      this.logger.log(`Reply-To: ${email.replyTo}`);
    }
    this.logger.log(`Subject:  ${email.subject}`);
    if (email.messageId) {
      this.logger.log(`ID:       ${email.messageId}`);
    }
    this.logger.log('─'.repeat(60));
    this.logger.log('HTML Body:');
    this.logger.log(email.html.substring(0, 500) + (email.html.length > 500 ? '...' : ''));
    if (email.text) {
      this.logger.log('─'.repeat(60));
      this.logger.log('Text Body:');
      this.logger.log(email.text.substring(0, 300) + (email.text.length > 300 ? '...' : ''));
    }
    if (email.metadata && Object.keys(email.metadata).length > 0) {
      this.logger.log('─'.repeat(60));
      this.logger.log('Metadata:', email.metadata);
    }
    this.logger.log('═'.repeat(60));

    return Promise.resolve({
      accepted: true,
      messageId,
    });
  }

  /**
   * Send batch - logs each email.
   */
  async sendBatch(emails: RenderedEmail[]): Promise<AdapterSendResult[]> {
    this.logger.log(`📧 Processing batch of ${emails.length} email(s)`);

    const results: AdapterSendResult[] = [];
    for (const email of emails) {
      const result = await this.send(email);
      results.push(result);
    }

    return results;
  }
}
