// Shared I/O of the hook scripts: read the hook input from stdin, append one JSON line to $REFINEMENT_HOOK_LOG.
import fs from 'node:fs'

/** Environment variable with the per-run log file; set by the adapter that spawns `claude`. */
export const HOOK_LOG_ENV = 'REFINEMENT_HOOK_LOG'

/**
 * Reads stdin completely and parses it as JSON.
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readHookInput() {
  /** @type {Buffer[]} */
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(/** @type {Buffer} */ (chunk))
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
  if (!parsed || typeof parsed !== 'object') throw new Error('Hook-Eingabe ist kein JSON-Objekt')
  return parsed
}

/**
 * Appends one entry as a JSON line to the log file of the run. No-op without `REFINEMENT_HOOK_LOG`.
 * A single `appendFileSync` per line keeps concurrent hook processes from interleaving partial lines.
 * @param {Record<string, unknown>} entry
 */
export function appendHookLog(entry) {
  const file = process.env[HOOK_LOG_ENV]
  if (!file) return
  fs.appendFileSync(file, `${JSON.stringify({ ...entry, at: new Date().toISOString() })}\n`)
}
