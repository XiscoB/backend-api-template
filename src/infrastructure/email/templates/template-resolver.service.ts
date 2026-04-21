import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { EmailConfigService } from '../config/email-config.service';
import {
  EmailTemplateFile,
  EmailTemplateDefinition,
  ResolvedEmailTemplate,
} from './template.types';

/**
 * Email template resolver service.
 *
 * Loads language-based email templates from JSON files and resolves
 * them with variables. Templates are wrapped in a standard HTML layout.
 *
 * Template files are stored in:
 *   src/infrastructure/email/templates/locales/{locale}.json
 *
 * Layout file:
 *   src/infrastructure/email/templates/layout.html
 */
@Injectable()
export class EmailTemplateResolver implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplateResolver.name);

  /**
   * Template cache: locale -> templateKey -> definition
   */
  private readonly templates = new Map<string, EmailTemplateFile>();

  /**
   * Base HTML layout template.
   */
  private layoutTemplate = '';

  /**
   * Default locale for fallback.
   */
  private readonly defaultLocale = 'en';

  /**
   * Path to templates directory.
   */
  private readonly templatesPath: string;

  constructor(private readonly config: EmailConfigService) {
    // Templates are relative to the compiled output
    // dist/infrastructure/email/templates/locales
    this.templatesPath = join(__dirname, 'locales');
  }

  /**
   * Load all locale files and layout on module initialization.
   */
  onModuleInit(): void {
    this.loadLayout();
    this.loadAllLocales();
  }

  /**
   * Resolve a template with the given variables.
   *
   * @param templateKey - The template identifier
   * @param locale - The locale to use (falls back to 'en')
   * @param variables - Variables for placeholder substitution
   * @returns Resolved template with rendered content
   */
  resolve(
    templateKey: string,
    locale: string,
    variables: Record<string, string>,
  ): ResolvedEmailTemplate {
    const template = this.getTemplate(templateKey, locale);

    if (!template) {
      throw new Error(
        `Email template not found: '${templateKey}' (locale: ${locale}, fallback: ${this.defaultLocale})`,
      );
    }

    // Prepare variables (Global + Local)
    const globalVars = this.getGlobalVariables();
    const allVars = { ...globalVars, ...variables };

    // Resolve inner content
    const subject = this.replaceVariables(template.subject, allVars);
    const htmlContent = this.replaceVariables(template.html, allVars);
    const textContent = template.text ? this.replaceVariables(template.text, allVars) : undefined;

    // Resolve layout
    const html = this.applyLayout(htmlContent, subject, allVars);

    // Append footer to text version (simple fallback)
    const text = textContent
      ? `${textContent}\n\n---\n© ${allVars.currentYear} ${allVars.projectName}`
      : undefined;

    return {
      subject,
      html,
      text,
    };
  }

  /**
   * Apply layout to HTML content.
   */
  private applyLayout(content: string, subject: string, variables: Record<string, string>): string {
    if (!this.layoutTemplate) {
      return content;
    }

    // Inject special layout variables
    const layoutVars = {
      ...variables,
      content,
      subject,
    };

    return this.replaceVariables(this.layoutTemplate, layoutVars);
  }

  /**
   * Get global variables available to all templates.
   */
  private getGlobalVariables(): Record<string, string> {
    const logoUrl = this.config.productLogoUrl;
    const hasLogo = !!logoUrl;

    return {
      projectName: this.config.productName,
      projectLogoUrl: logoUrl,
      supportEmail: this.config.supportEmail,
      currentYear: new Date().getFullYear().toString(),
      productUrl: '#', // Could be config-driven
      // Derived logic for layout
      logoDisplay: hasLogo ? 'block' : 'none',
      nameDisplay: hasLogo ? 'none' : 'block',
    };
  }

  /**
   * Check if a template exists for the given key and locale.
   */
  hasTemplate(templateKey: string, locale: string): boolean {
    return this.getTemplate(templateKey, locale) !== undefined;
  }

  /**
   * Get available locales.
   */
  getAvailableLocales(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Get available template keys for a locale.
   */
  getTemplateKeys(locale: string): string[] {
    const file = this.templates.get(locale) ?? this.templates.get(this.defaultLocale);
    return file ? Object.keys(file) : [];
  }

  /**
   * Load base layout HTML.
   */
  private loadLayout(): void {
    // layout.html is sibling to locales directory
    const layoutPath = join(this.templatesPath, '../layout.html');

    try {
      if (existsSync(layoutPath)) {
        this.layoutTemplate = readFileSync(layoutPath, 'utf-8');
        this.logger.log('Loaded email layout template');
      } else {
        this.logger.warn(`Email layout template not found at: ${layoutPath}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to load email layout: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Load all locale files from the locales directory.
   */
  private loadAllLocales(): void {
    if (!existsSync(this.templatesPath)) {
      this.logger.warn(`Email templates directory not found: ${this.templatesPath}`);
      return;
    }

    const files = readdirSync(this.templatesPath).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const locale = file.replace('.json', '');
      this.loadLocale(locale);
    }

    this.logger.log(
      `Loaded email templates for ${this.templates.size} locale(s): ${Array.from(this.templates.keys()).join(', ')}`,
    );
  }

  /**
   * Load a single locale file.
   */
  private loadLocale(locale: string): void {
    const filePath = join(this.templatesPath, `${locale}.json`);

    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content) as EmailTemplateFile;

      // Validate template structure
      for (const [key, def] of Object.entries(parsed)) {
        if (!def.subject || !def.html) {
          this.logger.warn(
            `Invalid template structure for '${key}' in ${locale}.json: missing subject or html`,
          );
        }
      }

      this.templates.set(locale, parsed);
      this.logger.debug(`Loaded ${Object.keys(parsed).length} templates for locale: ${locale}`);
    } catch (error) {
      this.logger.error(
        `Failed to load email templates for locale '${locale}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get a template definition, falling back to default locale.
   */
  private getTemplate(templateKey: string, locale: string): EmailTemplateDefinition | undefined {
    // Try requested locale
    const localeFile = this.templates.get(locale);
    if (localeFile?.[templateKey]) {
      return localeFile[templateKey];
    }

    // Fallback to default locale
    if (locale !== this.defaultLocale) {
      const defaultFile = this.templates.get(this.defaultLocale);
      if (defaultFile?.[templateKey]) {
        this.logger.debug(
          `Template '${templateKey}' not found for locale '${locale}', using fallback '${this.defaultLocale}'`,
        );
        return defaultFile[templateKey];
      }
    }

    return undefined;
  }

  /**
   * Replace {{variable}} placeholders with values.
   *
   * Uses a simple, explicit approach:
   * - Only replaces exact matches: {{variableName}}
   * - Unreplaced placeholders remain as-is (visible in output)
   * - No escaping or complex logic
   */
  private replaceVariables(template: string, variables: Record<string, string>): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      // Replace all occurrences of {{key}} with value
      const placeholder = `{{${key}}}`;
      result = result.split(placeholder).join(value);
    }

    return result;
  }
}
