/**
 * Runs once when the Next.js server starts. Creating the engine here applies migrations,
 * seeds an empty database and recovers crashed runs before the first request — and makes
 * a broken database fail the start instead of the first page view.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getEngine } = await import('./lib/container')
    getEngine()
  }
}
