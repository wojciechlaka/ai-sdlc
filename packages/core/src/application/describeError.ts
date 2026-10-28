/** User-facing text of any thrown value; prefers git's stderr where present; credentials in URLs are redacted. */
export function describeError(err: unknown): string {
  const stderr = (err as { stderr?: Buffer } | null)?.stderr?.toString().trim()
  const text = stderr || (err instanceof Error ? err.message : String(err))
  return text.replace(/https:\/\/[^@\s/]*@/g, 'https://***@')
}
