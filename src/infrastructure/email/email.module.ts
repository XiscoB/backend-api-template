import { Module, DynamicModule, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { EmailConfigService } from './config/email-config.service';
import { EmailTemplateResolver } from './templates/template-resolver.service';
import { SparkPostAdapter } from './adapters/sparkpost.adapter';
import { SesAdapter } from './adapters/ses.adapter';
import { ConsoleAdapter } from './adapters/console.adapter';
import { EMAIL_ADAPTER } from './types/email-adapter.interface';

/**
 * Email module.
 *
 * Provides email delivery infrastructure with provider-agnostic design.
 * The module automatically selects the appropriate adapter based on
 * environment configuration.
 *
 * Usage:
 * 1. Import EmailModule in your AppModule
 * 2. Configure EMAIL_PROVIDER environment variable
 * 3. Inject EmailService where needed
 *
 * Providers:
 * - 'console': Development/testing (default, no configuration needed)
 * - 'sparkpost': Production email delivery via SparkPost
 * - 'ses': Production email delivery via Amazon SES
 *
 * Example:
 * ```typescript
 * @Module({
 *   imports: [EmailModule.forRoot()],
 * })
 * export class AppModule {}
 * ```
 */
@Module({}) // Dynamic module: use forRoot() or forTesting() - bare import provides no providers
export class EmailModule {
  private static readonly logger = new Logger(EmailModule.name);

  /**
   * Configure the email module.
   *
   * Automatically selects the email adapter based on EMAIL_PROVIDER
   * environment variable.
   */
  static forRoot(): DynamicModule {
    return {
      module: EmailModule,
      imports: [ConfigModule],
      providers: [
        // Configuration
        EmailConfigService,

        // Template resolution
        EmailTemplateResolver,

        // Adapters (all registered, one selected)
        SparkPostAdapter,
        SesAdapter,
        ConsoleAdapter,

        // Adapter selection factory
        {
          provide: EMAIL_ADAPTER,
          useFactory: (
            config: ConfigService,
            sparkpost: SparkPostAdapter,
            ses: SesAdapter,
            console: ConsoleAdapter,
          ): SparkPostAdapter | SesAdapter | ConsoleAdapter => {
            const provider = config.get<string>('EMAIL_PROVIDER', 'console');

            switch (provider) {
              case 'sparkpost':
                this.logger.log('Email adapter: SparkPost');
                return sparkpost;

              case 'ses':
                this.logger.log('Email adapter: Amazon SES');
                return ses;

              case 'console':
              default:
                this.logger.log('Email adapter: Console (development mode)');
                return console;
            }
          },
          inject: [ConfigService, SparkPostAdapter, SesAdapter, ConsoleAdapter],
        },

        // Main service
        EmailService,
      ],
      exports: [EmailService, EmailConfigService],
    };
  }

  /**
   * Configure the email module for testing.
   *
   * Always uses the console adapter, regardless of environment.
   */
  static forTesting(): DynamicModule {
    return {
      module: EmailModule,
      providers: [
        EmailConfigService,
        EmailTemplateResolver,
        ConsoleAdapter,
        {
          provide: EMAIL_ADAPTER,
          useExisting: ConsoleAdapter,
        },
        EmailService,
      ],
      exports: [EmailService, EmailConfigService],
    };
  }
}
