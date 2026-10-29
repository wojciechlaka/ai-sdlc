import { describe, it, expect, vi } from 'vitest'
import { createNodeEventPublisher } from './nodeEventPublisher'

describe('createNodeEventPublisher', () => {
  it('delivers events only to subscribers of the same ticket', () => {
    const bus = createNodeEventPublisher()
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    bus.subscribe('CB-1', cb1)
    bus.subscribe('CB-2', cb2)

    bus.publish({ type: 'progress', ticketKey: 'CB-1', message: 'hi' })

    expect(cb1).toHaveBeenCalledWith({ type: 'progress', ticketKey: 'CB-1', message: 'hi' })
    expect(cb2).not.toHaveBeenCalled()
  })

  it('delivers every event to subscribers of all tickets (null)', () => {
    const bus = createNodeEventPublisher()
    const all = vi.fn()
    bus.subscribe(null, all)

    bus.publish({ type: 'state', ticketKey: 'CB-1', stage: 'plan', state: 'running' })
    bus.publish({ type: 'question', ticketKey: 'CB-2', question: 'q' })

    expect(all).toHaveBeenCalledTimes(2)
  })

  it('stops delivering after unsubscribe', () => {
    const bus = createNodeEventPublisher()
    const one = vi.fn()
    const all = vi.fn()
    const unsubscribeOne = bus.subscribe('CB-1', one)
    const unsubscribeAll = bus.subscribe(null, all)

    unsubscribeOne()
    unsubscribeAll()
    bus.publish({ type: 'question', ticketKey: 'CB-1', question: 'q' })

    expect(one).not.toHaveBeenCalled()
    expect(all).not.toHaveBeenCalled()
  })

  it('does not warn about many listeners', () => {
    const bus = createNodeEventPublisher()
    const warn = vi.spyOn(process, 'emitWarning')
    for (let i = 0; i < 20; i++) bus.subscribe('CB-1', () => {})
    for (let i = 0; i < 20; i++) bus.subscribe(null, () => {})
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
