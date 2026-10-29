/** Display formats of the web app: German locale, times in Europe/Berlin (the team's zone, not the server's). */

const LOCALE = 'de-DE'
const TIME_ZONE = 'Europe/Berlin'

const DATE_TIME = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'short', timeStyle: 'medium', timeZone: TIME_ZONE })
const DATE = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeZone: TIME_ZONE })

const SECONDS_PER_MINUTE = 60
const TOKENS_PER_K = 1000

/** Below this a cost needs six decimals to be visible at all. */
const MICRO_COST_USD = 0.001
/** Below this four decimals are shown, above it cents. */
const SMALL_COST_USD = 0.01
const MICRO_COST_DECIMALS = 6
const SMALL_COST_DECIMALS = 4
const CENT_DECIMALS = 2

/** Date and time of a log entry, e.g. "29.10.26, 14:03:12". */
export function formatDateTime(at: Date): string {
  return DATE_TIME.format(at)
}

/** Date only, e.g. "29.10.2026" — for merge dates. */
export function formatDate(at: Date): string {
  return DATE.format(at)
}

/** Duration in seconds as "Xm YYs", or "Zs" below a minute. */
export function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE)
  const seconds = totalSeconds % SECONDS_PER_MINUTE
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

/** Token count in thousands from 1000 on: 999 → "999", 1500 → "1.5K", 2000 → "2K". */
export function formatTokens(n: number): string {
  if (n < TOKENS_PER_K) return String(n)
  const k = n / TOKENS_PER_K
  return `${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}K`
}

/** Dollar amount with more decimals for tiny costs; `—` for zero (no usage known). */
export function formatCost(usd: number): string {
  if (usd === 0) return '—'
  if (usd < MICRO_COST_USD) return `$${usd.toFixed(MICRO_COST_DECIMALS)}`
  if (usd < SMALL_COST_USD) return `$${usd.toFixed(SMALL_COST_DECIMALS)}`
  return `$${usd.toFixed(CENT_DECIMALS)}`
}
