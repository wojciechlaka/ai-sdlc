import path from 'path'
import { describe, it, expect } from 'vitest'
import { projectFiles } from 'archunit'

// Architekturtest (ArchUnitTS) für packages/shared: die Verträge sind die unterste Schicht
// (`web → core → shared`) und hängen von keinem anderen Workspace-Paket ab. Pfade sind relativ zu
// packages/shared (Ort der tsconfig.json); Workspace-Pakete löst TypeScript über den Symlink zur echten
// Datei auf, `@refinement/core` landet also unter `../core/…`.

const TSCONFIG = path.resolve(__dirname, '../tsconfig.json')

describe('Architektur (packages/shared)', () => {
  it('shared hängt von keinem anderen Workspace-Paket ab', async () => {
    const rule = projectFiles(TSCONFIG)
      .inPath('src/**', { except: { withName: '*.test.ts' } })
      .shouldNot()
      .dependOnFiles()
      .inPath('../{core,../apps}/**')
    // Im Sollzustand gibt es keine Datei unter ../core oder ../../apps im Graphen — daher
    // allowEmptyTests. Damit die Regel nicht still leer läuft, muss es Quelldateien geben.
    await expect(rule).toPassAsync({ allowEmptyTests: true })
    await expect(projectFiles(TSCONFIG).inPath('src/**').should().beInPath('src/**')).toPassAsync()
  })
})
