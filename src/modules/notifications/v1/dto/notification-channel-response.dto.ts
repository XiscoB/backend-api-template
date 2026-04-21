import { UserNotificationProfile, UserEmailChannel } from '@prisma/client';

/**
 * Response DTO for notification profile.
 */
export class NotificationProfileResponseDto {
  id!: string;
  notificationsEnabled!: boolean;
  language!: string;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(entity: UserNotificationProfile): NotificationProfileResponseDto {
    const dto = new NotificationProfileResponseDto();
    dto.id = entity.id;
    dto.notificationsEnabled = entity.notificationsEnabled;
    dto.language = entity.language;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

/**
 * Response DTO for email channel.
 */
export class EmailChannelResponseDto {
  id!: string;
  email!: string;
  enabled!: boolean;
  promoEnabled!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(entity: UserEmailChannel): EmailChannelResponseDto {
    const dto = new EmailChannelResponseDto();
    dto.id = entity.id;
    dto.email = entity.email;
    dto.enabled = entity.enabled;
    dto.promoEnabled = entity.promoEnabled;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  static fromEntities(entities: UserEmailChannel[]): EmailChannelResponseDto[] {
    return entities.map((e) => EmailChannelResponseDto.fromEntity(e));
  }
}

/**
 * Response DTO for notification profile with channels.
 */
export class NotificationProfileWithChannelsResponseDto {
  profile!: NotificationProfileResponseDto;
  emailChannels!: EmailChannelResponseDto[];

  static fromEntity(
    profile: UserNotificationProfile & {
      emailChannels: UserEmailChannel[];
    },
  ): NotificationProfileWithChannelsResponseDto {
    const dto = new NotificationProfileWithChannelsResponseDto();
    dto.profile = NotificationProfileResponseDto.fromEntity(profile);
    dto.emailChannels = EmailChannelResponseDto.fromEntities(profile.emailChannels);
    return dto;
  }
}
