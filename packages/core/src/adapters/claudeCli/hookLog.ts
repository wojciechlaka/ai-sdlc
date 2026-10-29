import fs from 'fs/promises'
import { StringDecoder } from 'string_decoder'
import type { HookLogFile, ToolEvent } from '../../ports'
import { describeError } from '../../domain/errors'

// Guard and audit hooks of the agent (spec §13). The hook scripts (`packages/core/hooks`) append one JSON line
// per tool call to the file in REFINEMENT_HOOK_LOG (created and set by the sandbox); this module follows that file
// while the run lasts and turns the lines into ToolEvents.

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

/** The hook log of one Claude call while it is followed. */
export interface HookLog {
  /** Path the hooks write to (`sandbox.env(file)`). */
  file: string
  /** Stops following, reports the remaining lines and deletes the file. */
  close(): Promise<void>
}

/**
 * Follows the sandbox's log file of one Claude call and reports every complete line to `onEvent` while the call
 * lasts (polling; partial lines wait for their newline). `close` drains the rest and cleans the file up;
 * if the file cannot be opened, it is cleaned up before the error is rethrown.
 */
export async function openHookLog(
  logFile: HookLogFile,
  onEvent: (event: ToolEvent) => void,
  pollMs = POLL_INTERVAL_MS,
): Promise<HookLog> {
  let handle: fs.FileHandle
  try {
    handle = await fs.open(logFile.path, 'r')
  } catch (err) {
    await logFile.cleanup()
    throw err
  }
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
      console.warn(`[claudeCli] tool event could not be handled: ${describeError(err)}`)
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
    reading = reading
      .then(readNew)
      .catch((err) => console.warn(`[claudeCli] hook log could not be read: ${describeError(err)}`))
    return reading
  }
  const timer = setInterval(() => void drain(), pollMs)

  return {
    file: logFile.path,
    close: async () => {
      clearInterval(timer)
      await drain()
      emit(pending + decoder.end())
      pending = ''
      await handle.close().catch(() => {})
      await logFile.cleanup()
    },
  }
}
