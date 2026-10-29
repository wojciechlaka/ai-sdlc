import { describe, it, expect } from 'vitest'
import { StageOutputSchema } from './stageOutput'

describe('StageOutputSchema', () => {
  it('accepts the outputs of both stages', () => {
    const intent = { title: 'T', problem: 'P', desiredOutcome: 'O', successCriteria: ['K'], affected: [], openPoints: [] }
    expect(StageOutputSchema.parse({ type: 'question', question: 'Wer?' }).type).toBe('question')
    expect(StageOutputSchema.parse({ type: 'intent', result: intent }).type).toBe('intent')
    const choice = {
      type: 'choice', question: 'Wo?', recommended: 'B',
      options: [{ id: 'A', title: 'a', description: 'd', pros: [], cons: [] }, { id: 'B', title: 'b', description: 'd', pros: [], cons: [] }],
    }
    expect(StageOutputSchema.parse(choice).type).toBe('choice')
    const spec = {
      title: 'T', goal: 'G',
      approach: { chosen: 'C', rationale: 'R', alternatives: [{ name: 'N', reason: 'R' }] },
      components: [{ name: 'c', purpose: 'p', interface: 'i', dependsOn: [] }],
      dataFlow: 'D', errorHandling: 'E', acceptanceCriteria: ['K'], tests: 'T',
      affectedFiles: [{ path: 'a.js', change: 'c', isNew: false }],
      risks: [{ description: 'D', severity: 'low', mitigation: 'M' }], openPoints: [],
    }
    expect(StageOutputSchema.parse({ type: 'spec', result: spec }).type).toBe('spec')
  })

  it('rejects unknown output types', () => {
    expect(StageOutputSchema.safeParse({ type: 'refinement', result: {} }).success).toBe(false)
  })
})
