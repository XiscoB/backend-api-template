import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdentityModule } from '../identity/identity.module';
import { EmailModule } from '../../infrastructure/email/email.module';
import { GdprRepository } from './gdpr.repository';
import { GdprRequestProcessorService } from './gdpr-request-processor.service';
import { GdprDataCollectorService } from './gdpr-data-collector.service';
import { GdprDynamicCollectorService } from './gdpr-dynamic-collector.service';
import { GdprDataOrchestratorService } from './gdpr-data-orchestrator.service';
import { GdprLocalizationService } from './gdpr-localization.service';
import { GdprDocumentBuilderService } from './gdpr-document-builder.service';
import { GdprExportService } from './gdpr-export.service';
import { GdprDeletionService } from './gdpr-deletion.service';
import { GdprDeletionLifecycleService } from './gdpr-deletion-lifecycle.service';
import { GdprSuspensionService } from './gdpr-suspension.service';
import { GdprSuspensionEscalationService } from './gdpr-suspension-escalation.service';
import { GdprAnonymizationService } from './gdpr-anonymization.service';
import { GdprOwnershipResolutionStrategy } from './strategies/gdpr-ownership-resolution.strategy';
import { GdprFieldAnonymizationStrategy } from './strategies/gdpr-field-anonymization.strategy';
import { GdprBackupStrategy } from './strategies/gdpr-backup.strategy';
import { GdprDeletionStrategy } from './strategies/gdpr-deletion.strategy';
import { GdprRestorationStrategy } from './strategies/gdpr-restoration.strategy';
import { GdprEnforcementService } from './gdpr-enforcement.service';
import { GdprCronService } from './gdpr-cron.service';
import { RequestMonitoringService } from './request-monitoring.service';
import { GdprController } from './v1/gdpr.controller';

// Phase 4: Export Rendering, Packaging & Storage
import { GdprHtmlRenderer } from './gdpr-html-renderer.service';
import { GdprExportPackager } from './gdpr-export-packager.service';
import { GDPR_EXPORT_STORAGE, GdprExportStorage } from './gdpr-export-storage.interface';
import { GdprLocalStorageAdapter } from './gdpr-local-storage.adapter';
import { GdprExportPipelineService } from './gdpr-export-pipeline.service';

// Phase 5: Export Delivery & Access Control
import { GdprS3StorageAdapter } from './gdpr-s3-storage.adapter';
import { GdprExportDeliveryService } from './gdpr-export-delivery.service';

// Phase 6: Export Cleanup & Operational Hardening
import { GdprExportCleanupService } from './gdpr-export-cleanup.service';
import { GdprAdminService } from './gdpr-admin.service';
import { GdprAdminController } from './v1/gdpr-admin.controller';

// Phase 7: Notification Hooks
import { GdprNotificationHooks } from './gdpr-notification-hooks.service';

// Phase 8: Deletion Confirmation Email
import { GdprDeletionEmailService } from './gdpr-deletion-email.service';

// Phase 9: Deletion Legal Hold Infrastructure
import { DeletionLegalHoldService } from './deletion-legal-hold.service';

// Phase 10: Internal Operational Logs
import { InternalLogService } from './internal-log.service';

// Phase 11: Integrity Monitoring
import { GdprIntegrityMonitor } from './integrity/gdpr-integrity.monitor';

// Phase 12: Compliance Reporting
import { GdprComplianceReportJob } from './reporting/gdpr-compliance-report.job';

/**
 * GDPR Module
 *
 * Provides GDPR compliance features for the application.
 *
 * Features:
 * - Request Initiation: Users can request GDPR operations (export, delete, suspend)
 * - Request Processing: Background processing of GDPR requests through safe lifecycles
 * - Data Collection: Gathers user data from registered GDPR tables
 * - Document Building: Constructs semantic export documents (Phase 3.5)
 * - Export Rendering: Renders documents to self-contained HTML (Phase 4)
 * - Export Packaging: Packages HTML into ZIP archives (Phase 4)
 * - Export Storage: Stores exports securely (Phase 4)
 * - Export Delivery: Secure download via presigned URLs (Phase 5)
 * - Access Control: Users can only access their own exports (Phase 5)
 * - Expiry Enforcement: Expired exports return 410 Gone (Phase 5)
 * - Data Export: Users can request and download their personal data
 * - Data Deletion: Users can request erasure of their personal data
 * - Data Suspension: Users can request temporary restriction of processing
 * - Audit Logging: All GDPR operations are logged for compliance
 * - Registry Enforcement: Validates all user data tables are declared
 * - Cron-compatible services: Background processing for exports, deletions, suspensions
 * - Request Monitoring: Detection of stuck/failed requests (opt-in hooks)
 *
 * Architecture:
 * - GdprRequestProcessorService: Handles request lifecycle management (Phase 2)
 * - GdprDataCollectorService: Collects data from individual GDPR sources (Phase 3)
 * - GdprDataOrchestratorService: Orchestrates complete data collection (Phase 3)
 * - GdprLocalizationService: Provides language-aware text lookup (Phase 3.5)
 * - GdprDocumentBuilderService: Builds semantic export documents (Phase 3.5)
 * - GdprHtmlRenderer: Renders documents to self-contained HTML (Phase 4)
 * - GdprExportPackager: Packages HTML into ZIP archives (Phase 4)
 * - GdprExportStorage: Abstract storage interface (Phase 4)
 * - GdprLocalStorageAdapter: Development filesystem storage (Phase 4)
 * - GdprS3StorageAdapter: Production AWS S3 storage (Phase 5)
 * - GdprExportPipelineService: Orchestrates render→package→store (Phase 4)
 * - GdprExportDeliveryService: Secure download & access control (Phase 5)
 * - GdprExportService: Handles data export pipeline
 * - GdprDeletionService: Handles data deletion pipeline
 * - GdprSuspensionService: Handles data suspension and resume pipeline
 * - GdprSuspensionEscalationService: Handles auto-escalation to deletion
 * - GdprRegistry: Declares which tables contain user data (static config)
 * - GdprEnforcementService: Validates registry completeness at startup
 * - GdprCronService: Cron-compatible methods for background processing
 * - RequestMonitoringService: Detects problematic requests, emits hooks
 * - GdprRepository: Database access for requests and audit logs
 *
 * Storage Configuration:
 * - Development: Uses GdprLocalStorageAdapter (filesystem)
 * - Production: Uses GdprS3StorageAdapter (AWS S3)
 * - Swap via GDPR_EXPORT_STORAGE token in providers
 *
 * Ownership: All GDPR operations work through Identity (identityId).
 *
 * @see gdpr.registry.ts for table declarations
 * @see gdpr-collection.types.ts for data structure definitions
 * @see gdpr-export-document.types.ts for export document types
 * @see docs/create_tables_guideline.md for Identity ownership rules
 * @see agents.md for GDPR implementation guidelines
 */
@Module({
  imports: [PrismaModule, NotificationsModule, IdentityModule, ConfigModule, EmailModule.forRoot()],
  controllers: [GdprController, GdprAdminController],
  providers: [
    GdprRepository,
    GdprRequestProcessorService,
    GdprDataCollectorService,
    GdprDynamicCollectorService,
    GdprDataOrchestratorService,
    GdprLocalizationService,
    GdprDocumentBuilderService,
    GdprExportService,
    GdprDeletionService,
    GdprDeletionLifecycleService,
    GdprAnonymizationService,
    GdprOwnershipResolutionStrategy,
    GdprFieldAnonymizationStrategy,
    GdprBackupStrategy,
    GdprDeletionStrategy,
    GdprRestorationStrategy,
    GdprSuspensionService,
    GdprSuspensionEscalationService,
    GdprEnforcementService,
    GdprCronService,
    RequestMonitoringService,

    // Phase 4: Export Rendering, Packaging & Storage
    GdprHtmlRenderer,
    GdprExportPackager,
    {
      provide: GDPR_EXPORT_STORAGE,
      useFactory: (configService: ConfigService): GdprExportStorage => {
        // Use S3 storage when AWS is configured, otherwise use local storage
        const awsConfigured =
          process.env.AWS_REGION &&
          process.env.AWS_S3_BUCKET_NAME &&
          (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE);

        return awsConfigured
          ? new GdprS3StorageAdapter(configService)
          : new GdprLocalStorageAdapter();
      },
      inject: [ConfigService],
    },
    GdprExportPipelineService,

    // Phase 5: Export Delivery & Access Control
    GdprS3StorageAdapter,
    GdprExportDeliveryService,

    // Phase 6: Export Cleanup & Operational Hardening
    GdprExportCleanupService,
    GdprAdminService,

    // Phase 7: Notification Hooks
    GdprNotificationHooks,

    // Phase 8: Deletion Confirmation Email
    GdprDeletionEmailService,

    // Phase 9: Deletion Legal Hold Infrastructure
    DeletionLegalHoldService,

    // Phase 10: Internal Operational Logs
    InternalLogService,

    // Phase 11: Integrity Monitoring
    GdprIntegrityMonitor,

    // Phase 12: Compliance Reporting
    GdprComplianceReportJob,
  ],
  exports: [
    GdprRequestProcessorService,
    GdprDataCollectorService,
    GdprDynamicCollectorService,
    GdprDataOrchestratorService,
    GdprLocalizationService,
    GdprDocumentBuilderService,
    GdprExportService,
    GdprDeletionService,
    GdprDeletionLifecycleService,
    GdprSuspensionService,
    GdprSuspensionEscalationService,
    GdprEnforcementService,
    GdprCronService,
    RequestMonitoringService,

    // Phase 4: Export Pipeline
    GdprHtmlRenderer,
    GdprExportPackager,
    GDPR_EXPORT_STORAGE,
    GdprExportPipelineService,

    // Phase 5: Export Delivery
    GdprS3StorageAdapter,
    GdprExportDeliveryService,

    // Phase 6: Export Cleanup
    GdprExportCleanupService,
    GdprAdminService,

    // Phase 7: Notification Hooks
    GdprNotificationHooks,

    // Phase 8: Deletion Confirmation Email
    GdprDeletionEmailService,

    // Phase 9: Deletion Legal Hold Infrastructure
    DeletionLegalHoldService,

    // Phase 10: Internal Operational Logs
    InternalLogService,

    // Phase 11: Integrity Monitoring
    GdprIntegrityMonitor,

    // Phase 12: Compliance Reporting
    GdprComplianceReportJob,
  ],
})
export class GdprModule {}
