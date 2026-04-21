/**
 * Email infrastructure module.
 *
 * Provides generic, provider-agnostic email delivery for the template backend.
 *
 * Usage:
 * ```typescript
 * import { EmailModule, EmailService } from './infrastructure/email';
 *
 * // In your module
 * @Module({
 *   imports: [EmailModule.forRoot()],
 * })
 * export class AppModule {}
 *
 * // In your service
 * @Injectable()
 * export class MyService {
 *   constructor(private readonly emailService: EmailService) {}
 *
 *   async sendWelcomeEmail(email: string, name: string) {
 *     await this.emailService.send({
 *       templateKey: 'welcome',
 *       from: 'noreply@example.com',
 *       recipients: [{ email, name }],
 *       locale: 'en',
 *       variables: { name, appName: 'My App' },
 *     });
 *   }
 * }
 * ```
 */

// Module
export { EmailModule } from './email.module';

// Service
export { EmailService } from './email.service';

// Types
export {
  EmailPayload,
  EmailRecipient,
  EmailResult,
  EmailRecipientResult,
  RenderedEmail,
  AdapterSendResult,
} from './types/email.types';

export { EmailAdapter, EMAIL_ADAPTER } from './types/email-adapter.interface';

// Config
export { EmailConfigService } from './config/email-config.service';

// Templates
export { EmailTemplateResolver } from './templates/template-resolver.service';
export {
  EmailTemplateDefinition,
  EmailTemplateFile,
  ResolvedEmailTemplate,
} from './templates/template.types';

// Adapters (for custom adapter implementation)
export { SparkPostAdapter } from './adapters/sparkpost.adapter';
export { SesAdapter } from './adapters/ses.adapter';
export { ConsoleAdapter } from './adapters/console.adapter';
