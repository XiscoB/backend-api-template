import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { GdprTableConfig } from '../gdpr.registry';
import { TableRowsSnapshotResult } from './gdpr-anonymization-strategy.types';

type PrismaReadableModel = {
  findMany: (args: { where: Record<string, string> }) => Promise<Record<string, unknown>[]>;
};

type BackupPrisma = {
  suspensionBackup: {
    create: (args: {
      data: {
        suspensionUid: string;
        identityId: string;
        anonymizedUid: string;
        tableName: string;
        backupData: Prisma.InputJsonValue;
        backupSchemaVersion: string;
        backupUsed: boolean;
      };
    }) => Promise<unknown>;
  };
} & Record<string, unknown>;

@Injectable()
export class GdprBackupStrategy {
  constructor(@Inject(PrismaService) private readonly prisma: BackupPrisma) {}

  async loadRows(config: GdprTableConfig, ownershipKey: string): Promise<TableRowsSnapshotResult> {
    const prismaModel = this.getReadableModel(config.modelName);

    if (!prismaModel) {
      return { kind: 'MODEL_NOT_FOUND' };
    }

    const rows = await prismaModel.findMany({
      where: { [config.userField]: ownershipKey },
    });

    return { kind: 'READY', rows };
  }

  async createBackup(params: {
    suspensionUid: string;
    identityId: string;
    anonymizedUid: string;
    modelName: string;
    rows: Record<string, unknown>[];
  }): Promise<void> {
    await this.prisma.suspensionBackup.create({
      data: {
        suspensionUid: params.suspensionUid,
        identityId: params.identityId,
        anonymizedUid: params.anonymizedUid,
        tableName: params.modelName,
        backupData: this.toInputJsonValue(params.rows),
        backupSchemaVersion: '1.0',
        backupUsed: false,
      },
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private getReadableModel(modelName: string): PrismaReadableModel | undefined {
    const prismaModelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1);
    const candidate: unknown = Reflect.get(this.prisma, prismaModelKey);

    if (!this.isRecord(candidate)) {
      return undefined;
    }

    const findMany = candidate['findMany'];
    if (typeof findMany !== 'function') {
      return undefined;
    }

    return {
      findMany: findMany as (args: {
        where: Record<string, string>;
      }) => Promise<Record<string, unknown>[]>,
    };
  }

  private toInputJsonValue(data: unknown): Prisma.InputJsonValue {
    const serialized = JSON.stringify(data);
    const parsed: unknown = JSON.parse(serialized);
    return parsed as Prisma.InputJsonValue;
  }
}
