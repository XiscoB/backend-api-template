import { IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';

/**
 * DTO for partial profile updates.
 *
 * All fields are optional - allows updating one or more fields at a time.
 * Missing fields are not updated (existing data is preserved).
 *
 * Examples:
 * - Language only: { "language": "es" }
 * - Display name only: { "displayName": "Xisco" }
 * - Multiple fields: { "displayName": "Xisco", "language": "es" }
 *
 * This DTO supports tab-based incremental profile editing where different
 * sections of the app update different parts of the profile independently.
 */
export class UpdateProfileDto {
  /**
   * Display name for the profile.
   * Must be between 2 and 100 characters when provided.
   * Optional - if not provided, existing value is preserved.
   */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName?: string;

  /**
   * User's preferred language (ISO 639-1 code).
   * Optional - if not provided, existing value is preserved.
   * Examples: "en", "es", "fr", "de"
   */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}$/, {
    message: 'language must be a valid ISO 639-1 code (e.g., "en", "es")',
  })
  language?: string;
}
