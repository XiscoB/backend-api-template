// GDPR Module Exports
export { GdprModule } from './gdpr.module';
export { GdprRequestProcessorService, ProcessingSummary } from './gdpr-request-processor.service';
export { GdprDataCollectorService } from './gdpr-data-collector.service';
export { GdprDataOrchestratorService } from './gdpr-data-orchestrator.service';
export { GdprLocalizationService } from './gdpr-localization.service';
export { GdprDocumentBuilderService } from './gdpr-document-builder.service';
export { GdprExportService, GdprExportResult } from './gdpr-export.service';
export { GdprDeletionService, GdprDeletionResult } from './gdpr-deletion.service';
export { GdprSuspensionService } from './gdpr-suspension.service';
export { GdprSuspensionEscalationService } from './gdpr-suspension-escalation.service';
export { GdprEnforcementService } from './gdpr-enforcement.service';
export { GdprCronService } from './gdpr-cron.service';
export { GdprRepository } from './gdpr.repository';
export { RequestMonitoringService } from './request-monitoring.service';

// Collection types
export type {
  GdprCollectedData,
  GdprCollectionMetadata,
  GdprIdentityData,
  GdprProfileData,
  GdprNotificationData,
  GdprNotificationRecord,
  GdprNotificationPreferencesData,
  GdprDataCollector,
  GdprCollectionSourceResult,
  GdprCollectionSummary,
} from './gdpr-collection.types';

// Export document model types (Phase 3.5)
export type {
  GdprExportDocument,
  GdprDocumentMetadata,
  GdprDocumentSection,
  GdprDocumentEntry,
  GdprDocumentField,
  GdprExportRenderer,
  RenderedExport,
  LanguageCode,
  LocalizationKey,
  LocalizedTextDictionary,
  MultiLanguageTextDictionary,
  SectionBuilder,
  DocumentBuilderOptions,
} from './gdpr-export-document.types';

// Phase 4: Export Rendering, Packaging & Storage
export { GdprHtmlRenderer } from './gdpr-html-renderer.service';
export { GdprExportPackager, PackageOptions, PackagedExport } from './gdpr-export-packager.service';
export {
  GdprExportStorage,
  GdprExportStorageMetadata,
  GdprExportStorageResult,
  GdprExportRetrievedFile,
  GDPR_EXPORT_STORAGE,
} from './gdpr-export-storage.interface';
export { GdprLocalStorageAdapter } from './gdpr-local-storage.adapter';
export {
  GdprExportPipelineService,
  ExportMetadata,
  ExportPipelineResult,
  ExportPipelineOptions,
} from './gdpr-export-pipeline.service';

// Registry exports for extension
export {
  GDPR_REGISTRY,
  GDPR_EXCLUDED_TABLES,
  GdprTableConfig,
  GdprDeleteConfig,
  GdprSuspendConfig,
  GdprDeleteStrategy,
  GdprSuspendStrategy,
  GdprReplacementStrategy,
  getExportableTables,
  getDeletableTables,
  getSuspendableTables,
  getEffectiveSuspendFields,
  getEffectiveSuspendReplacement,
  isModelRegistered,
  isModelExcluded,
  getModelConfig,
} from './gdpr.registry';

// Types
export * from './gdpr.types';

// Re-export monitoring types for convenience
export {
  RequestMonitoringHook,
  REQUEST_MONITORING_HOOKS,
  RequestMonitoringConfig,
  DEFAULT_MONITORING_CONFIG,
  ProblematicRequestInfo,
  MonitoringDetectionResult,
} from '../../common/types/request-monitoring.types';
