import { Injectable, Logger } from '@nestjs/common';
import {
  GdprExportDocument,
  GdprExportRenderer,
  GdprDocumentSection,
  GdprDocumentEntry,
  GdprDocumentField,
} from './gdpr-export-document.types';
import { GdprLocalizationService } from './gdpr-localization.service';
import { BRANDING } from './gdpr-document-builder.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * GDPR HTML Export Renderer (Phase 4)
 *
 * Implements `GdprExportRenderer<string>` to convert a semantic
 * `GdprExportDocument` into a self-contained HTML string.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY HTML?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * HTML is the primary export format because:
 * 1. **Universal accessibility**: Every device has a web browser
 * 2. **Self-contained**: No external dependencies when inlined
 * 3. **Human-readable**: Designed for human consumption (GDPR requirement)
 * 4. **Printable**: Users can print for their records
 * 5. **Searchable**: Text content is easily searchable
 * 6. **Future-proof**: HTML is a stable, long-lived format
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Self-contained**: All CSS is inline. No external stylesheets.
 *    This ensures the export works offline and years from now.
 *
 * 2. **Progressive enhancement**: The document is fully readable without
 *    JavaScript. JS only enhances UX (accordions, smooth scrolling).
 *
 * 3. **Accessibility**: Semantic HTML (headings, tables, lists).
 *    Works with screen readers. Proper heading hierarchy.
 *
 * 4. **Deterministic**: Same input always produces same output.
 *    No timestamps in HTML comments. No random IDs.
 *
 * 5. **Pure transformation**: This renderer does NOT:
 *    - Query the database
 *    - Perform localization (that happened in Phase 3.5)
 *    - Know about storage
 *    - Modify the document structure
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * STRUCTURE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The HTML output follows this structure:
 * - <!DOCTYPE html>
 * - <html lang="{language}">
 *   - <head>: Meta, title, inline CSS
 *   - <body>:
 *     - Header: Title + generation metadata
 *     - Table of Contents: Links to each section
 *     - Sections: Each data domain rendered as a section
 *     - Footer: Legal notice + timestamp
 *     - Inline JavaScript (progressive enhancement)
 */
@Injectable()
export class GdprHtmlRenderer implements GdprExportRenderer<string> {
  private readonly logger = new Logger(GdprHtmlRenderer.name);

  constructor(private readonly localization: GdprLocalizationService) {}

  /**
   * Render a GDPR export document to self-contained HTML.
   *
   * @param document - The semantic document from Phase 3.5
   * @returns Complete HTML string ready for packaging
   */
  render(document: GdprExportDocument): string {
    this.logger.log(
      `[HtmlRenderer] Rendering document for identity: ${document.metadata.identityId}`,
    );

    const { metadata, sections } = document;

    // Build HTML parts
    const css = this.buildCss();
    const header = this.buildHeader(metadata);
    const toc = this.buildTableOfContents(sections, metadata.language);
    const sectionsHtml = sections.map((s) => this.buildSection(s)).join('\n');
    const footer = this.buildFooter(metadata);
    const js = this.buildJavaScript();

    // Assemble complete document
    const html = `<!DOCTYPE html>
<html lang="${this.escapeHtml(metadata.language)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <meta name="generator" content="GDPR Export System">
  <title>${this.escapeHtml(this.localization.getText('document.title', metadata.language))}</title>
  <style>
${css}
  </style>
</head>
<body>
  <div class="container">
${header}
${toc}
    <main>
${sectionsHtml}
    </main>
${footer}
  </div>
${js}
</body>
</html>`;

    this.logger.log(
      `[HtmlRenderer] Document rendered: ${sections.length} sections, ${html.length} bytes`,
    );

    return html;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CSS Generation
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generate inline CSS for the document.
   *
   * Design notes:
   * - Mobile-first responsive design
   * - Print-friendly styles
   * - High contrast for accessibility
   * - No external fonts (uses system fonts)
   */
  private buildCss(): string {
    return `
    /* Reset and base styles */
    *, *::before, *::after {
      box-sizing: border-box;
    }
    
    html {
      scroll-behavior: smooth;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #f8f9fa;
      margin: 0;
      padding: 16px;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      padding: 32px;
    }
    
    /* Header */
    .header {
      border-bottom: 2px solid #e9ecef;
      padding-bottom: 24px;
      margin-bottom: 24px;
    }
    
    .header-branding {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .company-logo {
      width: 48px;
      height: 48px;
      flex-shrink: 0;
    }

    .company-name {
      font-size: 20px;
      font-weight: 600;
      color: #212529;
    }

      font-size: 14px;
      color: #6c757d;
    }
    
    .header .meta strong {
      color: #495057;
    }
    
    /* Table of Contents */
    .toc {
      background-color: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 6px;
      padding: 20px;
      margin-bottom: 32px;
    }
    
    .toc h2 {
      margin: 0 0 12px 0;
      font-size: 18px;
      color: #495057;
    }
    
    .toc ul {
      margin: 0;
      padding-left: 20px;
    }
    
    .toc li {
      margin: 8px 0;
    }
    
    .toc a {
      color: #0066cc;
      text-decoration: none;
    }
    
    .toc a:hover {
      text-decoration: underline;
    }
    
    /* Sections - Native details/summary for collapsible behavior */
    .section {
      margin-bottom: 32px;
      border: 1px solid #e9ecef;
      border-radius: 6px;
      overflow: hidden;
    }
    
    .section > summary {
      background-color: #f8f9fa;
      padding: 16px 20px;
      border-bottom: 1px solid #e9ecef;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      list-style: none;
    }
    
    /* Remove default marker in various browsers */
    .section > summary::-webkit-details-marker {
      display: none;
    }
    
    .section > summary::marker {
      display: none;
      content: '';
    }
    
    .section > summary:hover {
      background-color: #e9ecef;
    }
    
    .section > summary:focus {
      outline: 2px solid #0066cc;
      outline-offset: -2px;
    }
    
    .section > summary h2 {
      margin: 0;
      font-size: 20px;
      color: #212529;
    }
    
    .section > summary .toggle {
      font-size: 18px;
      color: #6c757d;
      transition: transform 0.2s;
    }
    
    .section:not([open]) > summary .toggle {
      transform: rotate(-90deg);
    }
    
    .section-description {
      padding: 12px 20px;
      background-color: #fff3cd;
      border-bottom: 1px solid #e9ecef;
      font-size: 14px;
      color: #856404;
    }
    
    .section-summary {
      padding: 12px 20px;
      background-color: #d1ecf1;
      border-bottom: 1px solid #e9ecef;
      font-size: 14px;
      color: #0c5460;
    }
    
    .section-content {
      padding: 20px;
    }
    
    /* Entries */
    .entry {
      margin-bottom: 24px;
      padding-bottom: 24px;
      border-bottom: 1px solid #e9ecef;
    }
    
    .entry:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    
    /* Fields table */
    .fields-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .fields-table th,
    .fields-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e9ecef;
      vertical-align: top;
    }
    
    .fields-table th {
      background-color: #f8f9fa;
      font-weight: 600;
      color: #495057;
      width: 30%;
    }
    
    .fields-table tr:last-child th,
    .fields-table tr:last-child td {
      border-bottom: none;
    }
    
    .field-value {
      color: #212529;
      word-break: break-word;
    }
    
    .field-explanation {
      margin-top: 8px;
      padding: 8px 12px;
      background-color: #f8f9fa;
      border-left: 3px solid #0066cc;
      font-size: 13px;
      color: #6c757d;
    }
    
    /* Footer */
    .footer {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 2px solid #e9ecef;
      font-size: 13px;
      color: #6c757d;
      text-align: center;
    }
    
    .footer p {
      margin: 8px 0;
    }
    
    /* Print styles */
    @media print {
      body {
        background-color: #ffffff;
        padding: 0;
      }
      
      .container {
        box-shadow: none;
        max-width: none;
        padding: 0;
      }
      
      .section {
        break-inside: avoid;
      }
      
      /* Force all sections open for printing */
      .section[open] .section-content,
      .section:not([open]) .section-content {
        display: block;
      }
      
      .section > summary .toggle {
        display: none;
      }
      
      .toc a {
        color: #000000;
      }
    }
    
    /* Responsive */
    @media (max-width: 600px) {
      .container {
        padding: 16px;
      }
      
      .fields-table th {
        width: 40%;
      }
      
      .header h1 {
        font-size: 24px;
      }
    }
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Header Generation
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build the document header with title and metadata.
   */
  private buildHeader(metadata: GdprExportDocument['metadata']): string {
    const formattedDate = this.formatDate(metadata.generatedAt);
    const lang = metadata.language;
    const companyName = BRANDING.companyName;

    // Check if logo file exists (will be included in ZIP if present)
    const logoPath = path.join(process.cwd(), BRANDING.logoPath);
    const logoExists = fs.existsSync(logoPath);

    // Reference logo relatively if it exists (logo is included in ZIP separately)
    let logoHtml = '';
    if (logoExists) {
      logoHtml = `<img class="company-logo" src="${BRANDING.logoPath}" alt="${this.escapeHtml(companyName)}" />`;
    }

    return `
    <header class="header">
      <div class="header-branding">
        ${logoHtml}
        <span class="company-name">${this.escapeHtml(companyName)}</span>
      </div>
      <h1>${this.escapeHtml(this.localization.getText('document.title', lang))}</h1>
      <div class="meta">
        <p><strong>${this.escapeHtml(this.localization.getText('document.generated', lang))}:</strong> ${this.escapeHtml(formattedDate)}</p>
        <p><strong>${this.escapeHtml(this.localization.getText('document.exportId', lang))}:</strong> ${this.escapeHtml(metadata.identityId)}</p>
        <p><strong>${this.escapeHtml(this.localization.getText('document.schemaVersion', lang))}:</strong> ${this.escapeHtml(metadata.schemaVersion)}</p>
      </div>
    </header>`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Table of Contents
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build the table of contents with links to each section.
   */
  private buildTableOfContents(sections: GdprDocumentSection[], language: string): string {
    const items = sections
      .map((section) => {
        const anchorId = this.getSectionAnchorId(section.id);
        return `        <li><a href="#${anchorId}">${this.escapeHtml(section.title)}</a></li>`;
      })
      .join('\n');

    return `
    <nav class="toc" aria-label="Table of Contents">
      <h2>${this.escapeHtml(this.localization.getText('document.toc', language))}</h2>
      <ul>
${items}
      </ul>
    </nav>`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Section Rendering
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Render a single section to HTML.
   */
  private buildSection(section: GdprDocumentSection): string {
    const anchorId = this.getSectionAnchorId(section.id);

    // Build description if present
    const descriptionHtml = section.description
      ? `
        <div class="section-description">
          ${this.escapeHtml(section.description)}
        </div>`
      : '';

    // Build summary if present
    const summaryHtml = section.summary
      ? `
        <div class="section-summary">
          ${this.escapeHtml(section.summary)}
        </div>`
      : '';

    // Build entries
    const entriesHtml = section.entries.map((entry) => this.buildEntry(entry)).join('\n');

    return `
      <details class="section" id="${anchorId}" open>
        <summary>
          <h2>${this.escapeHtml(section.title)}</h2>
          <span class="toggle" aria-hidden="true">▼</span>
        </summary>
        ${descriptionHtml}
        ${summaryHtml}
        <div class="section-content">
          ${entriesHtml}
        </div>
      </details>`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Entry Rendering
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Render a single entry (record) to HTML.
   */
  private buildEntry(entry: GdprDocumentEntry): string {
    const rows = entry.fields.map((field) => this.buildFieldRow(field)).join('\n');

    return `
          <div class="entry">
            <table class="fields-table">
              <tbody>
${rows}
              </tbody>
            </table>
          </div>`;
  }

  /**
   * Render a single field row in a table.
   *
   * The "Field / Value / Explanation" pattern is implemented here:
   * - Field label as table header (th)
   * - Value as table data (td)
   * - Explanation as a note below the value (if present)
   */
  private buildFieldRow(field: GdprDocumentField): string {
    const explanationHtml = field.explanation
      ? `
                    <div class="field-explanation">
                      ${this.escapeHtml(field.explanation)}
                    </div>`
      : '';

    return `
                <tr>
                  <th scope="row">${this.escapeHtml(field.label)}</th>
                  <td>
                    <div class="field-value">${this.escapeHtml(field.value)}</div>
                    ${explanationHtml}
                  </td>
                </tr>`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Footer
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build the document footer with legal notice.
   */
  private buildFooter(metadata: GdprExportDocument['metadata']): string {
    const formattedDate = this.formatDate(metadata.generatedAt);
    const lang = metadata.language;

    return `
    <footer class="footer">
      <p>${this.escapeHtml(this.localization.getText('document.footer.gdprNotice', lang))}</p>
      <p>${this.escapeHtml(this.localization.getText('document.footer.generatedOn', lang))} ${this.escapeHtml(formattedDate)} | ${this.escapeHtml(this.localization.getText('document.schemaVersion', lang))} ${this.escapeHtml(metadata.schemaVersion)}</p>
      <p>${this.escapeHtml(this.localization.getText('document.footer.confidential', lang))}</p>
    </footer>`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // JavaScript (Optional Enhancement)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build inline JavaScript for optional enhancement.
   *
   * Native <details><summary> elements handle collapsing/expanding
   * without JavaScript. This works on mobile and desktop browsers.
   *
   * The JS here only provides:
   * - Expand all sections before printing (for complete printouts)
   *
   * The document is fully functional without JavaScript.
   */
  private buildJavaScript(): string {
    // Native <details><summary> handles collapse behavior.
    // JavaScript is optional - only used for print enhancement.
    return `
  <script>
    // Optional enhancement: Expand all sections before printing
    window.addEventListener('beforeprint', function() {
      document.querySelectorAll('details.section').forEach(function(d) {
        d.setAttribute('open', '');
      });
    });
  </script>`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Utility Methods
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Escape HTML special characters to prevent XSS.
   *
   * All user-provided content MUST be escaped before insertion.
   */
  private escapeHtml(text: string): string {
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
  }

  /**
   * Generate a stable anchor ID for a section.
   *
   * Anchor IDs are deterministic and URL-safe.
   */
  private getSectionAnchorId(sectionId: string): string {
    return `section-${sectionId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  }

  /**
   * Format a date for human display.
   *
   * Uses ISO 8601 format (universally understood).
   */
  private formatDate(date: Date): string {
    return date.toISOString();
  }
}
