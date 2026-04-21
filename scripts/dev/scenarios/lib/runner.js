/**
 * Scenario Runner
 *
 * Executes scenarios sequentially and collects results.
 */

class ScenarioRunner {
  /**
   * @param {import('./context').TestContext} context - Test context
   * @param {Array<{ name: string, description: string, run: Function }>} scenarios - Scenarios to run
   */
  constructor(context, scenarios) {
    this.context = context;
    this.scenarios = scenarios;
    this.results = [];
  }

  /**
   * Run all scenarios sequentially.
   * @returns {Promise<Array<{ name: string, passed: boolean, duration: number, error?: string }>>}
   */
  async runAll() {
    for (const scenario of this.scenarios) {
      const result = await this.runOne(scenario);
      this.results.push(result);
    }

    return this.results;
  }

  /**
   * Run a single scenario.
   * @param {{ name: string, description: string, run: Function }} scenario
   * @returns {Promise<{ name: string, passed: boolean, duration: number, error?: string }>}
   */
  async runOne(scenario) {
    console.log(`📋 ${scenario.name}`);
    console.log(`   ${scenario.description}`);

    const startTime = Date.now();

    try {
      // Create a step logger for the scenario
      const steps = new StepLogger();

      // Run the scenario
      await scenario.run(this.context, steps);

      const duration = Date.now() - startTime;

      console.log(`   ✅ PASSED (${duration}ms)`);
      console.log('');

      return {
        name: scenario.name,
        passed: true,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      console.log(`   ❌ FAILED: ${error.message}`);
      if (process.env.DEBUG) {
        console.log(`      Stack: ${error.stack}`);
      }
      console.log('');

      return {
        name: scenario.name,
        passed: false,
        duration,
        error: error.message,
      };
    }
  }
}

/**
 * Step Logger
 *
 * Provides structured logging for scenario steps.
 */
class StepLogger {
  constructor() {
    this.stepCount = 0;
  }

  /**
   * Log a step with its result.
   *
   * @param {string} description - Step description
   * @param {boolean} [passed=true] - Whether step passed
   */
  log(description, passed = true) {
    this.stepCount++;
    const prefix = this.stepCount === 1 ? '├─' : '├─';
    const icon = passed ? '✓' : '✗';
    console.log(`   ${prefix} Step ${this.stepCount}: ${description} ${icon}`);
  }

  /**
   * Log a final step.
   *
   * @param {string} description - Step description
   * @param {boolean} [passed=true] - Whether step passed
   */
  logFinal(description, passed = true) {
    this.stepCount++;
    const icon = passed ? '✓' : '✗';
    console.log(`   └─ Step ${this.stepCount}: ${description} ${icon}`);
  }

  /**
   * Log an info message.
   *
   * @param {string} message - Info message
   */
  info(message) {
    console.log(`   ℹ ${message}`);
  }
}

module.exports = { ScenarioRunner, StepLogger };
