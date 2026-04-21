/**
 * Email Format Utilities
 *
 * Shared formatting utilities for alert and report emails.
 * Keeps formatting dumb and consistent.
 *
 * Rules:
 * - No emojis
 * - No marketing language
 * - No product-specific content
 * - No localization
 * - Plain, scannable HTML
 */
export class EmailFormatUtils {
  /**
   * Format an alert subject line.
   *
   * @example
   * alertSubject('CRITICAL', 'Job Not Running: every-minute')
   * // Returns: '[ALERT][CRITICAL] Job Not Running: every-minute'
   */
  static alertSubject(severity: string, title: string): string {
    return `[ALERT][${severity}] ${title}`;
  }

  /**
   * Format a report subject line.
   *
   * @example
   * reportSubject('Weekly Growth Report', new Date('2026-01-27'))
   * // Returns: '[WEEKLY REPORT] Weekly Growth Report - 1/27/2026'
   */
  static reportSubject(reportType: string, periodStart: Date): string {
    const dateStr = periodStart.toLocaleDateString('en-US');
    return `[WEEKLY REPORT] ${reportType} - ${dateStr}`;
  }

  /**
   * Generate a standard footer for reports and alerts.
   *
   * @example
   * standardFooter(new Date())
   * // Returns: '<hr /><small>Generated at: 2026-01-27T09:00:00.000Z</small>'
   */
  static standardFooter(generatedAt: Date): string {
    return `<hr /><small>Generated at: ${generatedAt.toISOString()}</small>`;
  }

  /**
   * Wrap raw HTML in a consistent container.
   * Adds footer and ensures proper structure.
   */
  static wrapContent(htmlBody: string, generatedAt: Date): string {
    return `${htmlBody}${this.standardFooter(generatedAt)}`;
  }
}
