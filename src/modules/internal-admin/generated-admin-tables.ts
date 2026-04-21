/**
 * ⚠️ AUTO-GENERATED FILE — DO NOT EDIT
 *
 * Generated from prisma/schema.prisma.
 * Safe defaults only. Use TABLE_TO_PRISMA_MAP for overrides.
 */
export const GENERATED_ADMIN_TABLES = {
  identities: {
    prismaDelegate: 'identity',
    writable: false,
  },
  profiles: {
    prismaDelegate: 'profile',
    writable: false,
  },
  gdpr_requests: {
    prismaDelegate: 'request',
    writable: false,
  },
  gdpr_export_files: {
    prismaDelegate: 'gdprExportFile',
    writable: false,
  },
  gdpr_audit_logs: {
    prismaDelegate: 'gdprAuditLog',
    writable: false,
  },
  notification_logs: {
    prismaDelegate: 'notificationLog',
    writable: false,
  },
  scheduled_notifications: {
    prismaDelegate: 'scheduledNotification',
    writable: false,
  },
  user_notification_profile: {
    prismaDelegate: 'userNotificationProfile',
    writable: false,
  },
  user_email_channel: {
    prismaDelegate: 'userEmailChannel',
    writable: false,
  },
  user_push_channel: {
    prismaDelegate: 'userPushChannel',
    writable: false,
  },
  account_suspensions: {
    prismaDelegate: 'accountSuspension',
    writable: false,
  },
  suspension_backups: {
    prismaDelegate: 'suspensionBackup',
    writable: false,
  },
  notification_delivery_log: {
    prismaDelegate: 'notificationDeliveryLog',
    writable: false,
  },
  scheduler_locks: {
    prismaDelegate: 'schedulerLock',
    writable: false,
  },
  gdpr_deletion_emails: {
    prismaDelegate: 'gdprDeletionEmail',
    writable: false,
  },
  deletion_legal_holds: {
    prismaDelegate: 'deletionLegalHold',
    writable: false,
  },
  internal_logs: {
    prismaDelegate: 'internalLog',
    writable: false,
  },
  reports: {
    prismaDelegate: 'report',
    writable: false,
  },
} as const;
