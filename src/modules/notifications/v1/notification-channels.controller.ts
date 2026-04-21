import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../../common/auth/auth.types';
import { NotificationProfileService } from '../notification-profile.service';
import { IdentityService } from '../../identity/identity.service';
import {
  UpsertEmailChannelDto,
  SetEmailEnabledDto,
  NotificationProfileResponseDto,
  EmailChannelResponseDto,
  NotificationProfileWithChannelsResponseDto,
  UpdateNotificationProfileDto,
} from './dto';

/**
 * Notification Channels Controller (v1).
 *
 * Manages user notification delivery channels (email, push).
 * All routes require authentication (global JWT guard).
 *
 * Endpoints:
 * - GET /notification-profile - Get profile with all channels
 * - PUT /notification-profile - Update profile settings
 *
 * Email Channels:
 * - POST /notification-profile/email - Add/update email channel
 * - PUT /notification-profile/email/:id/enabled - Enable/disable
 * - DELETE /notification-profile/email/:id - Remove email channel
 *
 * Push Channels:
 * - POST /notification-profile/push - Register push token
 * - DELETE /notification-profile/push/:id - Deactivate/remove push channel
 *
 * Access: USER, ENTITY roles required
 */
@Controller('v1/notification-profile')
export class NotificationChannelsController {
  constructor(
    private readonly notificationProfileService: NotificationProfileService,
    private readonly identityService: IdentityService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Profile Management
  // ─────────────────────────────────────────────────────────────

  /**
   * Get the current user's notification profile with all channels.
   *
   * If no profile exists, one will be created automatically.
   */
  @Get()
  async getNotificationProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationProfileWithChannelsResponseDto> {
    const identity = await this.identityService.resolveIdentity(user.id);

    // Ensure profile exists
    await this.notificationProfileService.ensureProfileExists(identity.id);

    const profile = await this.notificationProfileService.getProfileWithChannels(identity.id);

    if (!profile) {
      throw new NotFoundException('Notification profile not found');
    }

    return NotificationProfileWithChannelsResponseDto.fromEntity(profile);
  }

  /**
   * Update notification profile settings.
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateNotificationProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationProfileDto,
  ): Promise<NotificationProfileResponseDto> {
    const identity = await this.identityService.resolveIdentity(user.id);

    // Ensure profile exists first
    await this.notificationProfileService.ensureProfileExists(identity.id);

    const profile = await this.notificationProfileService.updateProfile(identity.id, dto);
    return NotificationProfileResponseDto.fromEntity(profile);
  }

  // ─────────────────────────────────────────────────────────────
  // Email Channel Management
  // ─────────────────────────────────────────────────────────────

  /**
   * Add or update an email channel.
   *
   * If an email channel with the same address exists, it will be updated.
   */
  @Post('email')
  @HttpCode(HttpStatus.OK)
  async upsertEmailChannel(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertEmailChannelDto,
  ): Promise<EmailChannelResponseDto> {
    const identity = await this.identityService.resolveIdentity(user.id);

    const channel = await this.notificationProfileService.upsertEmailChannel(
      identity.id,
      dto.email,
      {
        enabled: dto.enabled,
        promoEnabled: dto.promoEnabled,
      },
    );

    return EmailChannelResponseDto.fromEntity(channel);
  }

  /**
   * Enable or disable an email channel.
   */
  @Put('email/:id/enabled')
  @HttpCode(HttpStatus.OK)
  async setEmailEnabled(
    @Param('id', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetEmailEnabledDto,
  ): Promise<EmailChannelResponseDto> {
    await this.verifyEmailChannelOwnership(channelId, user.id);

    const channel = await this.notificationProfileService.setEmailChannelEnabled(
      channelId,
      dto.enabled,
    );

    return EmailChannelResponseDto.fromEntity(channel);
  }

  /**
   * Remove an email channel.
   */
  @Delete('email/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEmailChannel(
    @Param('id', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.verifyEmailChannelOwnership(channelId, user.id);
    await this.notificationProfileService.deleteEmailChannel(channelId);
  }

  // ─────────────────────────────────────────────────────────────
  // Ownership Verification Helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * Verify that the current user owns the email channel.
   */
  private async verifyEmailChannelOwnership(
    channelId: string,
    externalUserId: string,
  ): Promise<void> {
    const identity = await this.identityService.resolveIdentity(externalUserId);
    const profile = await this.notificationProfileService.getProfile(identity.id);

    if (!profile) {
      throw new NotFoundException('Notification profile not found');
    }

    const channel = await this.notificationProfileService.getEmailChannel(channelId);

    if (!channel) {
      throw new NotFoundException('Email channel not found');
    }

    if (channel.notificationProfileId !== profile.id) {
      throw new ForbiddenException('You do not own this email channel');
    }
  }
}
