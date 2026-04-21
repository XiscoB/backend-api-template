import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RestoreResult } from './gdpr-anonymization-strategy.types';

type PrismaRestorableModel = {
  upsert: (args: {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }) => Promise<unknown>;
};

type RestorationPrisma = Record<string, unknown>;

@Injectable()
export class GdprRestorationStrategy {
  private readonly logger = new Logger(GdprRestorationStrategy.name);

  constructor(@Inject(PrismaService) private readonly prisma: RestorationPrisma) {}

  async restoreRows(modelName: string, rows: Record<string, unknown>[]): Promise<RestoreResult> {
    const prismaModel = this.getRestorableModel(modelName);
    if (!prismaModel) {
      return { kind: 'MODEL_NOT_FOUND' };
    }

    let rowsRestored = 0;

    for (const row of rows) {
      try {
        const id = row['id'];
        if (!id) {
          this.logger.warn(`Row in ${modelName} has no id field, skipping`);
          continue;
        }

        const dataWithoutId: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          if (key !== 'id') {
            dataWithoutId[key] = value;
          }
        }

        await prismaModel.upsert({
          where: { id },
          create: row,
          update: dataWithoutId,
        });

        rowsRestored++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to restore row in ${modelName}: ${errorMessage}`);
      }
    }

    return { kind: 'RESTORED', count: rowsRestored };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private getRestorableModel(modelName: string): PrismaRestorableModel | undefined {
    const prismaModelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1);
    const candidate: unknown = Reflect.get(this.prisma, prismaModelKey);

    if (!this.isRecord(candidate)) {
      return undefined;
    }

    const upsert = candidate['upsert'];
    if (typeof upsert !== 'function') {
      return undefined;
    }

    return {
      upsert: upsert as (args: {
        where: Record<string, unknown>;
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => Promise<unknown>,
    };
  }
}
