// @vitest-environment node
import path from 'path'
import { describe, it, expect } from 'vitest'
import { projectFiles, type FileInfo } from 'archunit'

// Architecture test (ArchUnitTS) for apps/web; the hexagon rules live in
// packages/core/src/architecture.test.ts.
//
// Paths are relative to apps/web (location of tsconfig.json). TypeScript resolves `@refinement/core` via the
// workspace symlink to the real file; every import into core — via the package name, a deep path
// (`@refinement/core/src/…`) or a relative path (`../../packages/core/…`) — therefore ends up as a
// dependency on `../../packages/core/…`. Only the package entry src/index.ts is allowed.
// A relative import of exactly that file cannot be told apart from the package name in the dependency
// graph; a second rule therefore checks the import specifiers in the source text.

const TSCONFIG = path.resolve(__dirname, 'tsconfig.json')

/** Own files of apps/web: nothing outside (`../`), no dependencies, no build output, no tests. */
const WEB_SOURCES = /^(?!\.\.\/|node_modules\/|\.next\/)/
const NO_TESTS = { except: { withName: '*.test.{ts,tsx}' } }

/** Module specifiers of `import … from`, `export … from`, `import '…'` and `import('…')`. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g

/** No import into core that bypasses `@refinement/core` (deep package path or relative path). */
function importsCoreOnlyViaPackage(file: FileInfo): boolean {
  return [...file.content.matchAll(SPECIFIER)].every(([, specifier]) =>
    !specifier.startsWith('@refinement/core/') && !/^\.{1,2}\/.*packages\/core(\/|$)/.test(specifier))
}

/** Building the TypeScript program takes ~3 s alone; under load (dev server, parallel workers) it can exceed
 * Vitest's default of 5 s. A slow run is no architecture violation, so give these tests room. */
const ARCHITECTURE_TIMEOUT_MS = 60_000

describe('architecture (apps/web)', { timeout: ARCHITECTURE_TIMEOUT_MS }, () => {
  it('web imports core only via the package entry @refinement/core', async () => {
    const rule = projectFiles(TSCONFIG)
      .inPath(WEB_SOURCES, NO_TESTS)
      .shouldNot()
      .dependOnFiles()
      .inPath('../../packages/core/**', { except: { inPath: '../../packages/core/src/index.ts' } })
    await expect(rule).toPassAsync()

    const specifiers = projectFiles(TSCONFIG)
      .inPath(WEB_SOURCES, NO_TESTS)
      .should()
      .adhereTo(importsCoreOnlyViaPackage, 'import core only via @refinement/core, not via deep or relative paths')
    await expect(specifiers).toPassAsync()
  }, 30_000) // parses the whole TS project; > 5 s default when the machine is busy
})
