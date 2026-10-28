import { readdirSync } from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { projectFiles } from 'archunit'

// Architekturtests mit ArchUnitTS für den Hexagon in packages/core. Die ESLint-Regel (eslint.config.mjs)
// gibt schnelles Feedback im Editor; diese Tests prüfen die vollständigen Abhängigkeitsregeln.
//
// - Pfade sind relativ zu packages/core (Ort der tsconfig.json).
// - `toPassAsync()` hängt `archunit` beim Import an das globale `expect` — daher `globals: true`
//   in vitest.config.ts.
// - ArchUnitTS wertet `import`-Deklarationen aus (auch `import type`), keine `export … from`-Re-Exporte
//   und keine dynamischen `import()`.

const TSCONFIG = path.resolve(__dirname, '../tsconfig.json')

/** Produktivcode: ohne *.test.ts. */
const PRODUCTION = { except: { withName: '*.test.ts' } }

/** Glob für Dateien in den genannten Ordnern unter src/ bzw. für src/compose.ts. */
function targets(...parts: string[]): string {
  const globs = parts.map((part) => (part === 'compose' ? 'compose.ts' : `${part}/**`))
  return globs.length === 1 ? `src/${globs[0]}` : `src/{${globs.join(',')}}`
}

/** Jeder Ordner unter src/adapters/ — neue Adapter sind automatisch abgedeckt. */
const ADAPTERS = readdirSync(path.resolve(__dirname, 'adapters'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

function filesIn(folder: string) {
  return projectFiles(TSCONFIG).inFolder(`src/${folder}/**`, PRODUCTION)
}

describe('Architektur (packages/core)', () => {
  it('domain hängt nur von sich selbst ab', async () => {
    const rule = filesIn('domain')
      .shouldNot()
      .dependOnFiles()
      .inPath(targets('ports', 'application', 'adapters', 'testing', 'compose'))
    await expect(rule).toPassAsync()
  })

  it('ports hängen nur von domain ab', async () => {
    const rule = filesIn('ports')
      .shouldNot()
      .dependOnFiles()
      .inPath(targets('application', 'adapters', 'testing', 'compose'))
    await expect(rule).toPassAsync()
  })

  it('application hängt nicht von adapters, testing oder compose ab', async () => {
    const rule = filesIn('application')
      .shouldNot()
      .dependOnFiles()
      .inPath(targets('adapters', 'testing', 'compose'))
    await expect(rule).toPassAsync()
  })

  it.each(ADAPTERS)('Adapter %s hängt nur von sich selbst, domain und ports ab', async (adapter) => {
    const rule = filesIn(`adapters/${adapter}`)
      .shouldNot()
      .dependOnFiles()
      .inPath(targets('adapters', 'application', 'testing', 'compose'), {
        except: { inPath: `src/adapters/${adapter}/**` },
      })
    await expect(rule).toPassAsync()
  })

  it('kein Produktivcode hängt von src/testing ab', async () => {
    const rule = projectFiles(TSCONFIG)
      .inPath('src/**', { except: { withName: '*.test.ts', inPath: 'src/testing/**' } })
      .shouldNot()
      .dependOnFiles()
      .inPath(targets('testing'))
    await expect(rule).toPassAsync()
  })

  // hooks/ enthält eigenständige Node-Skripte (Guard/Audit, spec §13): Claude Code startet sie als Prozess,
  // die Adapter kennen nur ihren Pfad (`hooksDir` aus compose). Sie dürfen nichts aus src laden und umgekehrt.
  it('die Hook-Skripte liegen dort, wo die Regeln sie suchen', () => {
    // Sonst würden die beiden folgenden Regeln leer und damit immer grün.
    const hooks = readdirSync(path.resolve(__dirname, '../hooks'))
    expect(hooks).toEqual(expect.arrayContaining(['guard.mjs', 'audit.mjs', 'guardPolicy.mjs', 'hookIo.mjs']))
  })

  it('die Hook-Skripte hängen nicht von src ab', async () => {
    const rule = projectFiles(TSCONFIG)
      .inFolder('hooks/**', { except: { withName: '*.test.ts' } })
      .shouldNot()
      .dependOnFiles()
      .inPath('src/**')
    await expect(rule).toPassAsync()
  })

  it('kein Produktivcode in src importiert die Hook-Skripte', async () => {
    const rule = projectFiles(TSCONFIG).inPath('src/**', PRODUCTION).shouldNot().dependOnFiles().inPath('hooks/**')
    await expect(rule).toPassAsync()
  })

  // evals/ startet echte `claude`-Prozesse (npm run eval:guard) und darf src nutzen; src und hooks nie evals.
  it('die Evals liegen dort, wo die Regel sie sucht', () => {
    expect(readdirSync(path.resolve(__dirname, '../evals'))).toContain('guard.eval.ts')
  })

  it('weder src noch die Hook-Skripte importieren die Evals', async () => {
    const rule = projectFiles(TSCONFIG).inPath('{src,hooks}/**').shouldNot().dependOnFiles().inPath('evals/**')
    await expect(rule).toPassAsync()
  })

  it('der Produktivcode in src ist frei von Zyklen', async () => {
    const rule = projectFiles(TSCONFIG).inPath('src/**', PRODUCTION).should().haveNoCycles()
    await expect(rule).toPassAsync()
  })
})
