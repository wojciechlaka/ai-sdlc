/** User-facing text of any thrown value; prefers git's stderr where present. */
export function describeError(err: unknown): string {
  const stderr = (err as { stderr?: Buffer } | null)?.stderr?.toString().trim()
  return stderr || (err instanceof Error ? err.message : String(err))
}
