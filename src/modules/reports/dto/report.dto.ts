import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsObject } from 'class-validator';

export class CreateReportDto {
  @IsString()
  @IsOptional()
  reportedIdentityId?: string;

  @IsString()
  @IsOptional()
  reportedContentId?: string;

  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsString()
  @IsOptional()
  details?: string;

  @IsObject()
  @IsOptional()
  reportedContentSnapshot?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  reportedUserSnapshot?: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  source!: string;
}

export class ResolutionDto {
  @IsBoolean()
  valid!: boolean;
}
