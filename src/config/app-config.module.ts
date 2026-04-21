import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { appConfigValidationSchema } from './app-config.validation';
import { AppConfigService } from './app-config.service';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: appConfigValidationSchema,
      validationOptions: {
        abortEarly: true,
        allowUnknown: true,
      },
    }),
  ],
  providers: [ConfigService, AppConfigService],
  exports: [
    AppConfigService,
    ConfigModule, // ✅ REQUIRED
    ConfigService, // ✅ (explicit is better than implicit)
  ],
})
export class AppConfigModule {}
