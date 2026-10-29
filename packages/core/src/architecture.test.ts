import { readdirSync } from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { projectFiles } from 'archunit'

// Architecture tests (ArchUnitTS) for the hexagon in packages/core. The ESLint rule (eslint.config.mjs)
// gives fast feedback in the editor; these tests check the complete dependency rules.
//
// - Paths are relative to packages/core (location of tsconfig.json).
// - `toPassAsync()` attaches `archunit` to the global `expect` on import — hence `globals: true`
//   in vitest.config.ts.
// - ArchUnitTS evaluates `import` declarations (including `import type`), not `export … from` re-exports
//   and not dynamic `import()`.

const TSCONFIG = path.resolve(__dirname, '../tsconfig.json')

/** Production code: without *.test.ts. */
const PRODUCTION = { except: { withName: '*.test.ts' } }

/** Glob for files in the given folders under src/, or for src/compose.ts. */
function targets(...parts: string[]): string {
  const globs = parts.map((part) => (part === 'compose' ? 'compose.ts' : `${part}/**`))
  return globs.length === 1 ? `src/${globs[0]}` : `src/{${globs.join(',')}}`
}

/** Every folder under src/adapters/ — new adapters are covered automatically. */
const ADAPTERS = readdirSync(path.resolve(__dirname, 'adapters'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

function filesIn(folder: string) {
  return projectFiles(TSCONFIG).inFolder(`src/${folder}/**`, PRODUCTION)
}

/** Building the TypeScript program takes ~3 s alone; under load (dev server, parallel workers) it can exceed
 * Vitest's default of 5 s. A slow run is no architecture violation, so give these tests room. */
const ARCHITECTURE_TIMEOUT_MS = 60_000

describe('architecture (packages/core)', { timeout: ARCHITECTURE_TIMEOUT_MS }, () => {
  it('domain depends only on itself', async () => {
    const rule = filesIn('domain')
      .shouldNot()
      .dependOnFiles()
      .inPath(targets('ports', 'application', 'adapters', 'testing', 'compose'))
    await expect(rule).toPassAsync()
  })

  it('ports depend only on domain', async () => {
    const rule = filesIn('ports')
      .shouldNot()
      .dependOnFiles()
      .inPath(targets('application', 'adapters', 'testing', 'compose'))
    await expect(rule).toPassAsync()
  })

  it('application does not depend on adapters, testing or compose', async () => {
    const rule = filesIn('application')
      .shouldNot()
      .dependOnFiles()
      .inPath(targets('adapters', 'testing', 'compose'))
    await expect(rule).toPassAsync()
  })

  it.each(ADAPTERS)('adapter %s depends only on itself, domain and ports', async (adapter) => {
    const rule = filesIn(`adapters/${adapter}`)
      .shouldNot()
      .dependOnFiles()
      .inPath(targets('adapters', 'application', 'testing', 'compose'), {
        except: { inPath: `src/adapters/${adapter}/**` },
      })
    await expect(rule).toPassAsync()
  })

  it('no production code depends on src/testing', async () => {
    const rule = projectFiles(TSCONFIG)
      .inPath('src/**', { except: { withName: '*.test.ts', inPath: 'src/testing/**' } })
      .shouldNot()
      .dependOnFiles()
      .inPath(targets('testing'))
    await expect(rule).toPassAsync()
  })

  // hooks/ holds standalone Node scripts (guard/audit, spec §13): Claude Code starts them as processes,
  // the adapters only know their path (`hooksDir` from compose). They must not load anything from src and vice versa.
  it('the hook scripts are where the rules look for them', () => {
    // Otherwise the next two rules would be empty and therefore always green.
    const hooks = readdirSync(path.resolve(__dirname, '../hooks'))
    expect(hooks).toEqual(expect.arrayContaining(['guard.mjs', 'audit.mjs', 'guardPolicy.mjs', 'hookIo.mjs']))
  })

  it('the hook scripts do not depend on src', async () => {
    const rule = projectFiles(TSCONFIG)
      .inFolder('hooks/**', { except: { withName: '*.test.ts' } })
      .shouldNot()
      .dependOnFiles()
      .inPath('src/**')
    await expect(rule).toPassAsync()
  })

  it('no production code in src imports the hook scripts', async () => {
    const rule = projectFiles(TSCONFIG).inPath('src/**', PRODUCTION).shouldNot().dependOnFiles().inPath('hooks/**')
    await expect(rule).toPassAsync()
  })

  // evals/ starts real `claude` processes (npm run eval:guard) and may use src; src and hooks never use evals.
  it('the evals are where the rule looks for them', () => {
    expect(readdirSync(path.resolve(__dirname, '../evals'))).toContain('guard.eval.ts')
  })

  it('neither src nor the hook scripts import the evals', async () => {
    const rule = projectFiles(TSCONFIG).inPath('{src,hooks}/**').shouldNot().dependOnFiles().inPath('evals/**')
    await expect(rule).toPassAsync()
  })

  it('production code in src has no cycles', async () => {
    const rule = projectFiles(TSCONFIG).inPath('src/**', PRODUCTION).should().haveNoCycles()
    await expect(rule).toPassAsync()
  })
})
