#!/usr/bin/env node
/**
 * Bootstrap DTO Contract Validation Script
 *
 * Validates that the GET /api/v1/public/bootstrap endpoint returns the expected contract.
 *
 * Contract Rules (from api.md):
 * 1. Required top-level keys: updatePolicy, metadata, features, i18n
 * 2. No unexpected top-level keys allowed
 * 3. EN must always exist as fallback in updatePolicy messages
 * 4. All required nested structures must be present
 *
 * Usage:
 *   npx ts-node scripts/ci/validate-bootstrap-contract.ts
 *
 * @see .github/agents/api.md for authoritative API documentation
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import type {
  AppBootstrapResponseDto,
  UpdatePolicyDto,
  PlatformUpdatePolicyDto,
  UpdateMessageDto,
  AppMetadataDto,
  FeatureFlagsDto,
  I18nDto,
} from '../../src/modules/app/v1/dto/app-bootstrap.dto';

// ═══════════════════════════════════════════════════════════════════════════════
// Contract Definition
// ═══════════════════════════════════════════════════════════════════════════════

const REQUIRED_TOP_LEVEL_KEYS = ['updatePolicy', 'metadata', 'features', 'i18n'];

const REQUIRED_UPDATE_POLICY_PLATFORMS = ['ios', 'android', 'web'];

const REQUIRED_PLATFORM_POLICY_KEYS = ['minimumVersion', 'forceUpdate', 'messages'];

const REQUIRED_METADATA_KEYS = ['apiVersion', 'policiesVersion', 'branding'];

const REQUIRED_BRANDING_KEYS = ['companyName', 'supportEmail'];

const REQUIRED_FEATURE_FLAGS = [
  'premiumEnabled',
  'pushNotificationsEnabled',
  'emailNotificationsEnabled',
  'dataExportEnabled',
  'accountSuspensionEnabled',
];

const REQUIRED_I18N_KEYS = ['defaultLanguage', 'supportedLanguages'];

// ═══════════════════════════════════════════════════════════════════════════════
// Validation Logic
// ═══════════════════════════════════════════════════════════════════════════════

const errors: string[] = [];
const warnings: string[] = [];

function addError(message: string) {
  errors.push(`❌ ${message}`);
}

function addWarning(message: string) {
  warnings.push(`⚠️  ${message}`);
}

function validateTopLevelKeys(bootstrap: AppBootstrapResponseDto) {
  const actualKeys = Object.keys(bootstrap);

  // Check for missing required keys
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!actualKeys.includes(key)) {
      addError(`Missing required top-level key: ${key}`);
    }
  }

  // Check for unexpected keys
  for (const key of actualKeys) {
    if (!REQUIRED_TOP_LEVEL_KEYS.includes(key)) {
      addError(`Unexpected top-level key: ${key} (contract violation)`);
    }
  }
}

function validateUpdatePolicy(updatePolicy: UpdatePolicyDto) {
  if (!updatePolicy || typeof updatePolicy !== 'object') {
    addError('updatePolicy must be an object');
    return;
  }

  for (const platform of REQUIRED_UPDATE_POLICY_PLATFORMS) {
    const policy: PlatformUpdatePolicyDto | undefined =
      updatePolicy[platform as keyof UpdatePolicyDto];
    if (!policy) {
      addError(`updatePolicy missing platform: ${platform}`);
      continue;
    }

    // Check required keys
    for (const key of REQUIRED_PLATFORM_POLICY_KEYS) {
      if (!(key in policy)) {
        addError(`updatePolicy.${platform} missing key: ${key}`);
      }
    }

    // Validate minimumVersion is a string
    if (typeof policy.minimumVersion !== 'string') {
      addError(`updatePolicy.${platform}.minimumVersion must be a string`);
    }

    // Validate forceUpdate is a boolean
    if (typeof policy.forceUpdate !== 'boolean') {
      addError(`updatePolicy.${platform}.forceUpdate must be a boolean`);
    }

    // Validate messages array
    if (!Array.isArray(policy.messages)) {
      addError(`updatePolicy.${platform}.messages must be an array`);
    } else {
      // Validate EN fallback exists
      const hasEnFallback = policy.messages.some((msg: UpdateMessageDto) => msg.language === 'en');
      if (!hasEnFallback) {
        addError(`updatePolicy.${platform}.messages must include EN fallback`);
      }

      // Validate message structure
      for (const msg of policy.messages) {
        if (typeof msg.language !== 'string') {
          addError(`updatePolicy.${platform}.messages[].language must be a string`);
        }
        if (typeof msg.title !== 'string') {
          addError(`updatePolicy.${platform}.messages[].title must be a string`);
        }
        if (typeof msg.body !== 'string') {
          addError(`updatePolicy.${platform}.messages[].body must be a string`);
        }
      }
    }
  }
}

function validateMetadata(metadata: AppMetadataDto) {
  if (!metadata || typeof metadata !== 'object') {
    addError('metadata must be an object');
    return;
  }

  for (const key of REQUIRED_METADATA_KEYS) {
    if (!(key in metadata)) {
      addError(`metadata missing key: ${key}`);
    }
  }

  if (typeof metadata.apiVersion !== 'string') {
    addError('metadata.apiVersion must be a string');
  }

  if (typeof metadata.policiesVersion !== 'string') {
    addError('metadata.policiesVersion must be a string');
  }

  // Validate branding
  if (metadata.branding) {
    for (const key of REQUIRED_BRANDING_KEYS) {
      if (!(key in metadata.branding)) {
        addError(`metadata.branding missing key: ${key}`);
      }
    }

    if (typeof metadata.branding.companyName !== 'string') {
      addError('metadata.branding.companyName must be a string');
    }
    if (typeof metadata.branding.supportEmail !== 'string') {
      addError('metadata.branding.supportEmail must be a string');
    }
  }
}

function validateFeatureFlags(features: FeatureFlagsDto) {
  if (!features || typeof features !== 'object') {
    addError('features must be an object');
    return;
  }

  for (const flag of REQUIRED_FEATURE_FLAGS) {
    if (!(flag in features)) {
      addError(`features missing flag: ${flag}`);
    } else if (typeof features[flag as keyof FeatureFlagsDto] !== 'boolean') {
      addError(`features.${flag} must be a boolean`);
    }
  }

  // Check for unexpected feature flags (warning, not error)
  const actualFlags = Object.keys(features);
  for (const flag of actualFlags) {
    if (!REQUIRED_FEATURE_FLAGS.includes(flag)) {
      addWarning(`Undocumented feature flag: ${flag} (consider adding to contract)`);
    }
  }
}

function validateI18n(i18n: I18nDto) {
  if (!i18n || typeof i18n !== 'object') {
    addError('i18n must be an object');
    return;
  }

  for (const key of REQUIRED_I18N_KEYS) {
    if (!(key in i18n)) {
      addError(`i18n missing key: ${key}`);
    }
  }

  if (typeof i18n.defaultLanguage !== 'string') {
    addError('i18n.defaultLanguage must be a string');
  }

  if (!Array.isArray(i18n.supportedLanguages)) {
    addError('i18n.supportedLanguages must be an array');
  } else {
    // EN must be in supported languages
    if (!i18n.supportedLanguages.includes('en')) {
      addError('i18n.supportedLanguages must include "en" as fallback');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Execution
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Bootstrap DTO Contract Validation');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Bootstrap the NestJS application
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    // Get the bootstrap service and call it directly
    const { AppBootstrapService } = await import('../../src/modules/app/app-bootstrap.service');
    const bootstrapService = app.get(AppBootstrapService);

    console.log('📡 Calling AppBootstrapService.getBootstrapConfig()...\n');
    const bootstrap = bootstrapService.getBootstrapConfig();

    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('1. Top-Level Structure');
    console.log('─────────────────────────────────────────────────────────────────────\n');

    console.log(`Actual keys: [${Object.keys(bootstrap).join(', ')}]`);
    console.log(`Expected keys: [${REQUIRED_TOP_LEVEL_KEYS.join(', ')}]\n`);

    validateTopLevelKeys(bootstrap);

    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('2. updatePolicy Validation');
    console.log('─────────────────────────────────────────────────────────────────────\n');

    if (bootstrap.updatePolicy) {
      const platforms = Object.keys(bootstrap.updatePolicy) as Array<keyof UpdatePolicyDto>;
      console.log(`Platforms defined: [${platforms.join(', ')}]`);
      for (const platform of platforms) {
        const policy: PlatformUpdatePolicyDto = bootstrap.updatePolicy[platform];
        const languages = policy.messages?.map((m: UpdateMessageDto) => m.language) ?? [];
        console.log(
          `  ${platform}: v${policy.minimumVersion}, force=${policy.forceUpdate}, langs=[${languages.join(', ')}]`,
        );
      }
      console.log();
    }

    validateUpdatePolicy(bootstrap.updatePolicy);

    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('3. metadata Validation');
    console.log('─────────────────────────────────────────────────────────────────────\n');

    if (bootstrap.metadata) {
      console.log(`API Version: ${bootstrap.metadata.apiVersion}`);
      console.log(`Policies Version: ${bootstrap.metadata.policiesVersion}`);
      if (bootstrap.metadata.branding) {
        console.log(`Company: ${bootstrap.metadata.branding.companyName}`);
        console.log(`Support Email: ${bootstrap.metadata.branding.supportEmail}`);
      }
      console.log();
    }

    validateMetadata(bootstrap.metadata);

    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('4. features Validation');
    console.log('─────────────────────────────────────────────────────────────────────\n');

    if (bootstrap.features) {
      for (const [flag, value] of Object.entries(bootstrap.features)) {
        const marker = value ? '✅' : '❌';
        console.log(`  ${marker} ${flag}: ${value}`);
      }
      console.log();
    }

    validateFeatureFlags(bootstrap.features);

    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('5. i18n Validation');
    console.log('─────────────────────────────────────────────────────────────────────\n');

    if (bootstrap.i18n) {
      console.log(`Default Language: ${bootstrap.i18n.defaultLanguage}`);
      console.log(`Supported Languages: [${bootstrap.i18n.supportedLanguages.join(', ')}]`);
      console.log();
    }

    validateI18n(bootstrap.i18n);

    // ═══════════════════════════════════════════════════════════════════════════
    // Results
    // ═══════════════════════════════════════════════════════════════════════════

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('  VALIDATION RESULTS');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    if (warnings.length > 0) {
      console.log('Warnings:');
      warnings.forEach((w) => console.log(`  ${w}`));
      console.log();
    }

    if (errors.length > 0) {
      console.log('Errors:');
      errors.forEach((e) => console.log(`  ${e}`));
      console.log();
      console.log(`❌ FAILED: ${errors.length} contract violation(s) found`);
      await app.close();
      process.exit(1);
    }

    console.log('✅ PASSED: Bootstrap DTO contract is valid');
    console.log(`   - All ${REQUIRED_TOP_LEVEL_KEYS.length} required sections present`);
    console.log(`   - No unexpected top-level keys`);
    console.log(`   - EN fallback exists for all localized messages`);
    console.log();

    await app.close();
    process.exit(0);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Fatal error during validation:', message);
    await app.close();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
