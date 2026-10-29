import { describe, it, expect } from 'vitest'
import type { AuditEventDto } from '@refinement/shared'
import { describeLogEvent, formatCost, formatTokens, groupLogEntries, runCostUsd } from './logFormat'

const at = new Date('2026-10-28T10:00:00Z')
const event = (type: string, payload: unknown, actor: AuditEventDto['actor'] = 'system'): AuditEventDto => ({ actor, type, payload, createdAt: at })

describe('describeLogEvent', () => {
  it.each([
    [event('ticket_imported', { sourcePath: 'examples/tickets/cb-2-lesezeit.md' }), 'Ticket übernommen aus examples/tickets/cb-2-lesezeit.md'],
    [event('run_started', { stage: 'plan', trigger: 'initial', model: 'claude-sonnet-4-6' }), 'Agent gestartet (1 Plan, Sonnet 4.6)'],
    [event('run_started', { stage: 'plan', trigger: 'answer', model: 'x' }), 'Agent gestartet (1 Plan, x, mit Antwort)'],
    [event('run_finished', { status: 'failed' }), 'Agent-Lauf fehlgeschlagen'],
    [event('run_finished', { status: 'timeout' }), 'Agent-Zeitlimit überschritten'],
    [event('question_asked', { question: 'Wer?' }, 'agent'), 'Rückfrage: Wer?'],
    [event('answer_given', { answer: 'Alle' }, 'human'), 'Antwort: Alle'],
    [event('pr_opened', { prNumber: 4, branch: 'CB-2/intent' }), 'PR #4 geöffnet (CB-2/intent)'],
    [event('pr_merged', { prNumber: 4 }, 'human'), 'PR #4 gemergt'],
    [event('pr_closed', { prNumber: 4 }, 'human'), 'PR #4 ohne Merge geschlossen'],
    [event('stage_changed', { from: 'plan', to: 'design' }), 'Stufe 1 Plan → 2 Design'],
    [event('cleanup', { prNumber: 4, branch: 'CB-2/intent' }), 'Beim Start aufgeräumt: PR #4 geschlossen, Branch CB-2/intent gelöscht'],
    [event('error', { message: 'Rechte fehlen' }), 'Fehler: Rechte fehlen'],
    [event('guard_blocked', { tool: 'Bash', target: 'rm -rf docs', reason: 'Befehl rm ist nicht erlaubt (nur lesende Befehle)' }),
      'Blockiert: Bash `rm -rf docs` — Befehl rm ist nicht erlaubt (nur lesende Befehle)'],
    [event('guard_blocked', { tool: 'Write', target: 'src/app.ts', reason: 'Werkzeug Write ist nicht erlaubt' }), 'Blockiert: Write src/app.ts — Werkzeug Write ist nicht erlaubt'],
    [event('guard_blocked', { tool: 'Write', target: 'src/app.ts' }), 'Blockiert: Write src/app.ts'],
    [event('tool_used', { tool: 'Bash', target: 'git log -5' }, 'agent'), 'Bash `git log -5`'],
    [event('tool_used', { tool: 'Read', target: 'src/app.ts' }, 'agent'), 'Read src/app.ts'],
    [event('something_new', null), 'something_new'],
  ])('describes %#', (input, text) => {
    expect(describeLogEvent(input)).toBe(text)
  })

  it('names the reason and keeps the usage of a discarded run', () => {
    expect(describeLogEvent(event('run_finished', {
      status: 'failed', reason: 'verworfen', inputTokens: 1000, cacheCreationTokens: 0, outputTokens: 500, costUsd: 0.1,
    }))).toBe('Agent-Lauf fehlgeschlagen (verworfen) · 1K↑ 500↓ · $0.10')
  })

  it('summarises a finished run with duration, tokens and cost', () => {
    expect(describeLogEvent(event('run_finished', {
      status: 'succeeded', model: 'claude-sonnet-4-6', durationSeconds: 75, costUsd: 0.0421,
      inputTokens: 1200, cacheCreationTokens: 300, cacheReadTokens: 0, outputTokens: 640,
    }, 'agent'))).toBe('Agent fertig in 1m 15s · 1.5K↑ 640↓ · $0.04')
  })
})

describe('groupLogEntries', () => {
  it('groups consecutive tool calls, blocked calls stay single', () => {
    const log = [
      event('run_started', {}),
      event('tool_used', { tool: 'Read', target: 'a' }, 'agent'),
      event('tool_used', { tool: 'Read', target: 'b' }, 'agent'),
      event('guard_blocked', { tool: 'Bash', target: 'rm x' }),
      event('tool_used', { tool: 'Read', target: 'c' }, 'agent'),
      event('run_finished', { status: 'succeeded' }),
    ]
    expect(groupLogEntries(log)).toEqual([
      { kind: 'event', event: log[0] },
      { kind: 'tools', events: [log[1], log[2]] },
      { kind: 'event', event: log[3] },
      { kind: 'tools', events: [log[4]] },
      { kind: 'event', event: log[5] },
    ])
  })
})

describe('cost and tokens', () => {
  it('formats token counts', () => {
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1500)).toBe('1.5K')
    expect(formatTokens(2000)).toBe('2K')
  })

  it('uses the reported cost and estimates it otherwise', () => {
    expect(runCostUsd({ costUsd: 0.5 })).toBe(0.5)
    expect(runCostUsd({ costUsd: 0, model: 'claude-sonnet-4-6', inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(3)
    expect(runCostUsd({ costUsd: 0, model: 'unknown' })).toBe(0)
  })

  it('formats costs', () => {
    expect(formatCost(0)).toBe('—')
    expect(formatCost(0.0005)).toBe('$0.000500')
    expect(formatCost(0.005)).toBe('$0.0050')
    expect(formatCost(1.234)).toBe('$1.23')
  })
})
