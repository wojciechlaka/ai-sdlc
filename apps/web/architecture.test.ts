// @vitest-environment node
import path from 'path'
import { describe, it, expect } from 'vitest'
import { projectFiles, type FileInfo } from 'archunit'

// Architekturtest (ArchUnitTS) für apps/web; die Regeln für den Hexagon liegen in
// packages/core/src/architecture.test.ts.
//
// Pfade sind relativ zu apps/web (Ort der tsconfig.json). TypeScript löst `@refinement/core` über den
// Workspace-Symlink zur echten Datei auf; jeder Import in den Core — ob über den Paketnamen, einen
// tiefen Pfad (`@refinement/core/src/…`) oder relativ (`../../packages/core/…`) — endet daher als
// Abhängigkeit auf `../../packages/core/…`. Erlaubt ist nur der Paket-Einstieg src/index.ts.
// Ein relativer Import genau dieser Datei ist im Abhängigkeitsgraphen nicht vom Paketnamen zu
// unterscheiden; dafür prüft eine zweite, eigene Regel die Import-Pfade im Quelltext.

const TSCONFIG = path.resolve(__dirname, 'tsconfig.json')

/** Eigene Dateien von apps/web: nichts außerhalb (`../`), keine Abhängigkeiten, kein Build, keine Tests. */
const WEB_SOURCES = /^(?!\.\.\/|node_modules\/|\.next\/)/
const NO_TESTS = { except: { withName: '*.test.{ts,tsx}' } }

/** Modulpfade aus `import … from`, `export … from`, `import '…'` und `import('…')`. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g

/** Kein Import in den Core an `@refinement/core` vorbei (tiefer Paketpfad oder relativer Pfad). */
function importsCoreOnlyViaPackage(file: FileInfo): boolean {
  return [...file.content.matchAll(SPECIFIER)].every(([, specifier]) =>
    !specifier.startsWith('@refinement/core/') && !/^\.{1,2}\/.*packages\/core(\/|$)/.test(specifier))
}

describe('Architektur (apps/web)', () => {
  it('web importiert den Core nur über den Paket-Einstieg @refinement/core', async () => {
    const rule = projectFiles(TSCONFIG)
      .inPath(WEB_SOURCES, NO_TESTS)
      .shouldNot()
      .dependOnFiles()
      .inPath('../../packages/core/**', { except: { inPath: '../../packages/core/src/index.ts' } })
    await expect(rule).toPassAsync()

    const specifiers = projectFiles(TSCONFIG)
      .inPath(WEB_SOURCES, NO_TESTS)
      .should()
      .adhereTo(importsCoreOnlyViaPackage, 'Core nur über @refinement/core importieren, nicht über tiefe oder relative Pfade')
    await expect(specifiers).toPassAsync()
  })
})
