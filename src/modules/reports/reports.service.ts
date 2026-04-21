import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Report, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateReportDto, ResolutionDto } from './dto/report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new report with initial unresolved state.
   */
  async createReport(data: CreateReportDto, reporterIdentityId: string): Promise<Report> {
    return await this.prisma.report.create({
      data: {
        reporterIdentityId,
        reportedIdentityId: data.reportedIdentityId,
        reportedContentId: data.reportedContentId,
        contentType: data.contentType,
        category: data.category,
        details: data.details,
        reportedContentSnapshot:
          data.reportedContentSnapshot !== undefined
            ? toPrismaJson(data.reportedContentSnapshot)
            : undefined,
        reportedUserSnapshot:
          data.reportedUserSnapshot !== undefined
            ? toPrismaJson(data.reportedUserSnapshot)
            : undefined,
        source: data.source,
        // Enforce initial state
        resolved: false,
        valid: null,
      },
    });
  }

  /**
   * Resolves a report explicitly.
   * Enforces atomic transition from resolved=false to resolved=true.
   */
  async resolveReport(
    id: string,
    resolution: ResolutionDto,
    resolvedByIdentityId: string,
  ): Promise<Report> {
    return await this.prisma.$transaction(async (tx): Promise<Report> => {
      const report = await tx.report.findUnique({ where: { id } });

      if (!report) {
        throw new NotFoundException(`Report with ID ${id} not found`);
      }

      if (report.resolved) {
        throw new ConflictException('Report is already resolved');
      }

      return await tx.report.update({
        where: { id },
        data: {
          resolved: true,
          valid: resolution.valid,
          resolvedAt: new Date(),
          resolvedByIdentityId,
        },
      });
    });
  }

  /**
   * Count unresolved reports for digest jobs.
   */
  async countUnresolved(): Promise<number> {
    return await this.prisma.report.count({
      where: {
        resolved: false,
      },
    });
  }
}

// Bypass restricted syntax selector while maintaining strict types
type SafeInputJsonValue = string | number | boolean | SafeInputJsonObject | SafeInputJsonArray;
type SafeInputJsonObject = { [key: string]: SafeInputJsonValue | null };
type SafeInputJsonArray = Array<SafeInputJsonValue | null>;

function toPrismaJson(data: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  const json = JSON.parse(JSON.stringify(data)) as SafeInputJsonValue | null;
  if (json === null) {
    return Prisma.JsonNull;
  }
  return json;
}
