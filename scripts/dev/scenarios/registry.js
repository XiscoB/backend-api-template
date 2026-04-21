/**
 * Scenario Registry
 *
 * Central registry of all scenario tests.
 * Scenarios are organized by category and executed in order.
 *
 * @see docs/TEST_UI_CONTRACT.md - Authoritative source for expected behavior
 */

// Import scenario modules
const publicEndpoints = require('./scenarios/public-endpoints');
const profileLifecycle = require('./scenarios/profile-lifecycle');
const notificationFlows = require('./scenarios/notification-flows');
const gdprFlows = require('./scenarios/gdpr-flows');
const authFailures = require('./scenarios/auth-failures');
const adminOperations = require('./scenarios/admin-operations');

/**
 * Get all scenarios in execution order.
 *
 * Scenarios are organized by category:
 * 1. Public endpoints (no auth required)
 * 2. User profile lifecycle
 * 3. Notification management
 * 4. GDPR workflows
 * 5. Authentication/authorization failures
 * 6. Admin operations
 *
 * @returns {Array<{ name: string, description: string, run: Function }>}
 */
function getAllScenarios() {
  return [
    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC ENDPOINTS (No auth required)
    // ═══════════════════════════════════════════════════════════════════════
    publicEndpoints.bootstrapScenario,
    publicEndpoints.healthBasicScenario,
    publicEndpoints.healthDetailedScenario,

    // ═══════════════════════════════════════════════════════════════════════
    // USER PROFILE LIFECYCLE (Scenario 1 from contract)
    // ═══════════════════════════════════════════════════════════════════════
    profileLifecycle.profileCreationScenario,
    profileLifecycle.profileUpdateScenario,

    // ═══════════════════════════════════════════════════════════════════════
    // NOTIFICATION MANAGEMENT (Scenarios 2-4 from contract)
    // ═══════════════════════════════════════════════════════════════════════
    notificationFlows.notificationChannelsScenario,
    notificationFlows.notificationListReadScenario,
    notificationFlows.markAllReadScenario,

    // ═══════════════════════════════════════════════════════════════════════
    // GDPR WORKFLOWS (Scenarios 5-6 from contract)
    // ═══════════════════════════════════════════════════════════════════════
    gdprFlows.gdprExportScenario,
    gdprFlows.gdprExportDownloadScenario,
    gdprFlows.gdprSuspendRecoverScenario,
    gdprFlows.gdprDeleteScenario,

    // ═══════════════════════════════════════════════════════════════════════
    // AUTHENTICATION & AUTHORIZATION FAILURES (Scenarios 7-9 from contract)
    // ═══════════════════════════════════════════════════════════════════════
    authFailures.noDuplicateNotificationsScenario,
    authFailures.authenticationFailureScenario,
    authFailures.validationErrorScenario,
    authFailures.authorizationFailureScenario,

    // ═══════════════════════════════════════════════════════════════════════
    // ADMIN OPERATIONS (Scenarios 10-14 from contract)
    // ═══════════════════════════════════════════════════════════════════════
    adminOperations.adminHealthScenario,
    adminOperations.adminTableQueryScenario,
    adminOperations.adminRecordUpdateScenario,
    adminOperations.gdprAdminMonitoringScenario,
    adminOperations.cleanupJobExecutionScenario,
    adminOperations.adminGdprCoverageScenario,
  ];
}

/**
 * Get scenarios by category.
 *
 * @param {string} category - Category name
 * @returns {Array<{ name: string, description: string, run: Function }>}
 */
function getScenariosByCategory(category) {
  const categories = {
    public: [
      publicEndpoints.bootstrapScenario,
      publicEndpoints.healthBasicScenario,
      publicEndpoints.healthDetailedScenario,
    ],
    profile: [profileLifecycle.profileCreationScenario, profileLifecycle.profileUpdateScenario],
    notification: [
      notificationFlows.notificationChannelsScenario,
      notificationFlows.notificationListReadScenario,
      notificationFlows.markAllReadScenario,
    ],
    gdpr: [
      gdprFlows.gdprExportScenario,
      gdprFlows.gdprExportDownloadScenario,
      gdprFlows.gdprSuspendRecoverScenario,
      gdprFlows.gdprDeleteScenario,
    ],
    auth: [
      authFailures.noDuplicateNotificationsScenario,
      authFailures.authenticationFailureScenario,
      authFailures.validationErrorScenario,
      authFailures.authorizationFailureScenario,
    ],
    admin: [
      adminOperations.adminHealthScenario,
      adminOperations.adminTableQueryScenario,
      adminOperations.adminRecordUpdateScenario,
      adminOperations.gdprAdminMonitoringScenario,
      adminOperations.cleanupJobExecutionScenario,
      adminOperations.adminGdprCoverageScenario,
    ],
  };

  return categories[category] || [];
}

/**
 * Get count of scenarios by category.
 *
 * @returns {Object} Category counts
 */
function getScenarioCounts() {
  const all = getAllScenarios();
  return {
    total: all.length,
    public: 3,
    profile: 2,
    notification: 3,
    gdpr: 4,
    auth: 4,
    admin: 6,
  };
}

module.exports = {
  getAllScenarios,
  getScenariosByCategory,
  getScenarioCounts,
};
