import { EventEmitter } from 'events'
import type { TicketEvent } from '@refinement/shared'
import type { EventPublisher } from '../../ports'

const ALL_TICKETS = 'all'
const channel = (ticketKey: string | null) => (ticketKey === null ? ALL_TICKETS : `ticket:${ticketKey}`)

/**
 * In-process event bus on top of Node's EventEmitter: one channel per ticket plus one for all
 * tickets (board). Only reaches subscribers in the same process.
 */
export function createNodeEventPublisher(): EventPublisher {
  const emitter = new EventEmitter()
  // Every open browser tab subscribes; the default limit of 10 would trigger warnings.
  emitter.setMaxListeners(0)

  return {
    publish(event: TicketEvent) {
      emitter.emit(channel(event.ticketKey), event)
      emitter.emit(ALL_TICKETS, event)
    },
    subscribe(ticketKey, handler) {
      const name = channel(ticketKey)
      emitter.on(name, handler)
      return () => {
        emitter.off(name, handler)
      }
    },
  }
}
