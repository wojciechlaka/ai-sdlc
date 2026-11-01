import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // ArchUnitTS registers its `toPassAsync()` matcher on the global `expect` (src/architecture.test.ts).
    globals: true,
    // Evals (evals/*.eval.ts) start a real `claude` and cost money — only via `npm run eval:guard` / `eval:spec`.
    // Their pure helpers (e.g. evals/specRubric.test.ts) run with `npm test`; the fixture repos are data, not tests.
    exclude: ['node_modules/**', 'evals/**/*.eval.ts', 'evals/fixtures/**'],
  },
})
