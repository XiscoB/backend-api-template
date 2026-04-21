import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GDPR_INCLUDED_TABLES } from '../../config/app.constants';
import {
  isModelRegistered,
  getModelConfig,
  GDPR_REGISTRY,
  GDPR_EXCLUDED_TABLES,
  validateGdprRegistry,
  getEffectiveSuspendPiiFields,
} from './gdpr.registry';
import { findUnclassifiedOwnershipModels } from './gdpr-ownership.check';
import { GdprEnforcementViolation } from './gdpr.types';

/**
 * GDPR Enforcement Service
 *
 * Validates that all Prisma models with `identityId` column are properly
 * registered in the GDPR registry.
 *
 * Purpose:
 * - Prevent accidental omission of user data tables from GDPR
 * - Catch missing registrations at startup
 * - Fail loudly in production to prevent compliance issues
 *
 * Behavior:
 * - Development: Logs BIG WARNING for violations
 * - Production: Throws error to prevent startup
 *
 * How it works:
 * - Inspects Prisma DMMF (Data Model Meta Format) to find all models
 * - Checks if any model has a field named 'identityId' (user FK convention)
 * - Verifies those models are either registered or explicitly excluded
 */
@Injectable()
export class GdprEnforcementService implements OnModuleInit {
  private readonly logger = new Logger(GdprEnforcementService.name);

  /**
   * Run enforcement check on module initialization.
   *
   * This ensures violations are caught as early as possible.
   */
  onModuleInit(): void {
    this.runEnforcementCheck();
  }

  /**
   * Run the GDPR registry enforcement check.
   *
   * Scans all Prisma models and verifies compliance.
   *
   * @returns List of violations found
   * @throws Error in production if violations are found
   */
  runEnforcementCheck(): GdprEnforcementViolation[] {
    this.logger.log('Running GDPR registry enforcement check...');

    // Step 1: Validate registry configuration (new unified validation)
    const registryErrors = validateGdprRegistry();
    const registryViolations: GdprEnforcementViolation[] = registryErrors.map((e) => ({
      modelName: e.modelName,
      message: e.error,
    }));

    // Step 2: Find model violations (existing logic)
    const modelViolations = this.findViolations();

    // Combine all violations
    const violations = [...registryViolations, ...modelViolations];

    if (violations.length === 0) {
      this.logger.log('✅ GDPR registry enforcement check passed');
      this.logRegistrySummary();
      return [];
    }

    // Log violations
    this.logViolations(violations);

    // In production, throw to prevent startup
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `GDPR Registry Enforcement Failed: ${violations.length} violation(s) found. ` +
          'Fix registry configuration or add missing models to GDPR_REGISTRY or GDPR_EXCLUDED_TABLES.',
      );
    }

    return violations;
  }

  /**
   * Find all models that violate the registry requirement.
   *
   * A violation occurs when:
   * - A model has a field named 'identityId'
   * - AND the model is not in GDPR_INCLUDED_TABLES
   * - AND the model is not in GDPR_EXCLUDED_TABLES
   *
   * Or when a registered model:
   * - Does not have a valid delete configuration
   * - Uses ANONYMIZE strategy without specifying fields
   * - Does not have a valid suspend configuration
   */
  private findViolations(): GdprEnforcementViolation[] {
    // Step 1: Find unclassified ownership models using pure function
    // This logic is shared with the CI/audit script (no DI, no side effects)
    const ownershipViolations = findUnclassifiedOwnershipModels(
      Prisma.dmmf,
      GDPR_INCLUDED_TABLES,
      GDPR_EXCLUDED_TABLES,
    );

    // Step 2: Validate configuration for registered models
    const configViolations = this.validateRegisteredModelConfigs();

    return [...ownershipViolations, ...configViolations];
  }

  /**
   * Validate delete/suspend configuration for all registered models.
   *
   * Separated from ownership check so the pure function remains stateless.
   */
  private validateRegisteredModelConfigs(): GdprEnforcementViolation[] {
    const violations: GdprEnforcementViolation[] = [];

    for (const model of Prisma.dmmf.datamodel.models) {
      const modelName = model.name;

      // Only validate registered models (not excluded or unclassified)
      if (!isModelRegistered(modelName)) {
        continue;
      }

      const config = getModelConfig(modelName);
      if (!config) {
        continue;
      }

      // Validate delete configuration
      const deleteViolation = this.validateDeleteConfig(config);
      if (deleteViolation) {
        violations.push(deleteViolation);
      }

      // Validate suspend configuration
      const suspendViolation = this.validateSuspendConfig(config);
      if (suspendViolation) {
        violations.push(suspendViolation);
      }
    }

    return violations;
  }

  /**
   * Validate the delete configuration for a registered model.
   *
   * Returns a violation if:
   * - delete.strategy is not defined
   * - ANONYMIZE strategy does not have fields array
   */
  private validateDeleteConfig(
    config: import('./gdpr.registry').GdprTableConfig,
  ): GdprEnforcementViolation | null {
    const { modelName } = config;
    const deleteConfig = config.delete;

    if (!deleteConfig?.strategy) {
      return {
        modelName,
        message:
          `Model '${modelName}' is registered but has no delete strategy defined. ` +
          `Add delete: { strategy: 'DELETE' | 'ANONYMIZE' } to the registry entry.`,
      };
    }

    if (deleteConfig.strategy === 'ANONYMIZE') {
      if (!deleteConfig.fields || deleteConfig.fields.length === 0) {
        return {
          modelName,
          message:
            `Model '${modelName}' uses ANONYMIZE strategy but has no fields defined. ` +
            `Add delete.fields: ['field1', 'field2'] to specify which fields to anonymize.`,
        };
      }
    }

    return null;
  }

  /**
   * Validate the suspend configuration for a registered model.
   *
   * Returns a violation if:
   * - suspend config is missing
   * - suspend.backup is not true
   * - ANONYMIZE strategy has no piiFields
   */
  private validateSuspendConfig(
    config: import('./gdpr.registry').GdprTableConfig,
  ): GdprEnforcementViolation | null {
    const { modelName } = config;
    const suspendConfig = config.suspend;

    // Suspend config is required for all registered models
    if (!suspendConfig) {
      return {
        modelName,
        message:
          `Model '${modelName}' is registered but has no suspend configuration. ` +
          `Add suspend: { strategy: 'DELETE' | 'ANONYMIZE', backup: true } to the registry entry.`,
      };
    }

    // Backup must be true for suspension
    if (suspendConfig.backup !== true) {
      return {
        modelName,
        message:
          `Model '${modelName}' has suspend config but backup is not true. ` +
          `Suspension requires backup: true for data recovery.`,
      };
    }

    // Strategy must be DELETE or ANONYMIZE
    if (suspendConfig.strategy !== 'DELETE' && suspendConfig.strategy !== 'ANONYMIZE') {
      return {
        modelName,
        message:
          `Model '${modelName}' has suspend config but strategy is invalid. ` +
          `Use strategy: 'DELETE' (default) or strategy: 'ANONYMIZE' (requires piiFields).`,
      };
    }

    // ANONYMIZE strategy requires piiFields
    if (suspendConfig.strategy === 'ANONYMIZE') {
      const piiFields = getEffectiveSuspendPiiFields(config);
      if (piiFields.length === 0) {
        return {
          modelName,
          message:
            `Model '${modelName}' uses ANONYMIZE suspend strategy but has no piiFields. ` +
            `Add suspend.piiFields: ['field1', 'field2'] or use strategy: 'DELETE'.`,
        };
      }
    }

    return null;
  }

  /**
   * Log violations in a very visible way.
   */
  private logViolations(violations: GdprEnforcementViolation[]): void {
    const separator = '═'.repeat(80);
    const warningLines = [
      '',
      separator,
      '⚠️  GDPR REGISTRY ENFORCEMENT VIOLATION  ⚠️',
      separator,
      '',
      `Found ${violations.length} model(s) with 'identityId' not in GDPR registry:`,
      '',
    ];

    for (const violation of violations) {
      warningLines.push(`  ❌ ${violation.modelName}`);
      warningLines.push(`     ${violation.message}`);
      warningLines.push('');
    }

    warningLines.push('Action Required:');
    warningLines.push('  1. Add to GDPR_REGISTRY in src/modules/gdpr/gdpr.registry.ts');
    warningLines.push('     OR');
    warningLines.push('  2. Add to GDPR_EXCLUDED_TABLES if infrastructure table');
    warningLines.push('');
    warningLines.push('This will THROW in production to prevent GDPR compliance issues.');
    warningLines.push('');
    warningLines.push(separator);
    warningLines.push('');

    this.logger.warn(warningLines.join('\n'));
  }

  /**
   * Log a summary of the current registry state.
   */
  private logRegistrySummary(): void {
    this.logger.log(
      `GDPR Registry: ${GDPR_REGISTRY.length} registered, ${GDPR_EXCLUDED_TABLES.length} excluded`,
    );

    if (GDPR_REGISTRY.length > 0) {
      const registered = GDPR_REGISTRY.map((t) => t.modelName).join(', ');
      this.logger.debug(`Registered tables: ${registered}`);
    }

    if (GDPR_EXCLUDED_TABLES.length > 0) {
      const excluded = GDPR_EXCLUDED_TABLES.join(', ');
      this.logger.debug(`Excluded tables: ${excluded}`);
    }
  }
}
