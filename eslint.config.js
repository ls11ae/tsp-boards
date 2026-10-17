import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'dist-e2e', 'coverage', 'data', 'public/data', 'docs/experiments']),
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/workers/**/*.ts'],
    languageOptions: { globals: globals.worker },
  },
  {
    files: ['cli/**/*.ts', 'scripts/**/*.ts', 'e2e/**/*.ts', '*.config.ts', '**/*.test.{ts,tsx}'],
    languageOptions: { globals: globals.node },
  },
  {
    // The core must run unchanged in browsers, workers and Node, and must be deterministic
    // given its inputs (seeded RNG, no wall clock). Tests are exempt.
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['react', 'react-dom', 'highs'].map((name) => ({
            name,
            message: 'src/core must not depend on UI frameworks or load solvers itself.',
          })),
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'os', 'url', 'child_process', 'worker_threads'],
              message: 'src/core must not use Node built-ins.',
            },
            {
              group: [
                '**/ui',
                '**/ui/**',
                '**/workers',
                '**/workers/**',
                '**/cli/**',
                '**/scripts/**',
              ],
              message: 'src/core must not depend on ui, workers, cli or scripts.',
            },
            {
              group: ['react/*', 'react-dom/*', 'highs/*'],
              message: 'src/core must not depend on UI frameworks or load solvers itself.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'self',
        'navigator',
        'localStorage',
        'performance',
        'console',
        'process',
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG.' },
        {
          object: 'Date',
          property: 'now',
          message: 'The core must not depend on wall-clock time.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'The core must not depend on wall-clock time.',
        },
      ],
    },
  },
  prettier,
]);
