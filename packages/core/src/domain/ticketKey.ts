/** Ticket keys as in Jira: upper-case prefix, dash, number (`CB-3`). */
export const TICKET_KEY_PATTERN = '[A-Z][A-Z0-9]*-\\d+'

const KEY_RE = /^([A-Z][A-Z0-9]*)-(\d+)$/

/** True for a whole Jira-style key such as `CB-3`. */
export function isTicketKey(value: string): boolean {
  return KEY_RE.test(value)
}

/** Orders by prefix, then by number, so CB-2 comes before CB-10. */
export function compareTicketKeys(a: string, b: string): number {
  const ma = KEY_RE.exec(a)
  const mb = KEY_RE.exec(b)
  if (!ma || !mb) return a.localeCompare(b)
  return ma[1]!.localeCompare(mb[1]!) || Number(ma[2]) - Number(mb[2])
}
