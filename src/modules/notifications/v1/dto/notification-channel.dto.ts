import { IsString, IsBoolean, IsOptional, IsEmail, MaxLength } from 'class-validator';

/**
 * DTO for creating or updating an email channel.
 */
export class UpsertEmailChannelDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  promoEnabled?: boolean;
}

/**
 * DTO for enabling/disabling an email channel.
 */
export class SetEmailEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

/**
 * DTO for updating notification profile settings.
 */
export class UpdateNotificationProfileDto {
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}
