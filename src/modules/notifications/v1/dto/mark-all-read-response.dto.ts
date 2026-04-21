/**
 * DTO for mark-all-as-read response.
 *
 * Returns count of notifications marked as read.
 */
export class MarkAllReadResponseDto {
  /** Number of notifications marked as read */
  count!: number;

  static create(count: number): MarkAllReadResponseDto {
    const dto = new MarkAllReadResponseDto();
    dto.count = count;
    return dto;
  }
}
