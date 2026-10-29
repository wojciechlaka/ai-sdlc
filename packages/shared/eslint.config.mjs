import tseslint from 'typescript-eslint'
import stylistic from '@stylistic/eslint-plugin'
import { defineConfig } from 'eslint/config'

// Code style for production code: control flow (if/else/for/while/do) always with braces and its body on its own
// line. Tests are exempt.
export default defineConfig([
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@stylistic': stylistic },
    rules: {
      curly: ['error', 'all'],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],
    },
  },
])
