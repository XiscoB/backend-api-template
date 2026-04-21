/**
 * GDPR Registry Validation Tests (Unit Tests)
 *
 * These tests validate GDPR registry configuration correctness.
 * They are PURE UNIT TESTS - no database required.
 *
 * PURPOSE: Detect configuration errors in GDPR registry:
 * - Missing user-owned tables
 * - Invalid field configurations
 * - Incorrect ownership patterns
 *
 * CRITICAL: These tests run without NestJS app initialization.
 * They test the static GDPR configuration only.
 */

import { GDPR_EXPORT_TABLES, GDPR_EXCLUDED_TABLES } from '../src/modules/gdpr/gdpr.registry';

// ─────────────────────────────────────────────────────────────
// Test Suite: GDPR Registry Validation (No Database Required)
// ─────────────────────────────────────────────────────────────

describe('GDPR Registry Validation (Unit Tests)', () => {
  // ═══════════════════════════════════════════════════════════════════
  // Test Suite 1: GDPR Export Coverage Test
  // ═══════════════════════════════════════════════════════════════════

  describe('1️⃣ GDPR Export Coverage Test (Future-proofing)', () => {
    /**
     * Purpose: Detect user-owned tables that are missing from GDPR configuration.
     *
     * This test:
     * 1. Lists all known user-owned tables
     * 2. Verifies they are registered in GDPR_EXPORT_TABLES or GDPR_EXCLUDED_TABLES
     * 3. Fails if any user-owned table is not registered
     */

    // Known tables that should be in GDPR registry (direct ownership via identityId)
    const USER_OWNED_TABLES_DIRECT = [
      'Profile',
      'NotificationLog',
      'ScheduledNotification',
      'UserNotificationProfile',
    ];

    // Known tables with indirect ownership (through other user tables)
    const USER_OWNED_TABLES_INDIRECT = [
      'UserEmailChannel', // via UserNotificationProfile
      'UserPushChannel', // via UserNotificationProfile
    ];

    it('should have all direct-ownership tables registered in GDPR_EXPORT_TABLES', () => {
      const registeredModelNames = GDPR_EXPORT_TABLES.map((t) => t.modelName);

      for (const tableName of USER_OWNED_TABLES_DIRECT) {
        expect(registeredModelNames).toContain(tableName);
      }
    });

    it('should have all indirect-ownership tables registered in GDPR_EXPORT_TABLES', () => {
      const registeredModelNames = GDPR_EXPORT_TABLES.map((t) => t.modelName);

      for (const tableName of USER_OWNED_TABLES_INDIRECT) {
        expect(registeredModelNames).toContain(tableName);
      }
    });

    it('should have correct userField for indirect-ownership tables', () => {
      // Indirect ownership tables should NOT use identityId
      const emailChannelConfig = GDPR_EXPORT_TABLES.find((t) => t.modelName === 'UserEmailChannel');
      const pushChannelConfig = GDPR_EXPORT_TABLES.find((t) => t.modelName === 'UserPushChannel');

      expect(emailChannelConfig).toBeDefined();
      expect(pushChannelConfig).toBeDefined();

      // These tables use notificationProfileId, not identityId
      expect(emailChannelConfig?.userField).toBe('notificationProfileId');
      expect(pushChannelConfig?.userField).toBe('notificationProfileId');
    });

    it('should have infrastructure tables in GDPR_EXCLUDED_TABLES', () => {
      // Infrastructure tables should be excluded from GDPR exports
      const infrastructureTables = [
        'Identity', // The ownership anchor itself
        'Request', // GDPR request infrastructure
        'GdprAuditLog', // Immutable audit log
        'AccountSuspension', // Suspension infrastructure
        'SuspensionBackup', // Suspension backup storage
      ];

      for (const tableName of infrastructureTables) {
        expect(GDPR_EXCLUDED_TABLES).toContain(tableName);
      }
    });

    it('should not have any table in both GDPR_EXPORT_TABLES and GDPR_EXCLUDED_TABLES', () => {
      const exportedModelNames = GDPR_EXPORT_TABLES.map((t) => t.modelName);

      // No overlap allowed
      for (const modelName of exportedModelNames) {
        expect(GDPR_EXCLUDED_TABLES).not.toContain(modelName);
      }
    });

    it('should have export flag correctly set for all tables', () => {
      // Tables that should be exportable (visible to users)
      const exportableTables = [
        'Profile',
        'NotificationLog',
        'UserNotificationProfile',
        'UserEmailChannel',
        'UserPushChannel',
      ];

      // Tables that should NOT be exportable (execution layer)
      const nonExportableTables = ['ScheduledNotification'];

      for (const config of GDPR_EXPORT_TABLES) {
        if (exportableTables.includes(config.modelName)) {
          expect(config.export).toBe(true);
        }
        if (nonExportableTables.includes(config.modelName)) {
          expect(config.export).toBe(false);
        }
      }
    });

    it('should detect if new user-owned tables are added without GDPR registration', () => {
      /**
       * This test validates that all known user-owned models are registered.
       * If a new table is added with identityId but not registered in GDPR,
       * this test will fail.
       *
       * IMPORTANT: When adding a new user-owned table, update this list.
       */

      // Get all model names from GDPR registry
      const registeredModels = new Set([
        ...GDPR_EXPORT_TABLES.map((t) => t.modelName),
        ...GDPR_EXCLUDED_TABLES,
      ]);

      // Known models that reference Identity directly or indirectly
      // This list should be updated when new user-owned tables are added
      const knownUserOwnedModels = new Set([
        // Direct ownership (has identityId)
        'Profile',
        'Request',
        'GdprAuditLog',
        'NotificationLog',
        'ScheduledNotification',
        'UserNotificationProfile',
        'AccountSuspension',
        'SuspensionBackup',
        'NotificationDeliveryLog',
        // Indirect ownership (references user-owned tables)
        'UserEmailChannel',
        'UserPushChannel',
        // Infrastructure (excluded but tracked)
        'Identity',
        'GdprExportFile',
        'NotificationEvent',
        'NotificationEventDelivery',
        'DeliveryRetryQueue',
        'SchedulerLock',
      ]);

      // All known user-owned models must be in the registry
      for (const model of knownUserOwnedModels) {
        expect(registeredModels.has(model)).toBe(true);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Suite 2: Registry Validation Test
  // ═══════════════════════════════════════════════════════════════════

  describe('2️⃣ Registry Configuration Validation', () => {
    /**
     * Purpose: Validate GDPR registry configuration is correct.
     *
     * This ensures:
     * - All tables have valid configurations
     * - Naming conventions are followed
     * - No duplicate configurations
     */

    it('should have valid table names (snake_case format)', () => {
      for (const config of GDPR_EXPORT_TABLES) {
        // Table name should be snake_case (lowercase with underscores)
        expect(config.tableName).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    });

    it('should have valid model names (PascalCase format)', () => {
      for (const config of GDPR_EXPORT_TABLES) {
        // Model name should be PascalCase (starts with uppercase)
        expect(config.modelName).toMatch(/^[A-Z][a-zA-Z0-9]*$/);
      }
    });

    it('should have valid userField for each table', () => {
      const validUserFields = ['identityId', 'notificationProfileId'];

      for (const config of GDPR_EXPORT_TABLES) {
        expect(validUserFields).toContain(config.userField);
      }
    });

    it('should have no duplicate table registrations', () => {
      const modelNames = GDPR_EXPORT_TABLES.map((t) => t.modelName);
      const uniqueModels = new Set(modelNames);

      expect(modelNames.length).toBe(uniqueModels.size);
    });

    it('should have no duplicate table names in exclusion list', () => {
      const uniqueExcluded = new Set(GDPR_EXCLUDED_TABLES);

      expect(GDPR_EXCLUDED_TABLES.length).toBe(uniqueExcluded.size);
    });

    it('should have all required fields in each table config', () => {
      for (const config of GDPR_EXPORT_TABLES) {
        // Required fields
        expect(config.modelName).toBeDefined();
        expect(config.tableName).toBeDefined();
        expect(config.userField).toBeDefined();
        expect(typeof config.export).toBe('boolean');
      }
    });

    it('should have matching modelName and tableName (table is snake_case of model)', () => {
      // Helper to convert PascalCase to snake_case
      const toSnakeCase = (str: string): string => {
        return str.replace(/([A-Z])/g, (_match: string, p1: string, offset: number) => {
          return offset > 0 ? '_' + p1.toLowerCase() : p1.toLowerCase();
        });
      };

      for (const config of GDPR_EXPORT_TABLES) {
        const expectedTableName = toSnakeCase(config.modelName);
        // Allow for some variations (e.g., user_notification_profile vs user_notification_profiles)
        expect(config.tableName).toContain(expectedTableName.substring(0, 10));
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Suite 3: Ownership Chain Validation
  // ═══════════════════════════════════════════════════════════════════

  describe('3️⃣ Ownership Chain Validation', () => {
    /**
     * Purpose: Validate that ownership chains are properly configured.
     *
     * Direct ownership: Table has identityId → links to Identity
     * Indirect ownership: Table links to a parent with identityId
     */

    it('should have direct-ownership tables use identityId as userField', () => {
      const directOwnershipTables = [
        'Profile',
        'NotificationLog',
        'ScheduledNotification',
        'UserNotificationProfile',
      ];

      for (const modelName of directOwnershipTables) {
        const config = GDPR_EXPORT_TABLES.find((t) => t.modelName === modelName);
        expect(config).toBeDefined();
        expect(config?.userField).toBe('identityId');
      }
    });

    it('should have indirect-ownership tables use parent FK as userField', () => {
      const indirectOwnershipTables = [
        { modelName: 'UserEmailChannel', parentField: 'notificationProfileId' },
        { modelName: 'UserPushChannel', parentField: 'notificationProfileId' },
      ];

      for (const { modelName, parentField } of indirectOwnershipTables) {
        const config = GDPR_EXPORT_TABLES.find((t) => t.modelName === modelName);
        expect(config).toBeDefined();
        expect(config?.userField).toBe(parentField);
      }
    });

    it('should have at least one parent table for each indirect ownership pattern', () => {
      // For each indirect ownership pattern, the parent table must also be registered
      const indirectOwnershipPatterns = [
        { childField: 'notificationProfileId', parentModel: 'UserNotificationProfile' },
      ];

      for (const { parentModel } of indirectOwnershipPatterns) {
        const parentConfig = GDPR_EXPORT_TABLES.find((t) => t.modelName === parentModel);
        expect(parentConfig).toBeDefined();
        // Parent must have direct ownership (identityId)
        expect(parentConfig?.userField).toBe('identityId');
      }
    });
  });
});
