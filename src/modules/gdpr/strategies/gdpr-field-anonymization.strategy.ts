import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  GdprReplacementStrategy,
  GdprTableConfig,
  getEffectiveSuspendPiiFields,
  getEffectiveSuspendReplacement,
} from '../gdpr.registry';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AnonymizationMode, StrategyMutationResult } from './gdpr-anonymization-strategy.types';

type PrismaUpdatableModel = {
  updateMany: (args: {
    where: Record<string, string>;
    data: Record<string, unknown>;
  }) => Promise<{ count: number }>;
};

type FieldAnonymizationPrisma = Record<string, unknown>;

@Injectable()
export class GdprFieldAnonymizationStrategy {
  constructor(@Inject(PrismaService) private readonly prisma: FieldAnonymizationPrisma) {}

  async anonymizeRows(
    config: GdprTableConfig,
    ownershipKey: string,
    mode: AnonymizationMode,
  ): Promise<StrategyMutationResult> {
    const piiFields = getEffectiveSuspendPiiFields(config);
    if (piiFields.length === 0) {
      return { kind: 'SKIPPED', reason: 'NO_PII_FIELDS' };
    }

    const prismaModel = this.getUpdatableModel(config.modelName);
    if (!prismaModel) {
      return { kind: 'MODEL_NOT_FOUND' };
    }

    const replacement = getEffectiveSuspendReplacement(config);
    const data: Record<string, unknown> = {};

    for (const field of piiFields) {
      data[field] = this.getReplacementValue(replacement, mode);
    }

    const result = await prismaModel.updateMany({
      where: { [config.userField]: ownershipKey },
      data,
    });

    return { kind: 'APPLIED', count: result.count };
  }

  private getReplacementValue(
    replacement: GdprReplacementStrategy | undefined,
    mode: AnonymizationMode,
  ): unknown {
    const placeholder = mode === 'SUSPEND' ? '[SUSPENDED]' : '[DELETED]';

    switch (replacement) {
      case 'NULL':
        return null;
      case 'RANDOM':
        return `${mode.toLowerCase()}_${randomUUID().substring(0, 8)}`;
      case 'FIXED':
      default:
        return placeholder;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private getUpdatableModel(modelName: string): PrismaUpdatableModel | undefined {
    const prismaModelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1);
    const candidate: unknown = Reflect.get(this.prisma, prismaModelKey);

    if (!this.isRecord(candidate)) {
      return undefined;
    }

    const updateMany = candidate['updateMany'];
    if (typeof updateMany !== 'function') {
      return undefined;
    }

    return {
      updateMany: updateMany as (args: {
        where: Record<string, string>;
        data: Record<string, unknown>;
      }) => Promise<{ count: number }>,
    };
  }
}
