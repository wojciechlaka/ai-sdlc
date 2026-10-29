import path from 'path'
import { describe, it, expect } from 'vitest'
import { projectFiles } from 'archunit'

// Architecture test (ArchUnitTS) for packages/shared: the contracts are the lowest layer
// (`web → core → shared`) and depend on no other workspace package. Paths are relative to
// packages/shared (location of tsconfig.json); TypeScript resolves workspace packages via the symlink to the
// real file, so `@refinement/core` ends up under `../core/…`.

const TSCONFIG = path.resolve(__dirname, '../tsconfig.json')

/** Building the TypeScript program takes ~3 s alone; under load (dev server, parallel workers) it can exceed
 * Vitest's default of 5 s. A slow run is no architecture violation, so give these tests room. */
const ARCHITECTURE_TIMEOUT_MS = 60_000

describe('architecture (packages/shared)', { timeout: ARCHITECTURE_TIMEOUT_MS }, () => {
  it('shared depends on no other workspace package', async () => {
    const rule = projectFiles(TSCONFIG)
      .inPath('src/**', { except: { withName: '*.test.ts' } })
      .shouldNot()
      .dependOnFiles()
      .inPath('../{core,../apps}/**')
    // In the intended state there is no file under ../core or ../../apps in the graph — hence
    // allowEmptyTests. So the rule cannot silently run empty, there must be source files.
    await expect(rule).toPassAsync({ allowEmptyTests: true })
    await expect(projectFiles(TSCONFIG).inPath('src/**').should().beInPath('src/**')).toPassAsync()
  })
})
