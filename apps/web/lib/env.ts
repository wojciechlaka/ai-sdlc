/** A positive integer from an env var; undefined (engine default) when unset or invalid. */
export function positiveInt(value: string | undefined): number | undefined {
  const parsed = parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}
