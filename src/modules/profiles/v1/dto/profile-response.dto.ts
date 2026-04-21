import { Identity } from '@prisma/client';

/**
 * DTO for profile response.
 *
 * This DTO defines what gets returned to the client.
 * Never return Prisma models directly.
 *
 * Note: externalUserId is included for API compatibility at the boundary.
 * Internally, all ownership uses identityId.
 */
export class ProfileResponseDto {
  /** Profile unique identifier */
  id!: string;

  /** External user identifier (from JWT sub claim) - for API compatibility */
  externalUserId!: string;

  /** Display name */
  displayName!: string;

  /** User's preferred language (ISO 639-1 code, e.g., "en", "es") */
  language!: string;

  /** Profile creation timestamp */
  createdAt!: Date;

  /** Last update timestamp */
  updatedAt!: Date;

  /**
   * Create a ProfileResponseDto from a Profile with Identity.
   *
   * Maps identityId to externalUserId for API response.
   */
  static fromEntity(profile: {
    id: string;
    identityId: string;
    displayName: string;
    language: string;
    createdAt: Date;
    updatedAt: Date;
    identity: Identity;
  }): ProfileResponseDto {
    const dto = new ProfileResponseDto();
    dto.id = profile.id;
    // Map externalUserId from Identity for API compatibility
    dto.externalUserId = profile.identity.externalUserId;
    dto.displayName = profile.displayName;
    dto.language = profile.language;
    dto.createdAt = profile.createdAt;
    dto.updatedAt = profile.updatedAt;
    return dto;
  }
}
