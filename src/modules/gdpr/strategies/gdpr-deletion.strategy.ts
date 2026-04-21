import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StrategyMutationResult } from './gdpr-anonymization-strategy.types';

type PrismaDeletableModel = {
  deleteMany: (args: { where: Record<string, string> }) => Promise<{ count: number }>;
};

type DeletionPrisma = Record<string, unknown>;

@Injectable()
export class GdprDeletionStrategy {
  constructor(@Inject(PrismaService) private readonly prisma: DeletionPrisma) {}

  async deleteRows(
    modelName: string,
    userField: string,
    ownershipKey: string,
  ): Promise<StrategyMutationResult> {
    const prismaModel = this.getDeletableModel(modelName);
    if (!prismaModel) {
      return { kind: 'MODEL_NOT_FOUND' };
    }

    const result = await prismaModel.deleteMany({
      where: { [userField]: ownershipKey },
    });

    return { kind: 'APPLIED', count: result.count };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private getDeletableModel(modelName: string): PrismaDeletableModel | undefined {
    const prismaModelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1);
    const candidate: unknown = Reflect.get(this.prisma, prismaModelKey);

    if (!this.isRecord(candidate)) {
      return undefined;
    }

    const deleteMany = candidate['deleteMany'];
    if (typeof deleteMany !== 'function') {
      return undefined;
    }

    return {
      deleteMany: deleteMany as (args: {
        where: Record<string, string>;
      }) => Promise<{ count: number }>,
    };
  }
}
