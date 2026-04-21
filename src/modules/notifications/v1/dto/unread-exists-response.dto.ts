/**
 * DTO for unread-exists response.
 *
 * Minimal response for badge/dot UI indicators.
 * Uses boolean for fast O(1) unread detection.
 */
export class UnreadExistsResponseDto {
  /** Whether user has any unread notifications */
  hasUnread!: boolean;

  static create(hasUnread: boolean): UnreadExistsResponseDto {
    const dto = new UnreadExistsResponseDto();
    dto.hasUnread = hasUnread;
    return dto;
  }
}
