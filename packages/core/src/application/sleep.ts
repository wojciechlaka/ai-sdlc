/** Resolves after `ms` milliseconds (startup lets stopped `claude` processes settle). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
