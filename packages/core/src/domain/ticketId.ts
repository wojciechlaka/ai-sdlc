/**
 * Converts a numeric id to the public `T-{id}` format used in the API and UI.
 * @param id - Numeric ticket ID.
 */
export function formatTicketId(id: number): string {
  return `T-${id}`
}

/**
 * Parses a `T-{id}` string back to a numeric id. Throws on invalid format.
 * @param formatted - Public ticket ID string, e.g. `T-42`.
 */
export function parseTicketId(formatted: string): number {
  const match = /^T-(\d+)$/.exec(formatted)
  if (!match) throw new Error(`Invalid ticket ID: ${formatted}`)
  return parseInt(match[1], 10)
}
