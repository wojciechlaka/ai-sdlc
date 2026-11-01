/** Ticket keys as in Jira: upper-case prefix, dash, number (`CB-3`). */
export const TICKET_KEY_PATTERN = '[A-Z][A-Z0-9]*-\\d+'

const KEY_RE = /^(?<prefix>[A-Z][A-Z0-9]*)-(?<number>\d+)$/

/** True for a whole Jira-style key such as `CB-3`. */
export function isTicketKey(value: string): boolean {
  return KEY_RE.test(value)
}

/** Orders by prefix, then by number, so CB-2 comes before CB-10. */
export function compareTicketKeys(a: string, b: string): number {
  const ka = KEY_RE.exec(a)?.groups
  const kb = KEY_RE.exec(b)?.groups
  if (!ka || !kb) {
    return a.localeCompare(b)
  }
  return ka.prefix!.localeCompare(kb.prefix!) || Number(ka.number) - Number(kb.number)
}
