import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // ArchUnitTS registers its `toPassAsync()` matcher on the global `expect` (src/architecture.test.ts).
    globals: true,
    // Evals (evals/*.eval.ts) start a real `claude` and cost money — only via `npm run eval:guard`.
    exclude: ['node_modules/**', 'evals/**'],
  },
})
