import { IsString, IsOptional, IsObject, IsNotEmpty, IsNumberString } from 'class-validator';

/**
 * DTO for table query parameters.
 */
export class AdminQueryDto {
  @IsString()
  @IsNotEmpty()
  table!: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsNumberString()
  offset?: string;

  @IsOptional()
  @IsString()
  filterField?: string;

  @IsOptional()
  @IsString()
  filterValue?: string;

  /**
   * Get limit as number (with validation).
   */
  getLimit(): number {
    const limit = this.limit ? parseInt(this.limit, 10) : 50;
    return Math.min(Math.max(1, limit), 100);
  }

  /**
   * Get offset as number (with validation).
   */
  getOffset(): number {
    const offset = this.offset ? parseInt(this.offset, 10) : 0;
    return Math.max(0, offset);
  }
}

/**
 * DTO for getting a single record.
 */
export class AdminGetRecordDto {
  @IsString()
  @IsNotEmpty()
  table!: string;

  @IsString()
  @IsNotEmpty()
  id!: string;
}

/**
 * DTO for updating a record.
 */
export class AdminUpdateDto {
  @IsString()
  @IsNotEmpty()
  table!: string;

  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsObject()
  @IsNotEmpty()
  data!: Record<string, unknown>;
}
