import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { StringDecoder } from 'string_decoder'
import type { ToolEvent } from '../../ports'

// Guard and audit hooks of the agent (spec §13). The hook scripts (`packages/core/hooks`) append one JSON line
// per tool call to the file in REFINEMENT_HOOK_LOG (set by the sandbox); this module creates that file per run,
// follows it while the run lasts and turns the lines into ToolEvents.

const POLL_INTERVAL_MS = 200
const READ_CHUNK_BYTES = 64 * 1024

/** Parses one log line of the hook scripts; null for anything that is not a tool event. */
export function parseToolEvent(line: string): ToolEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const { kind, tool, target, reason } = raw as Record<string, unknown>
  if ((kind !== 'blocked' && kind !== 'used') || typeof tool !== 'string') return null
  return {
    kind,
    tool,
    target: typeof target === 'string' ? target : '',
    ...(typeof reason === 'string' ? { reason } : {}),
  }
}

export interface HookLog {
  /** Path the hooks write to (`sandbox.env(file)`). */
  file: string
  /** Stops following, reports the remaining lines and deletes the file. */
  close(): Promise<void>
}

/**
 * Creates an empty log file for one run and reports every complete line to `onEvent` while the run lasts
 * (polling; partial lines wait for their newline). `close` drains the rest.
 */
export async function openHookLog(onEvent: (event: ToolEvent) => void, pollMs = POLL_INTERVAL_MS): Promise<HookLog> {
  const dir = await fs.mkdtemp(path.join(/*turbopackIgnore: true*/ os.tmpdir(), 'refinement-hooks-'))
  const file = path.join(/*turbopackIgnore: true*/ dir, 'tools.jsonl')
  await fs.writeFile(file, '')
  const handle = await fs.open(file, 'r')
  const decoder = new StringDecoder('utf8')
  const buffer = Buffer.alloc(READ_CHUNK_BYTES)
  let offset = 0
  let pending = ''

  const emit = (line: string) => {
    const event = parseToolEvent(line)
    if (!event) return
    try {
      onEvent(event)
    } catch (err) {
      console.warn(`[claudeCli] tool event could not be handled: ${err}`)
    }
  }

  const readNew = async () => {
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset)
      if (bytesRead === 0) break
      offset += bytesRead
      pending += decoder.write(buffer.subarray(0, bytesRead))
    }
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) emit(line)
  }

  // Reads are chained so polls never overlap.
  let reading: Promise<void> = Promise.resolve()
  const drain = () => {
    reading = reading.then(readNew).catch((err) => console.warn(`[claudeCli] hook log could not be read: ${err}`))
    return reading
  }
  const timer = setInterval(() => void drain(), pollMs)

  return {
    file,
    close: async () => {
      clearInterval(timer)
      await drain()
      emit(pending + decoder.end())
      pending = ''
      await handle.close().catch(() => {})
      await fs.rm(dir, { recursive: true, force: true })
    },
  }
}
