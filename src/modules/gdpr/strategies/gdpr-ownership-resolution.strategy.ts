import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { GdprTableConfig } from '../gdpr.registry';

type OwnershipPrisma = {
  userNotificationProfile: {
    findUnique: (args: {
      where: { identityId: string };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
};

@Injectable()
export class GdprOwnershipResolutionStrategy {
  private readonly logger = new Logger(GdprOwnershipResolutionStrategy.name);

  constructor(@Inject(PrismaService) private readonly prisma: OwnershipPrisma) {}

  async resolveAllOwnershipKeys(
    tables: GdprTableConfig[],
    identityId: string,
  ): Promise<Map<string, string>> {
    const keyMap = new Map<string, string>();
    const userFields = new Set(tables.map((table) => table.userField));

    for (const userField of userFields) {
      const key = await this.resolveOwnershipKey(userField, identityId);
      if (key) {
        keyMap.set(userField, key);
      }
    }

    return keyMap;
  }

  async resolveOwnershipKey(userField: string, identityId: string): Promise<string | null> {
    if (userField === 'identityId') {
      return identityId;
    }

    if (userField === 'notificationProfileId') {
      const profile = await this.prisma.userNotificationProfile.findUnique({
        where: { identityId },
        select: { id: true },
      });
      return profile?.id ?? null;
    }

    this.logger.warn(`[GDPR] Unknown userField pattern: ${userField}. Attempting direct lookup.`);
    return identityId;
  }
}
