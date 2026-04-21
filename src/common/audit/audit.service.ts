import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * SYSTEM_IDENTITY_EXTERNAL_USER_ID
 *
 * This is used for audit logs that are not associated with a specific user.
 * A SYSTEM identity record will be created lazily with this external user ID.
 */
const SYSTEM_IDENTITY_EXTERNAL_USER_ID = 'SYSTEM';

/**
 * Admin Audit Event.
 *
 * Represents an administrative action performed in the internal admin console.
 */
export interface AdminAuditEvent {
  /** Admin user ID (from JWT sub) */
  adminUserId: string;

  /** Action performed (e.g., 'query_table', 'update_record', 'view_record') */
  action: string;

  /** Entity type affected (e.g., table name) */
  entityType: string;

  /** Entity ID affected (if applicable) */
  entityId?: string;

  /** Additional metadata (JSON) */
  metadata?: Record<string, unknown>;

  /** IP address of the admin (optional) */
  ipAddress?: string;
}

/**
 * Audit Service.
 *
 * Provides append-only audit logging for administrative actions.
 *
 * This service logs to gdpr_audit_logs table (reusing existing infrastructure).
 * All admin console actions MUST be logged for compliance and security.
 *
 * Audit logs are:
 * - Append-only (no updates or deletes)
 * - Immutable after creation
 * - Retained according to GDPR compliance requirements
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private systemIdentityId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get or create the SYSTEM identity for admin audit logs.
   *
   * This identity is used for audit logs that are not associated with
   * a specific user (e.g., admin console actions on infrastructure).
   */
  private async getSystemIdentityId(): Promise<string> {
    if (this.systemIdentityId) {
      return this.systemIdentityId;
    }

    const identity = await this.prisma.identity.upsert({
      where: { externalUserId: SYSTEM_IDENTITY_EXTERNAL_USER_ID },
      create: { externalUserId: SYSTEM_IDENTITY_EXTERNAL_USER_ID },
      update: {},
    });

    this.systemIdentityId = identity.id;
    return identity.id;
  }

  /**
   * Log an admin action to the audit trail.
   *
   * This is fire-and-forget - failures are logged but do not block the operation.
   * Audit logging should never cause user-facing errors.
   *
   * @param event - Admin audit event
   */
  async logAdminAction(event: AdminAuditEvent): Promise<void> {
    try {
      // Get SYSTEM identity for admin audit logs
      const systemIdentityId = await this.getSystemIdentityId();

      await this.prisma.gdprAuditLog.create({
        data: {
          identityId: systemIdentityId, // Use SYSTEM identity for admin actions
          action: 'ADMIN_ACTION', // Generic audit action for admin console operations
          entityType: `admin:${event.action}:${event.entityType}`,
          metadata: {
            admin_user_id: event.adminUserId,
            action: event.action,
            entity_type: event.entityType,
            entity_id: event.entityId,
            ip_address: event.ipAddress,
            ...event.metadata,
          },
          performedBy: event.adminUserId,
        },
      });

      this.logger.debug(
        `Audit: Admin ${event.adminUserId} performed ${event.action} on ${event.entityType}${event.entityId ? `/${event.entityId}` : ''}`,
      );
    } catch (error) {
      // Log the failure but don't throw - audit failures should not block operations
      this.logger.error(
        `Failed to log admin audit event: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Query audit logs for a specific admin user.
   *
   * @param adminUserId - Admin user ID to filter by
   * @param limit - Maximum number of results (default: 100)
   */
  async queryAdminAuditLogs(adminUserId: string, limit = 100): Promise<unknown[]> {
    return await this.prisma.gdprAuditLog.findMany({
      where: {
        performedBy: adminUserId,
        entityType: {
          startsWith: 'admin:',
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: Math.min(limit, 1000), // Hard cap at 1000
    });
  }

  /**
   * Query audit logs for a specific entity.
   *
   * Note: This queries by metadata.entity_id since the entityId
   * is stored in metadata for admin audit logs.
   *
   * @param entityType - Entity type (e.g., 'profiles')
   * @param entityId - Entity ID
   * @param limit - Maximum number of results (default: 100)
   */
  async queryEntityAuditLogs(
    entityType: string,
    entityId: string,
    limit = 100,
  ): Promise<unknown[]> {
    return await this.prisma.gdprAuditLog.findMany({
      where: {
        entityType: {
          contains: entityType,
        },
        // Query by metadata.entity_id since that's where we store it
        metadata: {
          path: ['entity_id'],
          equals: entityId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: Math.min(limit, 1000),
    });
  }
}
