import { EventEmitter } from 'events'
import type { RefinementEvent } from '@refinement/shared'
import type { EventPublisher } from '../../ports'

const channel = (ticketId: string) => `ticket:${ticketId}`

/**
 * In-process event bus on top of Node's EventEmitter, one channel per ticket.
 * Only reaches subscribers in the same process (see spec section 11 for Phase 3).
 */
export function createNodeEventPublisher(): EventPublisher {
  const emitter = new EventEmitter()
  // Every open browser tab subscribes; the default limit of 10 would trigger warnings.
  emitter.setMaxListeners(0)

  return {
    publish(event: RefinementEvent) {
      emitter.emit(channel(event.ticketId), event)
    },
    subscribe(ticketId, handler) {
      const name = channel(ticketId)
      emitter.on(name, handler)
      return () => {
        emitter.off(name, handler)
      }
    },
  }
}
