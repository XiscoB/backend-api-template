/**
 * Spanish (es)
 *
 * All user-facing text in the system (Spanish translation).
 * Structure matches en.ts exactly.
 *
 * @see docs/agents.md - Translations are static constants, no i18n system
 */
import { TranslationSchema } from './en';

export const ES: TranslationSchema = {
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
    yes: 'Sí',
    no: 'No',
    notAvailable: 'N/D',
    none: 'Ninguno',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Notifications
  // ─────────────────────────────────────────────────────────────────────────
  notifications: {
    // GDPR Export
    gdprExportReady: {
      title: 'Tu exportación de datos está lista',
      body: 'Tu exportación de datos ya está disponible para descargar.',
    },
    gdprExportFailed: {
      title: 'La exportación de datos falló',
      body: 'No se pudo completar tu solicitud de exportación de datos. Por favor, intenta nuevamente o contacta a soporte.',
    },
    gdprExportExpired: {
      title: 'Tu exportación de datos ha expirado',
      body: 'Tu exportación de datos ya no está disponible. Solicita una nueva exportación si lo necesitas.',
    },
    gdprExportDeleted: {
      title: 'Tu exportación de datos ha sido eliminada',
      body: 'Tu archivo de exportación de datos ha sido eliminado permanentemente por tu privacidad.',
    },

    // GDPR Delete
    gdprDeleteCompleted: {
      title: 'Tus datos han sido eliminados',
      body: 'Tus datos personales han sido borrados permanentemente de nuestros sistemas.',
    },

    // GDPR Suspension
    gdprSuspendCompleted: {
      title: 'Tu cuenta ha sido suspendida',
      body: 'El procesamiento de datos de tu cuenta ha sido restringido según lo solicitado.',
    },
    gdprResumeCompleted: {
      title: 'Tu cuenta ha sido reactivada',
      body: 'Tu cuenta ha sido restaurada y el procesamiento de datos ha sido reanudado.',
    },
    gdprSuspensionExpiring: {
      title: 'Tu cuenta suspendida será eliminada pronto',
      // Body uses placeholder: daysRemaining
      bodyTemplate:
        'Tu cuenta suspendida será eliminada permanentemente en {{daysRemaining}} días a menos que la reactives.',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Admin console labels
  // ─────────────────────────────────────────────────────────────────────────
  admin: {
    // Notification delivery status labels
    notificationStatus: {
      SENT: 'Enviado',
      SKIPPED: 'Omitido',
      FAILED: 'Fallido',
      PENDING: 'Pendiente',
    },

    // Request status labels
    requestStatus: {
      PENDING: 'Pendiente',
      PROCESSING: 'Procesando',
      COMPLETED: 'Completado',
      FAILED: 'Fallido',
      CANCELLED: 'Cancelado',
      EXPIRED: 'Expirado',
    },
    channelType: {
      EMAIL: 'Correo electrónico',
      PUSH: 'Push',
      NONE: 'Ninguno',
    },
    scheduledStatus: {
      PENDING: 'Pendiente',
      EXECUTED: 'Ejecutado',
      FAILED: 'Fallido',
      CANCELLED: 'Cancelado',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GDPR Export Document
  // ─────────────────────────────────────────────────────────────────────────
  gdpr: {
    // Document metadata
    document: {
      title: 'Tu Exportación de Datos',
      generated: 'Generado',
      exportId: 'ID de Exportación',
      schemaVersion: 'Versión del Esquema',
      toc: 'Contenidos',
      footer: {
        gdprNotice:
          'Este documento contiene tus datos personales según lo requerido por el Artículo 15 del RGPD (Derecho de Acceso).',
        generatedOn: 'Generado el',
        confidential:
          'Esta exportación es confidencial. Manténla segura y no la compartas con partes no autorizadas.',
      },
    },

    // Section: Identity
    sections: {
      identity: {
        title: 'Tu Identidad',
        description:
          'Esta sección contiene la información básica de tu cuenta que te identifica en nuestro sistema.',
      },
      profile: {
        title: 'Tu Perfil',
        description: 'Esta sección contiene tu información de perfil público.',
      },
      notifications: {
        title: 'Historial de Notificaciones',
        description: 'Esta sección contiene todas las notificaciones que se te han enviado.',
        // Summary uses placeholder: count
        summaryTemplate: 'Total de notificaciones: {{count}}',
      },
      preferences: {
        title: 'Preferencias de Comunicación',
        description: 'Esta sección contiene tus preferencias de entrega de notificaciones.',
        // Summary uses placeholder: channels
        summaryTemplate: 'Canales habilitados: {{channels}}',
      },
    },

    // Field labels and explanations
    fields: {
      // Identity fields
      identityId: {
        label: 'ID de Identidad Interno',
        explanation: 'Este es tu identificador único en nuestro sistema. Vincula todos tus datos.',
      },
      externalUserId: {
        label: 'ID de Usuario Externo',
        explanation:
          'Este es tu identificador de nuestro proveedor de autenticación. Se asigna a tus credenciales de inicio de sesión.',
      },
      isFlagged: {
        label: 'Cuenta Marcada',
        explanation:
          'Indica si tu cuenta ha sido marcada para revisión por nuestro equipo de moderación.',
      },
      isSuspended: {
        label: 'Cuenta Suspendida',
        explanation:
          'Indica si tu cuenta está actualmente suspendida (Derecho a la Restricción del Procesamiento).',
      },
      lastActivity: {
        label: 'Última Actividad',
        explanation: 'La última vez que interactuaste con nuestra plataforma.',
      },
      createdAt: {
        label: 'Cuenta Creada',
        explanation: 'Cuando se creó tu cuenta por primera vez en nuestro sistema.',
      },

      // Profile fields
      displayName: {
        label: 'Nombre para Mostrar',
        explanation:
          'Este es el nombre que elegiste al crear tu perfil. Es visible para otros usuarios.',
      },
      language: {
        label: 'Idioma Preferido',
        explanation:
          'Tu idioma preferido para notificaciones, correos electrónicos y exportaciones GDPR.',
      },
      updatedAt: {
        label: 'Última Actualización',
        explanation: 'Cuándo se modificaron estos datos por última vez.',
      },

      // Notification fields
      notificationId: {
        label: 'ID de Notificación',
        explanation: 'Identificador único para esta notificación.',
      },
      notificationType: {
        label: 'Tipo',
        explanation: 'La categoría de esta notificación.',
      },
      notificationTitle: {
        label: 'Título',
        explanation: 'El encabezado de la notificación.',
      },
      notificationBody: {
        label: 'Mensaje',
        explanation: 'El contenido de la notificación.',
      },
      isRead: {
        label: 'Estado de Lectura',
        explanation: 'Si has leído esta notificación.',
      },
      readAt: {
        label: 'Leído En',
        explanation: 'Cuándo marcaste esta notificación como leída.',
      },

      // Notification Preferences fields
      preferencesId: {
        label: 'ID de Preferencias',
        explanation: 'Identificador único para tus preferencias de notificación.',
      },
      channels: {
        label: 'Canales Habilitados',
        explanation: 'Los métodos de entrega que has habilitado (p. ej., Email, Push, SMS).',
      },

      // Email channel fields
      emailAddress: {
        label: 'Dirección de Email',
        explanation: 'Tu dirección de correo electrónico registrada para notificaciones.',
      },
      emailEnabled: {
        label: 'Notificaciones por Email',
        explanation: 'Si recibes notificaciones transaccionales en este correo.',
      },
      emailPromoEnabled: {
        label: 'Emails Promocionales',
        explanation: 'Si recibes correos promocionales/marketing en esta dirección.',
      },

      // Push channel fields
      pushPlatform: {
        label: 'Plataforma del Dispositivo',
        explanation: 'El tipo de dispositivo registrado para notificaciones push (iOS/Android).',
      },
      pushDeviceKey: {
        label: 'Identificador del Dispositivo',
        explanation: 'Un identificador único para este dispositivo (no el número de serie).',
      },
      pushToken: {
        label: 'Token Push',
        explanation:
          'Tu token de notificaciones push (parcialmente oculto por seguridad). Este token se usa para entregar notificaciones a tu dispositivo.',
      },
      pushActive: {
        label: 'Push Activo',
        explanation: 'Si las notificaciones push están actualmente activas para este dispositivo.',
      },
    },
  },
} as const;
