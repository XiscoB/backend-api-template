import { GdprRecoveryResult, TableRecoverySummary } from '../../gdpr.types';

/**
 * DTO for GDPR recovery response.
 *
 * Returns summary of the recovery operation.
 */
export class GdprRecoveryResponseDto {
  /** User ID (identity ID) */
  userId!: string;

  /** Unique suspension identifier */
  suspensionUid!: string;

  /** When the account was recovered */
  recoveredAt!: Date;

  /** Lifecycle state after recovery */
  lifecycleState!: string;

  /** Summary of tables restored */
  summary!: TableRecoverySummary[];

  /** Total number of rows restored */
  totalRowsRestored!: number;

  /**
   * Create a DTO from a recovery result.
   */
  static fromResult(result: GdprRecoveryResult): GdprRecoveryResponseDto {
    const dto = new GdprRecoveryResponseDto();
    dto.userId = result.identityId;
    dto.suspensionUid = result.suspensionUid;
    dto.recoveredAt = result.recoveredAt;
    dto.lifecycleState = 'RECOVERED';
    dto.summary = result.summary;
    dto.totalRowsRestored = result.totalRowsRestored;
    return dto;
  }
}
