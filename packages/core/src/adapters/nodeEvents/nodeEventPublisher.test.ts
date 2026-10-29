import { describe, it, expect, vi } from 'vitest'
import { createNodeEventPublisher } from './nodeEventPublisher'

describe('createNodeEventPublisher', () => {
  it('delivers events only to subscribers of the same ticket', () => {
    const bus = createNodeEventPublisher()
    const t1 = vi.fn()
    const t2 = vi.fn()
    bus.subscribe('T-1', t1)
    bus.subscribe('T-2', t2)

    bus.publish({ type: 'progress', ticketId: 'T-1', message: 'hi' })

    expect(t1).toHaveBeenCalledWith({ type: 'progress', ticketId: 'T-1', message: 'hi' })
    expect(t2).not.toHaveBeenCalled()
  })

  it('supports several subscribers per ticket', () => {
    const bus = createNodeEventPublisher()
    const a = vi.fn()
    const b = vi.fn()
    bus.subscribe('T-1', a)
    bus.subscribe('T-1', b)

    bus.publish({ type: 'status', ticketId: 'T-1', status: 'review' })

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('stops delivering after unsubscribe', () => {
    const bus = createNodeEventPublisher()
    const handler = vi.fn()
    const unsubscribe = bus.subscribe('T-1', handler)

    unsubscribe()
    bus.publish({ type: 'question', ticketId: 'T-1', question: 'q' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not warn about many listeners', () => {
    const bus = createNodeEventPublisher()
    const warn = vi.spyOn(process, 'emitWarning')
    for (let i = 0; i < 20; i++) bus.subscribe('T-1', () => {})
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
