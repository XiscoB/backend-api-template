import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../../common/guards/rate-limit.guard';
import { AuthenticatedUser } from '../../../common/auth/auth.types';
import { ProfilesService } from '../profiles.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';

/**
 * Profiles controller (v1).
 *
 * Handles HTTP concerns for profile operations.
 * All routes require authentication (global JWT guard).
 *
 * This controller demonstrates the standard pattern:
 * - Controller handles HTTP only (status codes, response mapping)
 * - Service handles business logic
 * - DTOs define input/output contracts
 *
 * Access: USER, ENTITY roles required
 *
 * Rate limit example: PATCH /me demonstrates rate limiting
 * on an authenticated endpoint using rl-auth-semi-strict tier.
 */
@Controller('v1/profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  /**
   * Get the current user's profile.
   *
   * @example GET /api/v1/profiles/me
   *
   * @returns The profile for the authenticated user
   * @throws 404 if profile does not exist
   */
  @Get('me')
  async getMyProfile(@CurrentUser() user: AuthenticatedUser): Promise<ProfileResponseDto> {
    const profile = await this.profilesService.getMyProfile(user.id);
    return ProfileResponseDto.fromEntity(profile);
  }

  /**
   * Create a profile for the current user.
   *
   * This operation is idempotent:
   * - If profile exists, returns the existing profile (no update)
   * - If profile does not exist, creates and returns a new one
   *
   * @example POST /api/v1/profiles/me
   *
   * @returns The created or existing profile
   */
  @Post('me')
  @HttpCode(HttpStatus.OK) // 200 for idempotent creation
  async createMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProfileDto,
  ): Promise<ProfileResponseDto> {
    const profile = await this.profilesService.createMyProfile(user.id, dto);
    return ProfileResponseDto.fromEntity(profile);
  }

  /**
   * Update the current user's profile (partial update).
   *
   * Supports updating one or more fields at a time.
   * Only provided fields are updated - missing fields preserve existing data.
   *
   * This enables tab-based incremental profile editing:
   * - Language tab → updates only language
   * - Display name tab → updates only displayName
   * - Profile tab → updates several fields at once
   *
   * Rate limited: rl-auth-semi-strict (120 req / 60s per user)
   * This is an EXAMPLE of rate limiting on an authenticated endpoint.
   *
   * @example PATCH /api/v1/profiles/me
   * Body: { "language": "es" }
   *
   * @example PATCH /api/v1/profiles/me
   * Body: { "displayName": "Xisco", "language": "es" }
   *
   * @returns The updated profile
   * @throws 404 if profile does not exist
   */
  @Patch('me')
  @UseGuards(RateLimitGuard)
  @RateLimit('rl-auth-semi-strict')
  async updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    const profile = await this.profilesService.updateMyProfile(user.id, dto);
    return ProfileResponseDto.fromEntity(profile);
  }
}
