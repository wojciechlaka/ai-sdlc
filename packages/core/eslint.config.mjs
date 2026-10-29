import tseslint from 'typescript-eslint'
import stylistic from '@stylistic/eslint-plugin'
import { defineConfig } from 'eslint/config'

// Main job: keep the hexagon clean. Domain, ports and use cases must not reach adapters or I/O.
// Second job: the hook scripts in hooks/ (plain Node ESM, run by Claude Code as separate processes).
// Third: the evals in evals/ (run with tsx, may import src — src never imports them, see the architecture tests).
// Fourth: code style for production code — control flow (if/else/for/while/do) always with braces and its body on
// its own line. Tests and the test doubles in src/testing are exempt.
// Fast editor feedback only — the wider dependency rules (layers, adapters among each other, src/testing,
// cycles, web → core entry point) are covered by the ArchUnitTS architecture tests (src/architecture.test.ts).
export default defineConfig([
  {
    files: ['src/domain/**/*.ts', 'src/ports/**/*.ts', 'src/application/**/*.ts'],
    ignores: ['**/*.test.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/adapters', '**/adapters/**', '**/compose'],
            message: 'Hexagonal: Domäne, Ports und Use Cases dürfen keine Adapter importieren.',
          },
          {
            group: ['better-sqlite3', 'drizzle-orm', 'drizzle-orm/*', 'child_process', 'fs', 'fs/promises', 'events', 'node:*', '@octokit/*', 'path', 'os', 'crypto'],
            message: 'Hexagonal: I/O gehört in einen Adapter hinter einem Port.',
          },
        ],
      }],
    },
  },
  {
    files: ['hooks/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { process: 'readonly', Buffer: 'readonly', console: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: '^(?!node:|\\./[A-Za-z]+\\.mjs$)',
          message: 'Hook-Skripte laden nur node:-Module und Nachbarskripte aus hooks/ (kein src, keine Pakete).',
        }],
      }],
    },
  },
  {
    files: ['evals/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
  },
  {
    files: ['src/**/*.ts', 'hooks/**/*.mjs', 'evals/**/*.ts'],
    ignores: ['**/*.test.ts', 'src/testing/**'],
    plugins: { '@stylistic': stylistic },
    rules: {
      curly: ['error', 'all'],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],
    },
  },
])
