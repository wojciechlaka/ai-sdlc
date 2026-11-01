// Contract of the SSE endpoint `app/api/events/route.ts`, shared by the route and the `useSSE` hook.

/** Path of the SSE route. */
export const EVENTS_ROUTE = '/api/events'
/** Query parameter that limits the stream to one ticket; without it the stream carries every ticket (board). */
export const TICKET_KEY_PARAM = 'ticketKey'

/** URL of the event stream: one ticket, or all tickets with `null`. */
export function eventsUrl(ticketKey: string | null): string {
  if (!ticketKey) {
    return EVENTS_ROUTE
  }
  const query = new URLSearchParams({ [TICKET_KEY_PARAM]: ticketKey })
  return `${EVENTS_ROUTE}?${query}`
}
