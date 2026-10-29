import { describe, it, expect } from 'vitest'
import type { AuditEventType } from '../ports'
import { createTestContext, seedTicket } from '../testing/fakes'
import { record } from './auditTrail'

describe('record', () => {
  it('appends the entry to the ticket log', () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-1')
    record(ctx.deps, 'CB-1', 'human', 'pr_merged', { prNumber: 3 })
    expect(ctx.deps.audit.listForTicket('CB-1').at(-1)).toMatchObject({ actor: 'human', type: 'pr_merged', payload: { prNumber: 3 } })
  })

  // Type tests: checked by `tsc --noEmit` (npm run build); the calls never run.
  it('rejects payloads that do not belong to the type at compile time', () => {
    const ctx = createTestContext()
    const compileOnly = () => {
      // @ts-expect-error — `pr_merged` needs a prNumber, not a message
      record(ctx.deps, 'CB-1', 'system', 'pr_merged', { message: 'x' })

      const type = 'error' as 'pr_merged' | 'error'
      // @ts-expect-error — a union type would accept the payload of either member
      record(ctx.deps, 'CB-1', 'system', type, { prNumber: 1 })

      // @ts-expect-error — same for an explicit union type argument
      ctx.deps.audit.append<'pr_merged' | 'error'>({ ticketKey: 'CB-1', actor: 'system', type: 'error', payload: { prNumber: 1 } })

      const anyType = 'error' as AuditEventType
      // @ts-expect-error — the full union is rejected as well
      record(ctx.deps, 'CB-1', 'system', anyType, { message: 'x' })
    }
    expect(compileOnly).toBeTypeOf('function')
  })
})
