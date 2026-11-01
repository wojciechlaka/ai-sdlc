import { describe, it, expect } from 'vitest'
import { ChoiceOutputSchema, PendingChoiceSchema, QuestionOutputSchema } from './agentOutput'

const OPTION_A = { id: 'A', title: 'Beim Speichern berechnen', description: 'Feld am Artikel.', pros: ['schnell'], cons: ['Migration'] }
const OPTION_B = { id: 'B', title: 'Beim Lesen berechnen', description: 'Im Service.', pros: ['keine Migration'], cons: [] }
const CHOICE = { type: 'choice', question: 'Wo wird die Lesezeit berechnet?', options: [OPTION_A, OPTION_B], recommended: 'B' }

describe('QuestionOutputSchema', () => {
  it('accepts a question and rejects one without text', () => {
    expect(QuestionOutputSchema.parse({ type: 'question', question: 'Wer?' })).toEqual({ type: 'question', question: 'Wer?' })
    expect(QuestionOutputSchema.safeParse({ type: 'question' }).success).toBe(false)
    expect(QuestionOutputSchema.safeParse({ type: 'question', question: '  \n ' }).success).toBe(false)
    const empty = QuestionOutputSchema.safeParse({ type: 'question', question: '' })
    expect(empty.success).toBe(false)
    expect(empty.error?.issues[0]?.message).toBe('darf nicht leer sein')
  })
})

describe('ChoiceOutputSchema', () => {
  it('accepts two or three options with a recommendation among them', () => {
    expect(ChoiceOutputSchema.parse(CHOICE)).toEqual(CHOICE)
    const three = { ...CHOICE, options: [OPTION_A, OPTION_B, { ...OPTION_B, id: 'C' }], recommended: 'C' }
    expect(ChoiceOutputSchema.safeParse(three).success).toBe(true)
  })

  it('rejects fewer than two or more than three options', () => {
    expect(ChoiceOutputSchema.safeParse({ ...CHOICE, options: [OPTION_A], recommended: 'A' }).success).toBe(false)
    const four = [OPTION_A, OPTION_B, { ...OPTION_B, id: 'C' }, { ...OPTION_B, id: 'C' }]
    expect(ChoiceOutputSchema.safeParse({ ...CHOICE, options: four }).success).toBe(false)
  })

  it('rejects duplicate ids and ids other than A, B, C', () => {
    const duplicate = ChoiceOutputSchema.safeParse({ ...CHOICE, options: [OPTION_A, { ...OPTION_B, id: 'A' }], recommended: 'A' })
    expect(duplicate.error?.issues.map((issue) => issue.message)).toEqual(['Die ids der Optionen müssen eindeutig sein'])
    expect(ChoiceOutputSchema.safeParse({ ...CHOICE, options: [OPTION_A, { ...OPTION_B, id: 'D' }] }).success).toBe(false)
  })

  it('rejects a recommendation that is not one of the options', () => {
    const result = ChoiceOutputSchema.safeParse({ ...CHOICE, recommended: 'C' })
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['recommended']])
  })
})

describe('PendingChoiceSchema', () => {
  it('is the choice without its type and checks the same rules', () => {
    const { type: _type, ...pending } = CHOICE
    expect(PendingChoiceSchema.parse(pending)).toEqual(pending)
    expect(PendingChoiceSchema.safeParse({ ...pending, recommended: 'C' }).success).toBe(false)
  })
})

describe('ChoiceOutputSchema — empty texts', () => {
  it('rejects an empty question, option title and option description with a German message', () => {
    const empties = [
      { ...CHOICE, question: '' },
      { ...CHOICE, question: '   ' },
      { ...CHOICE, options: [{ ...OPTION_A, title: '' }, OPTION_B] },
      { ...CHOICE, options: [{ ...OPTION_A, description: '' }, OPTION_B] },
      { ...CHOICE, options: [{ ...OPTION_A, title: ' \n' }, OPTION_B] },
      { ...CHOICE, options: [{ ...OPTION_A, description: '  ' }, OPTION_B] },
    ]
    for (const input of empties) {
      const result = ChoiceOutputSchema.safeParse(input)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toBe('darf nicht leer sein')
    }
  })
})
