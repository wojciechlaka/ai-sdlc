import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

// Only one job: keep the hexagon clean. Domain, ports and use cases must not reach adapters or I/O.
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
])
