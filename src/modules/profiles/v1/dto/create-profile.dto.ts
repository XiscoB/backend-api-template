import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';

/**
 * DTO for creating a profile.
 */
export class CreateProfileDto {
  /**
   * Display name for the profile.
   * Must be between 2 and 100 characters.
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;

  /**
   * User's preferred language (ISO 639-1 code).
   * Optional - defaults to "en" if not provided.
   * Examples: "en", "es", "fr", "de"
   */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}$/, {
    message: 'language must be a valid ISO 639-1 code (e.g., "en", "es")',
  })
  language?: string;
}
