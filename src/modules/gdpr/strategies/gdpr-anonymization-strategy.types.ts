import { GdprTableConfig } from '../gdpr.registry';

export type AnonymizationMode = 'SUSPEND' | 'DELETE';

export type SuspensionAction = 'DELETED' | 'ANONYMIZED' | 'SKIPPED';

export interface TableAnonymizationSummary {
  table: string;
  rows: number;
  backedUp: boolean;
  mode: AnonymizationMode;
  action?: SuspensionAction;
}

export interface AnonymizationResult {
  identityId: string;
  anonymizedUid: string;
  mode: AnonymizationMode;
  suspensionUid?: string;
  summary: TableAnonymizationSummary[];
  totalRowsAffected: number;
}

export interface AnonymizationOptions {
  identityId: string;
  anonymizedUid: string;
  mode: AnonymizationMode;
  suspensionUid?: string;
  tables?: GdprTableConfig[];
}

export interface TableRestoreSummary {
  table: string;
  rows: number;
  restored: boolean;
}

export type TableRowsSnapshotResult =
  | {
      kind: 'MODEL_NOT_FOUND';
    }
  | {
      kind: 'READY';
      rows: Record<string, unknown>[];
    };

export type StrategyMutationResult =
  | {
      kind: 'MODEL_NOT_FOUND';
    }
  | {
      kind: 'APPLIED';
      count: number;
    }
  | {
      kind: 'SKIPPED';
      reason: 'NO_PII_FIELDS';
    };

export type RestoreResult =
  | {
      kind: 'MODEL_NOT_FOUND';
    }
  | {
      kind: 'RESTORED';
      count: number;
    };
