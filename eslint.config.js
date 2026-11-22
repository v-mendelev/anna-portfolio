// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'dist/',
      '.astro/',
      'node_modules/',
      'playwright-report/',
      'test-results/',
      'coverage/',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  ...astro.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Logging personal data is forbidden (see CLAUDE.md); console.* needs an explicit opt-out.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
