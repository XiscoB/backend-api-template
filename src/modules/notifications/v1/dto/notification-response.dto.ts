import { NotificationLog } from '@prisma/client';

/**
 * DTO for notification response.
 *
 * This DTO defines what gets returned to the client.
 * Never return Prisma models directly.
 *
 * Note: payload is opaque JSON - consumers interpret based on type.
 */
export class NotificationResponseDto {
  /** Notification unique identifier */
  id!: string;

  /** Notification type (semantic only, e.g., GDPR_EXPORT_READY) */
  type!: string;

  /** Opaque payload - interpreted by consumers based on type */
  payload!: Record<string, unknown>;

  /** Optional: Identity who triggered this notification */
  actorId?: string;

  /** When the notification became visible */
  visibleAt!: Date;

  /** When the user marked this as read (null if unread) */
  readAt?: Date;

  /** Notification creation timestamp */
  createdAt!: Date;

  /**
   * Create a NotificationResponseDto from a Prisma NotificationLog.
   */
  static fromEntity(notification: NotificationLog): NotificationResponseDto {
    const dto = new NotificationResponseDto();
    dto.id = notification.id;
    dto.type = notification.type;
    dto.payload = notification.payload as Record<string, unknown>;
    dto.actorId = notification.actorId ?? undefined;
    dto.visibleAt = notification.visibleAt;
    dto.readAt = notification.readAt ?? undefined;
    dto.createdAt = notification.createdAt;
    return dto;
  }

  /**
   * Create multiple DTOs from entities.
   */
  static fromEntities(notifications: NotificationLog[]): NotificationResponseDto[] {
    return notifications.map((n) => NotificationResponseDto.fromEntity(n));
  }
}
