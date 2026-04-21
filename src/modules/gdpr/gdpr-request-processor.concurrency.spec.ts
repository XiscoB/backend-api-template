import { GdprAuditAction, Request, RequestStatus, RequestType } from '@prisma/client';
import { GdprRequestProcessorService, ProcessingSummary } from './gdpr-request-processor.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GdprRepository } from './gdpr.repository';
import { GdprDataOrchestratorService } from './gdpr-data-orchestrator.service';
import { GdprDocumentBuilderService } from './gdpr-document-builder.service';
import { ExportPipelineResult, GdprExportPipelineService } from './gdpr-export-pipeline.service';
import { GdprCollectedData } from './gdpr-collection.types';
import { GdprExportDocument } from './gdpr-export-document.types';
import {
  GlobalNotificationService,
  NotificationEvent,
  NotifyUserRequest,
  NotifyUserResult,
} from '../notifications/global-notification.service';

type RepositoryDeps = Pick<
  GdprRepository,
  'claimPendingRequestsForProcessing' | 'createAuditLog' | 'markRequestFailed'
>;

type DataOrchestratorDeps = Pick<GdprDataOrchestratorService, 'collectUserData'>;
type DocumentBuilderDeps = Pick<GdprDocumentBuilderService, 'buildDocument'>;
type PipelineDeps = Pick<GdprExportPipelineService, 'execute'>;
type NotificationDeps = Pick<GlobalNotificationService, 'notifyUser'>;

const buildCollectedData = (): GdprCollectedData => ({
  metadata: {
    identityId: 'identity-1',
    collectedAt: new Date('2026-01-01T00:00:00.000Z'),
    sourcesCollected: 4,
    sources: ['identity', 'profile', 'notifications', 'notificationPreferences'],
    schemaVersion: '1.0.0',
  },
  identity: {
    id: 'identity-1',
    externalUserId: 'external-1',
    isFlagged: false,
    isSuspended: false,
    lastActivity: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  profile: {
    id: 'profile-1',
    displayName: 'Test User',
    language: 'en',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  notifications: {
    totalCount: 0,
    notifications: [],
  },
  notificationPreferences: null,
});

const buildExportDocument = (): GdprExportDocument => ({
  metadata: {
    generatedAt: new Date('2026-01-01T00:00:00.000Z'),
    identityId: 'identity-1',
    schemaVersion: '1.0.0',
    language: 'en',
  },
  sections: [],
});

const buildRequest = (overrides: Partial<Request> = {}): Request => ({
  id: 'req-1',
  identityId: 'identity-1',
  requestType: RequestType.GDPR_EXPORT,
  status: RequestStatus.PENDING,
  dataPayload: null,
  errorMessage: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  requestedAt: new Date('2026-01-01T00:00:00.000Z'),
  processedAt: null,
  expiresAt: null,
  downloadCount: 0,
  lastDownloadedAt: null,
  ...overrides,
});

type TestContext = {
  serviceA: GdprRequestProcessorService;
  serviceB: GdprRequestProcessorService;
  pipelineExecuteMock: jest.MockedFunction<PipelineDeps['execute']>;
  markRequestFailedMock: jest.MockedFunction<RepositoryDeps['markRequestFailed']>;
  notifyUserMock: jest.MockedFunction<NotificationDeps['notifyUser']>;
};

const createContext = (
  claimBatches: Request[][],
  pipelineBehavior: Array<'success' | 'failure'>,
): TestContext => {
  const prisma = {
    gdprExportFile: {
      create: jest.fn().mockResolvedValue({ id: 'file-1' }),
    },
  } as never as PrismaService;

  const claimPendingRequestsForProcessingMock: jest.MockedFunction<
    RepositoryDeps['claimPendingRequestsForProcessing']
  > = jest.fn((_requestType: RequestType, _limit: number, _staleProcessingMs?: number) =>
    Promise.resolve(claimBatches.shift() ?? []),
  );

  const createAuditLogMock: jest.MockedFunction<RepositoryDeps['createAuditLog']> = jest.fn(
    (_data) =>
      Promise.resolve({
        id: 'audit-1',
        identityId: 'identity-1',
        action: GdprAuditAction.EXPORT_STARTED,
        entityType: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        performedAt: new Date(),
        performedBy: 'SYSTEM',
      }),
  );

  const markRequestFailedMock: jest.MockedFunction<RepositoryDeps['markRequestFailed']> = jest.fn(
    (_id: string, _errorMessage: string) =>
      Promise.resolve(buildRequest({ status: RequestStatus.FAILED })),
  );

  const repo: RepositoryDeps = {
    claimPendingRequestsForProcessing: claimPendingRequestsForProcessingMock,
    createAuditLog: createAuditLogMock,
    markRequestFailed: markRequestFailedMock,
  };

  const dataOrchestrator: DataOrchestratorDeps = {
    collectUserData: jest.fn((_identityId: string) =>
      Promise.resolve({
        data: buildCollectedData(),
        summary: {
          identityId: 'identity-1',
          totalSources: 4,
          successfulSources: 4,
          failedSources: 0,
          sourceResults: [],
          totalDurationMs: 5,
          overallSuccess: true,
        },
      }),
    ),
  };

  const documentBuilder: DocumentBuilderDeps = {
    buildDocument: jest.fn(
      (_collectedData, _language, _options): GdprExportDocument => buildExportDocument(),
    ),
  };

  const pipelineExecuteMock: jest.MockedFunction<PipelineDeps['execute']> = jest.fn(
    (_document, _options) => {
      const behavior = pipelineBehavior.shift() ?? 'success';
      if (behavior === 'failure') {
        return Promise.reject(new Error('simulated pipeline failure'));
      }

      const result: ExportPipelineResult = {
        success: true,
        storageKey: 'storage/export-1.zip',
        filename: 'export-1.zip',
        fileSize: 128,
        storageProvider: 'LOCAL',
        expiresAt: new Date('2026-01-08T00:00:00.000Z'),
        durationMs: 5,
      };

      return Promise.resolve(result);
    },
  );

  const pipeline: PipelineDeps = {
    execute: pipelineExecuteMock,
  };

  const notifyUserMock: jest.MockedFunction<NotificationDeps['notifyUser']> = jest.fn(
    (_request: NotifyUserRequest): Promise<NotifyUserResult> =>
      Promise.resolve({
        success: true,
        scheduled: false,
        auditLogIds: [],
      }),
  );

  const notifications: NotificationDeps = {
    notifyUser: notifyUserMock,
  };

  const serviceA = new GdprRequestProcessorService(
    prisma,
    repo as GdprRepository,
    dataOrchestrator as GdprDataOrchestratorService,
    documentBuilder as GdprDocumentBuilderService,
    pipeline as GdprExportPipelineService,
    notifications as GlobalNotificationService,
  );

  const serviceB = new GdprRequestProcessorService(
    prisma,
    repo as GdprRepository,
    dataOrchestrator as GdprDataOrchestratorService,
    documentBuilder as GdprDocumentBuilderService,
    pipeline as GdprExportPipelineService,
    notifications as GlobalNotificationService,
  );

  return {
    serviceA,
    serviceB,
    pipelineExecuteMock,
    markRequestFailedMock,
    notifyUserMock,
  };
};

describe('GdprRequestProcessorService concurrency contract', () => {
  it('allows only one concurrent instance to process a claimed request', async () => {
    const request = buildRequest();
    const context = createContext([[request], []], ['success']);

    const [resultA, resultB] = await Promise.all([
      context.serviceA.processPendingExports(1),
      context.serviceB.processPendingExports(1),
    ]);

    const processedTotal = resultA.processed + resultB.processed;
    expect(processedTotal).toBe(1);
    expect(context.pipelineExecuteMock).toHaveBeenCalledTimes(1);
    expect(context.notifyUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: NotificationEvent.GDPR_EXPORT_READY,
      }),
    );
  });

  it('retries safely after crash and still emits one completion side effect', async () => {
    const request = buildRequest();
    const context = createContext([[request], [request]], ['failure', 'success']);

    const firstRun: ProcessingSummary = await context.serviceA.processPendingExports(1);
    const secondRun: ProcessingSummary = await context.serviceB.processPendingExports(1);

    expect(firstRun.failed).toBe(1);
    expect(secondRun.processed).toBe(1);
    expect(context.markRequestFailedMock).toHaveBeenCalledTimes(1);
    expect(context.notifyUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: NotificationEvent.GDPR_EXPORT_READY,
      }),
    );
    // Under guarded, persistence-boundary idempotency,
    // crash + retry emits exactly one failure notification
    // and one success notification — no duplicate side effects.
    expect(context.notifyUserMock).toHaveBeenCalledTimes(2);
  });
});
