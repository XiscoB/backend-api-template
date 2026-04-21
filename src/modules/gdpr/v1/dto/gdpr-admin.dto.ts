import { IsOptional, IsEnum, IsUUID } from 'class-validator';

/**
 * Query parameters for listing GDPR requests.
 *
 * Note: Query params come as strings. We use getter methods to
 * coerce to numbers with defaults. This avoids class-transformer
 * type issues while keeping validation simple.
 */
export class GdprAdminListRequestsDto {
  @IsOptional()
  @IsEnum(['GDPR_EXPORT', 'GDPR_DELETE', 'GDPR_SUSPEND', 'GDPR_RESUME'])
  requestType?: 'GDPR_EXPORT' | 'GDPR_DELETE' | 'GDPR_SUSPEND' | 'GDPR_RESUME';

  @IsOptional()
  @IsEnum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED'])
  status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

  @IsOptional()
  limit?: string | number;

  @IsOptional()
  offset?: string | number;

  getLimit(): number {
    const val = this.limit;
    if (typeof val === 'number') return Math.min(Math.max(val, 1), 100);
    if (typeof val === 'string') {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed)) return Math.min(Math.max(parsed, 1), 100);
    }
    return 20;
  }

  getOffset(): number {
    const val = this.offset;
    if (typeof val === 'number') return Math.max(val, 0);
    if (typeof val === 'string') {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed)) return Math.max(parsed, 0);
    }
    return 0;
  }
}

/**
 * Path parameter for getting a single GDPR request.
 */
export class GdprAdminGetRequestDto {
  @IsUUID()
  id!: string;
}
