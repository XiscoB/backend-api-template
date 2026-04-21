/**
 * English (en) - Default Language
 *
 * All user-facing text in the system.
 * Structure: domain.context.key
 *
 * @see docs/agents.md - Translations are static constants, no i18n system
 */

// Type definition for translation values - allows different strings across languages
interface TranslationStrings {
  branding: {
    companyName: string;
  };
  common: {
    yes: string;
    no: string;
    notAvailable: string;
    none: string;
  };
  notifications: {
    gdprExportReady: { title: string; body: string };
    gdprExportFailed: { title: string; body: string };
    gdprExportExpired: { title: string; body: string };
    gdprExportDeleted: { title: string; body: string };
    gdprDeleteCompleted: { title: string; body: string };
    gdprSuspendCompleted: { title: string; body: string };
    gdprResumeCompleted: { title: string; body: string };
    gdprSuspensionExpiring: { title: string; bodyTemplate: string };
  };
  admin: {
    notificationStatus: {
      SENT: string;
      SKIPPED: string;
      FAILED: string;
      PENDING: string;
    };
    requestStatus: {
      PENDING: string;
      PROCESSING: string;
      COMPLETED: string;
      FAILED: string;
      CANCELLED: string;
      EXPIRED: string;
    };
    channelType: {
      EMAIL: string;
      PUSH: string;
      NONE: string;
    };
    scheduledStatus: {
      PENDING: string;
      EXECUTED: string;
      FAILED: string;
      CANCELLED: string;
    };
  };
  gdpr: {
    document: {
      title: string;
      generated: string;
      exportId: string;
      schemaVersion: string;
      toc: string;
      footer: {
        gdprNotice: string;
        generatedOn: string;
        confidential: string;
      };
    };
    sections: {
      identity: { title: string; description: string };
      profile: { title: string; description: string };
      notifications: { title: string; description: string; summaryTemplate: string };
      preferences: { title: string; description: string; summaryTemplate: string };
    };
    fields: {
      identityId: { label: string; explanation: string };
      externalUserId: { label: string; explanation: string };
      isFlagged: { label: string; explanation: string };
      isSuspended: { label: string; explanation: string };
      lastActivity: { label: string; explanation: string };
      createdAt: { label: string; explanation: string };
      displayName: { label: string; explanation: string };
      language: { label: string; explanation: string };
      updatedAt: { label: string; explanation: string };
      notificationId: { label: string; explanation: string };
      notificationType: { label: string; explanation: string };
      notificationTitle: { label: string; explanation: string };
      notificationBody: { label: string; explanation: string };
      isRead: { label: string; explanation: string };
      readAt: { label: string; explanation: string };
      preferencesId: { label: string; explanation: string };
      channels: { label: string; explanation: string };
      // Email channel fields
      emailAddress: { label: string; explanation: string };
      emailEnabled: { label: string; explanation: string };
      emailPromoEnabled: { label: string; explanation: string };
      // Push channel fields
      pushPlatform: { label: string; explanation: string };
      pushDeviceKey: { label: string; explanation: string };
      pushToken: { label: string; explanation: string };
      pushActive: { label: string; explanation: string };
    };
  };
}

export const EN: TranslationStrings = {
  // ─────────────────────────────────────────────────────────────────────────
  // Branding
  // ─────────────────────────────────────────────────────────────────────────
  branding: {
    companyName: 'Template-base',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Common text (shared across domains)
  // ─────────────────────────────────────────────────────────────────────────
  common: {
    yes: 'Yes',
    no: 'No',
    notAvailable: 'N/A',
    none: 'None',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Notifications
  // ─────────────────────────────────────────────────────────────────────────
  notifications: {
    // GDPR Export
    gdprExportReady: {
      title: 'Your data export is ready',
      body: 'Your requested data export is now available for download.',
    },
    gdprExportFailed: {
      title: 'Data export failed',
      body: 'Your data export request could not be completed. Please try again or contact support.',
    },
    gdprExportExpired: {
      title: 'Your data export has expired',
      body: 'Your data export is no longer available. Please request a new export if needed.',
    },
    gdprExportDeleted: {
      title: 'Your data export has been removed',
      body: 'Your data export file has been permanently deleted for your privacy.',
    },

    // GDPR Delete
    gdprDeleteCompleted: {
      title: 'Your data has been deleted',
      body: 'Your personal data has been permanently erased from our systems.',
    },

    // GDPR Suspension
    gdprSuspendCompleted: {
      title: 'Your account has been suspended',
      body: 'Your account data processing has been restricted as requested.',
    },
    gdprResumeCompleted: {
      title: 'Your account has been reactivated',
      body: 'Your account has been restored and data processing has resumed.',
    },
    gdprSuspensionExpiring: {
      title: 'Your suspended account will be deleted soon',
      // Body uses placeholder: daysRemaining
      bodyTemplate:
        'Your suspended account will be permanently deleted in {{daysRemaining}} days unless you reactivate it.',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Admin console labels
  // ─────────────────────────────────────────────────────────────────────────
  admin: {
    // Notification delivery status labels
    notificationStatus: {
      SENT: 'Sent',
      SKIPPED: 'Skipped',
      FAILED: 'Failed',
      PENDING: 'Pending',
    },

    // Request status labels
    requestStatus: {
      PENDING: 'Pending',
      PROCESSING: 'Processing',
      COMPLETED: 'Completed',
      FAILED: 'Failed',
      CANCELLED: 'Cancelled',
      EXPIRED: 'Expired',
    },
    channelType: {
      EMAIL: 'Email',
      PUSH: 'Push',
      NONE: 'None',
    },
    scheduledStatus: {
      PENDING: 'Pending',
      EXECUTED: 'Executed',
      FAILED: 'Failed',
      CANCELLED: 'Cancelled',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GDPR Export Document
  // ─────────────────────────────────────────────────────────────────────────
  gdpr: {
    // Document metadata
    document: {
      title: 'Your Data Export',
      generated: 'Generated',
      exportId: 'Export ID',
      schemaVersion: 'Schema Version',
      toc: 'Contents',
      footer: {
        gdprNotice:
          'This document contains your personal data as required by GDPR Article 15 (Right of Access).',
        generatedOn: 'Generated on',
        confidential:
          'This export is confidential. Keep it secure and do not share it with unauthorized parties.',
      },
    },

    // Section: Identity
    sections: {
      identity: {
        title: 'Your Identity',
        description:
          'This section contains your core account information that identifies you in our system.',
      },
      profile: {
        title: 'Your Profile',
        description: 'This section contains your public profile information.',
      },
      notifications: {
        title: 'Notification History',
        description: 'This section contains all notifications that have been sent to you.',
        // Summary uses placeholder: count
        summaryTemplate: 'Total notifications: {{count}}',
      },
      preferences: {
        title: 'Communication Preferences',
        description: 'This section contains your notification delivery preferences.',
        // Summary uses placeholder: channels
        summaryTemplate: 'Enabled channels: {{channels}}',
      },
    },

    // Field labels and explanations
    fields: {
      // Identity fields
      identityId: {
        label: 'Internal Identity ID',
        explanation:
          'This is your unique identifier in our system. It links all your data together.',
      },
      externalUserId: {
        label: 'External User ID',
        explanation:
          'This is your identifier from our authentication provider. It maps to your login credentials.',
      },
      isFlagged: {
        label: 'Account Flagged',
        explanation:
          'Indicates if your account has been flagged for review by our moderation team.',
      },
      isSuspended: {
        label: 'Account Suspended',
        explanation:
          'Indicates if your account is currently suspended (Right to Restriction of Processing).',
      },
      lastActivity: {
        label: 'Last Activity',
        explanation: 'The last time you interacted with our platform.',
      },
      createdAt: {
        label: 'Account Created',
        explanation: 'When your account was first created in our system.',
      },

      // Profile fields
      displayName: {
        label: 'Display Name',
        explanation:
          'This is the name you chose when creating your profile. It is visible to other users.',
      },
      language: {
        label: 'Preferred Language',
        explanation: 'Your preferred language for notifications, emails, and GDPR exports.',
      },
      updatedAt: {
        label: 'Last Updated',
        explanation: 'When this data was last modified.',
      },

      // Notification fields
      notificationId: {
        label: 'Notification ID',
        explanation: 'Unique identifier for this notification.',
      },
      notificationType: {
        label: 'Type',
        explanation: 'The category of this notification.',
      },
      notificationTitle: {
        label: 'Title',
        explanation: 'The notification headline.',
      },
      notificationBody: {
        label: 'Message',
        explanation: 'The notification content.',
      },
      isRead: {
        label: 'Read Status',
        explanation: 'Whether you have read this notification.',
      },
      readAt: {
        label: 'Read At',
        explanation: 'When you marked this notification as read.',
      },

      // Notification Preferences fields
      preferencesId: {
        label: 'Preferences ID',
        explanation: 'Unique identifier for your notification preferences.',
      },
      channels: {
        label: 'Enabled Channels',
        explanation: 'The delivery methods you have enabled (e.g., Email, Push, SMS).',
      },

      // Email channel fields
      emailAddress: {
        label: 'Email Address',
        explanation: 'Your registered email address for notifications.',
      },
      emailEnabled: {
        label: 'Email Notifications',
        explanation: 'Whether you receive transactional notifications at this email.',
      },
      emailPromoEnabled: {
        label: 'Marketing Emails',
        explanation: 'Whether you receive promotional/marketing emails at this address.',
      },

      // Push channel fields
      pushPlatform: {
        label: 'Device Platform',
        explanation: 'The type of device registered for push notifications (iOS/Android).',
      },
      pushDeviceKey: {
        label: 'Device Identifier',
        explanation: "A unique identifier for this device (not your device's serial number).",
      },
      pushToken: {
        label: 'Push Token',
        explanation:
          'Your push notification token (partially masked for security). This token is used to deliver notifications to your device.',
      },
      pushActive: {
        label: 'Push Active',
        explanation: 'Whether push notifications are currently active for this device.',
      },
    },
  },
};

/**
 * Type for the translation object structure.
 * Used to ensure all language files have the same shape.
 */
export type TranslationSchema = TranslationStrings;
