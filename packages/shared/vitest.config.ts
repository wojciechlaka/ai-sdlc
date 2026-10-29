import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // ArchUnitTS registers its `toPassAsync()` matcher on the global `expect` (src/architecture.test.ts).
    globals: true,
    exclude: ['node_modules/**'],
  },
})
