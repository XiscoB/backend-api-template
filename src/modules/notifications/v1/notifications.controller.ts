import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../../common/auth/auth.types';
import { NotificationsService } from '../notifications.service';
import { NotificationResponseDto, UnreadExistsResponseDto, MarkAllReadResponseDto } from './dto';

/**
 * Notifications controller (v1).
 *
 * Handles HTTP concerns for notification operations.
 * All routes require authentication (global JWT guard).
 *
 * This is base UX infrastructure:
 * - No domain-specific logic
 * - No notification type interpretation
 * - All operations scoped to current user only
 *
 * Access: USER, ENTITY roles required
 */
@Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * List notifications for current user.
   *
   * Returns visible, non-deleted notifications sorted by visibleAt DESC.
   * Supports optional pagination via skip/take query params.
   *
   * @example GET /api/v1/notifications
   * @example GET /api/v1/notifications?take=20&skip=0
   */
  @Get()
  async listNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ): Promise<NotificationResponseDto[]> {
    const pagination = {
      take: take ? parseInt(take, 10) : 50, // Default limit
      skip: skip ? parseInt(skip, 10) : 0,
    };

    const notifications = await this.notificationsService.getNotificationsForUser(
      user.id,
      {}, // Default filters (visible, non-deleted)
      pagination,
    );

    return NotificationResponseDto.fromEntities(notifications);
  }

  /**
   * Check if user has any unread notifications.
   *
   * Fast O(1) query using EXISTS/LIMIT 1.
   * Ideal for badge/dot UI indicators.
   *
   * @example GET /api/v1/notifications/unread-exists
   */
  @Get('unread-exists')
  async hasUnread(@CurrentUser() user: AuthenticatedUser): Promise<UnreadExistsResponseDto> {
    const hasUnread = await this.notificationsService.hasUnread(user.id);
    return UnreadExistsResponseDto.create(hasUnread);
  }

  /**
   * Mark a specific notification as read.
   *
   * Only works for notifications owned by the current user.
   * Idempotent: if already read, returns current state.
   *
   * @example POST /api/v1/notifications/:id/read
   *
   * @throws 404 if notification not found or not owned by user
   */
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notificationsService.markAsReadForUser(id, user.id);

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return NotificationResponseDto.fromEntity(notification);
  }

  /**
   * Mark all notifications as read for current user.
   *
   * Returns count of notifications marked as read.
   * Idempotent: already-read notifications are not counted.
   *
   * @example POST /api/v1/notifications/read-all
   */
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser): Promise<MarkAllReadResponseDto> {
    const count = await this.notificationsService.markAllAsRead(user.id);
    return MarkAllReadResponseDto.create(count);
  }
}
