/**
 * Assertion Utilities
 *
 * Simple assertion helpers that throw descriptive errors on failure.
 * These are designed to work with the TEST_UI_CONTRACT.md format.
 */

class AssertionError extends Error {
  constructor(message, expected, actual) {
    super(message);
    this.name = 'AssertionError';
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Assert that a value is truthy.
 */
function assert(condition, message) {
  if (!condition) {
    throw new AssertionError(message || 'Assertion failed');
  }
}

/**
 * Assert that two values are equal.
 */
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new AssertionError(
      message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      expected,
      actual,
    );
  }
}

/**
 * Assert that a value is one of the allowed values.
 */
function assertOneOf(actual, allowed, message) {
  if (!allowed.includes(actual)) {
    throw new AssertionError(
      message || `Expected one of ${JSON.stringify(allowed)}, got ${JSON.stringify(actual)}`,
      allowed,
      actual,
    );
  }
}

/**
 * Assert HTTP status code matches expected.
 */
function assertStatus(response, expected, message) {
  if (response.status !== expected) {
    const errorDetails = response.data?.error
      ? ` (${response.data.error.code}: ${response.data.error.message})`
      : '';
    throw new AssertionError(
      message || `Expected HTTP ${expected}, got ${response.status}${errorDetails}`,
      expected,
      response.status,
    );
  }
}

/**
 * Assert response has standard envelope structure.
 * Per TEST_UI_CONTRACT.md Section 3.
 */
function assertEnvelope(response, message) {
  const data = response.data;

  if (typeof data !== 'object') {
    throw new AssertionError(message || 'Response is not an object', 'object', typeof data);
  }

  if (!('data' in data)) {
    throw new AssertionError(
      message || 'Response missing "data" field (expected wrapped response)',
      'envelope with data field',
      Object.keys(data),
    );
  }

  if (!('meta' in data)) {
    throw new AssertionError(
      message || 'Response missing "meta" field (expected wrapped response)',
      'envelope with meta field',
      Object.keys(data),
    );
  }
}

/**
 * Assert response has error envelope structure.
 * Per TEST_UI_CONTRACT.md Section 3.
 */
function assertErrorEnvelope(response, expectedCode, message) {
  const data = response.data;

  if (!data.error) {
    throw new AssertionError(
      message || 'Response missing "error" field',
      'error envelope',
      Object.keys(data),
    );
  }

  if (!data.error.code) {
    throw new AssertionError(
      message || 'Error response missing "code" field',
      'error.code',
      Object.keys(data.error),
    );
  }

  if (expectedCode && data.error.code !== expectedCode) {
    throw new AssertionError(
      message || `Expected error code "${expectedCode}", got "${data.error.code}"`,
      expectedCode,
      data.error.code,
    );
  }
}

/**
 * Assert that an object has a property.
 */
function assertHasProperty(obj, property, message) {
  if (!(property in obj)) {
    throw new AssertionError(
      message || `Object missing property "${property}"`,
      property,
      Object.keys(obj),
    );
  }
}

/**
 * Assert that a value matches the expected type.
 */
function assertType(value, expectedType, message) {
  const actualType = Array.isArray(value) ? 'array' : typeof value;

  if (actualType !== expectedType) {
    throw new AssertionError(
      message || `Expected type "${expectedType}", got "${actualType}"`,
      expectedType,
      actualType,
    );
  }
}

/**
 * Assert a value is a valid ISO date string.
 */
function assertISODate(value, message) {
  if (typeof value !== 'string') {
    throw new AssertionError(
      message || 'Expected ISO date string, got non-string',
      'ISO date string',
      typeof value,
    );
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new AssertionError(
      message || `"${value}" is not a valid ISO date`,
      'valid ISO date',
      value,
    );
  }
}

/**
 * Assert a value is a valid UUID.
 */
function assertUUID(value, message) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (typeof value !== 'string' || !uuidRegex.test(value)) {
    throw new AssertionError(message || `"${value}" is not a valid UUID`, 'valid UUID', value);
  }
}

/**
 * Assert that an array is not empty.
 */
function assertNotEmpty(array, message) {
  if (!Array.isArray(array)) {
    throw new AssertionError(message || 'Expected array', 'array', typeof array);
  }

  if (array.length === 0) {
    throw new AssertionError(
      message || 'Expected non-empty array',
      'non-empty array',
      'empty array',
    );
  }
}

/**
 * Assert that a value is greater than another.
 */
function assertGreaterThan(actual, minimum, message) {
  if (actual <= minimum) {
    throw new AssertionError(
      message || `Expected value > ${minimum}, got ${actual}`,
      `> ${minimum}`,
      actual,
    );
  }
}

/**
 * Assert that a value is at least a minimum.
 */
function assertAtLeast(actual, minimum, message) {
  if (actual < minimum) {
    throw new AssertionError(
      message || `Expected value >= ${minimum}, got ${actual}`,
      `>= ${minimum}`,
      actual,
    );
  }
}

module.exports = {
  AssertionError,
  assert,
  assertEqual,
  assertOneOf,
  assertStatus,
  assertEnvelope,
  assertErrorEnvelope,
  assertHasProperty,
  assertType,
  assertISODate,
  assertUUID,
  assertNotEmpty,
  assertGreaterThan,
  assertAtLeast,
};
