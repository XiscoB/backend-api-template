import { Injectable } from '@nestjs/common';
import { Profile } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Profiles repository.
 *
 * Abstracts database access for the Profile entity.
 * All Prisma operations are encapsulated here.
 *
 * IMPORTANT: This repository operates on identityId, NOT externalUserId.
 * Identity resolution happens at the service layer.
 */
@Injectable()
export class ProfilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a profile by identity ID.
   */
  async findByIdentityId(identityId: string): Promise<Profile | null> {
    return await this.prisma.profile.findUnique({
      where: { identityId },
    });
  }

  /**
   * Find a profile by its internal ID.
   */
  async findById(id: string): Promise<Profile | null> {
    return await this.prisma.profile.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new profile.
   */
  async create(data: {
    identityId: string;
    displayName: string;
    language?: string;
  }): Promise<Profile> {
    return await this.prisma.profile.create({
      data: {
        identityId: data.identityId,
        displayName: data.displayName,
        language: data.language ?? 'en', // Default to 'en' if not provided
      },
    });
  }

  /**
   * Update an existing profile.
   */
  async update(id: string, data: { displayName?: string }): Promise<Profile> {
    return await this.prisma.profile.update({
      where: { id },
      data,
    });
  }

  /**
   * Upsert a profile (create if not exists, return existing if exists).
   * This enables idempotent profile creation.
   */
  async upsert(data: {
    identityId: string;
    displayName: string;
    language?: string;
  }): Promise<Profile> {
    return await this.prisma.profile.upsert({
      where: { identityId: data.identityId },
      create: {
        identityId: data.identityId,
        displayName: data.displayName,
        language: data.language ?? 'en', // Default to 'en' if not provided
      },
      update: {}, // No update on conflict - preserves existing data
    });
  }

  /**
   * Partial update of an existing profile.
   *
   * Only provided fields are updated. Missing/undefined fields preserve existing data.
   * This enables incremental profile editing where different parts of the app
   * update different profile fields independently.
   *
   * @param id - Profile ID
   * @param data - Partial update data (all fields optional)
   */
  async updatePartial(
    id: string,
    data: { displayName?: string; language?: string },
  ): Promise<Profile> {
    // Build update object with only provided fields
    const updateData: { displayName?: string; language?: string } = {};

    if (data.displayName !== undefined) {
      updateData.displayName = data.displayName;
    }

    if (data.language !== undefined) {
      updateData.language = data.language;
    }

    return await this.prisma.profile.update({
      where: { id },
      data: updateData,
    });
  }
}
