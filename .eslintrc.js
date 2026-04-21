module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist', 'node_modules'],
  rules: {
    // ---------------------------------------------------------
    // INVARIANTS (KEEP) - Enforced Errors
    // These block compilation to prevent bugs, security issues,
    // and silent type bypasses.
    // ---------------------------------------------------------
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    'no-var': 'error',

    // Contract: Prevent silent type system bypasses (critical for agents/nest)
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',

    // ---------------------------------------------------------
    // TIER-0 ENFORCEMENT — Boundary Safety (Agent Hardening)
    // ---------------------------------------------------------
    'no-restricted-syntax': [
      'error',

      // ❌ Block `as unknown` — correct AST selector
      {
        selector: "TSAsExpression[typeAnnotation.type='TSUnknownKeyword']",
        message:
          "🛑 TIER-0 VIOLATION: Casting to 'unknown' is forbidden as a laundering step. Use explicit narrowing or a validated helper.",
      },

      // ❌ Block `as Prisma.InputJsonValue`
      {
        selector:
          "TSAsExpression[typeAnnotation.typeName.qualifier.name='Prisma'][typeAnnotation.typeName.name='InputJsonValue']",
        message:
          '🛑 TIER-0 VIOLATION: Direct casting to Prisma.InputJsonValue is unsafe. Use a JSON-normalization helper at the persistence boundary.',
      },

      // ❌ Block `as InputJsonValue` (imported form)
      {
        selector: "TSAsExpression[typeAnnotation.typeName.name='InputJsonValue']",
        message:
          '🛑 TIER-0 VIOLATION: Direct casting to InputJsonValue is unsafe. Use a helper function that ensures JSON validity.',
      },
    ],

    // ---------------------------------------------------------
    // WARNINGS (DOWNGRADE) - Noise Reduction
    // Useful signal, but shouldn't block local dev or CI
    // ---------------------------------------------------------
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

    // ---------------------------------------------------------
    // DISABLED (REMOVE) - Friction reduction
    // Style, preference, or "technically safer" but annoying
    // ---------------------------------------------------------
    'no-console': 'off',
    'prefer-const': 'off',
    'no-return-await': 'off',
    '@typescript-eslint/return-await': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
    '@typescript-eslint/prefer-optional-chain': 'off',
    '@typescript-eslint/strict-boolean-expressions': 'off',
  },
  overrides: [
    {
      files: ['test-archiver.js', 'src/modules/internal-admin/view/app.js'],
      parserOptions: {
        project: null,
      },
      rules: {
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/await-thenable': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        'no-restricted-syntax': 'off',
        '@typescript-eslint/no-base-to-string': 'off',
        '@typescript-eslint/restrict-plus-operands': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
        '@typescript-eslint/no-duplicate-type-constituents': 'off',
        '@typescript-eslint/no-implied-eval': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/require-await': 'off',
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      },
    },
    {
      files: ['scripts/**/*.js', 'scripts/**/*.ts'],
      parserOptions: {
        project: 'tsconfig.scripts.json',
      },
    },
    {
      // 🟢 TIER 3: DEV SCRIPTS (Pragmatic Relaxations)
      // Strictly isolated to scripts/dev/ to prevent bleed-over.
      files: ['scripts/dev/**/*.{js,ts}'],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/require-await': 'off',
      },
    },
    {
      files: ['examples/**/*.js', 'examples/**/*.ts'],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/require-await': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
};
