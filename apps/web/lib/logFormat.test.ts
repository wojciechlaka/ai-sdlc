import { describe, it, expect } from 'vitest'
import { anAuditEvent } from '@/test/fixtures'
import { describeLogEvent, formatCost, formatTokens, groupLogEntries, runCostUsd } from './logFormat'

describe('describeLogEvent', () => {
  it.each([
    { input: anAuditEvent('ticket_imported', { sourcePath: 'examples/tickets/cb-2-lesezeit.md' }), text: 'Ticket übernommen aus examples/tickets/cb-2-lesezeit.md' },
    { input: anAuditEvent('run_started', { stage: 'plan', trigger: 'initial', model: 'claude-sonnet-4-6' }), text: 'Agent gestartet (1 Plan, Sonnet 4.6)' },
    { input: anAuditEvent('run_started', { stage: 'plan', trigger: 'answer', model: 'x' }), text: 'Agent gestartet (1 Plan, x, mit Antwort)' },
    { input: anAuditEvent('run_finished', { status: 'failed' }), text: 'Agent-Lauf fehlgeschlagen' },
    { input: anAuditEvent('run_finished', { status: 'timeout' }), text: 'Agent-Zeitlimit überschritten' },
    { input: anAuditEvent('question_asked', { question: 'Wer?' }, 'agent'), text: 'Rückfrage: Wer?' },
    { input: anAuditEvent('answer_given', { answer: 'Alle' }, 'human'), text: 'Antwort: Alle' },
    { input: anAuditEvent('pr_opened', { prNumber: 4, branch: 'CB-2/intent' }), text: 'PR #4 geöffnet (CB-2/intent)' },
    { input: anAuditEvent('pr_merged', { prNumber: 4 }, 'human'), text: 'PR #4 gemergt' },
    { input: anAuditEvent('pr_closed', { prNumber: 4 }, 'human'), text: 'PR #4 ohne Merge geschlossen' },
    { input: anAuditEvent('stage_changed', { from: 'plan', to: 'design' }), text: 'Stufe 1 Plan → 2 Design' },
    { input: anAuditEvent('cleanup', { prNumber: 4, branch: 'CB-2/intent' }), text: 'Beim Start aufgeräumt: PR #4 geschlossen, Branch CB-2/intent gelöscht' },
    { input: anAuditEvent('error', { message: 'Rechte fehlen' }), text: 'Fehler: Rechte fehlen' },
    { input: anAuditEvent('guard_blocked', { tool: 'Bash', target: 'rm -rf docs', reason: 'Befehl rm ist nicht erlaubt (nur lesende Befehle)' }), text: 'Blockiert: Bash `rm -rf docs` — Befehl rm ist nicht erlaubt (nur lesende Befehle)' },
    { input: anAuditEvent('guard_blocked', { tool: 'Write', target: 'src/app.ts', reason: 'Werkzeug Write ist nicht erlaubt' }), text: 'Blockiert: Write src/app.ts — Werkzeug Write ist nicht erlaubt' },
    { input: anAuditEvent('guard_blocked', { tool: 'Write', target: 'src/app.ts' }), text: 'Blockiert: Write src/app.ts' },
    { input: anAuditEvent('tool_used', { tool: 'Bash', target: 'git log -5' }, 'agent'), text: 'Bash `git log -5`' },
    { input: anAuditEvent('tool_used', { tool: 'Read', target: 'src/app.ts' }, 'agent'), text: 'Read src/app.ts' },
    { input: anAuditEvent('something_new', null), text: 'something_new' },
  ])('describes $input.type as $text', ({ input, text }) => {
    expect(describeLogEvent(input)).toBe(text)
  })

  it('names the reason and keeps the usage of a discarded run', () => {
    expect(describeLogEvent(anAuditEvent('run_finished', {
      status: 'failed', reason: 'verworfen', inputTokens: 1000, cacheCreationTokens: 0, outputTokens: 500, costUsd: 0.1,
    }))).toBe('Agent-Lauf fehlgeschlagen (verworfen) · 1K↑ 500↓ · $0.10')
  })

  it('summarises a finished run with duration, tokens and cost', () => {
    expect(describeLogEvent(anAuditEvent('run_finished', {
      status: 'succeeded', model: 'claude-sonnet-4-6', durationSeconds: 75, costUsd: 0.0421,
      inputTokens: 1200, cacheCreationTokens: 300, cacheReadTokens: 0, outputTokens: 640,
    }, 'agent'))).toBe('Agent fertig in 1m 15s · 1.5K↑ 640↓ · $0.04')
  })
})

describe('groupLogEntries', () => {
  it('groups consecutive tool calls, blocked calls stay single', () => {
    const log = [
      anAuditEvent('run_started', {}),
      anAuditEvent('tool_used', { tool: 'Read', target: 'a' }, 'agent'),
      anAuditEvent('tool_used', { tool: 'Read', target: 'b' }, 'agent'),
      anAuditEvent('guard_blocked', { tool: 'Bash', target: 'rm x' }),
      anAuditEvent('tool_used', { tool: 'Read', target: 'c' }, 'agent'),
      anAuditEvent('run_finished', { status: 'succeeded' }),
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
