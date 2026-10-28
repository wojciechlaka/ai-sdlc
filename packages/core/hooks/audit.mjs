#!/usr/bin/env node
// PostToolUse hook (spec §13): records every executed tool call as `used` (tool, target, Bash exit code).
// Fails open: errors are ignored, the exit code is always 0 and never affects the run.
import { toolTarget } from './guardPolicy.mjs'
import { appendHookLog, readHookInput } from './hookIo.mjs'

const EXIT_CODE_KEYS = ['exitCode', 'exit_code', 'returnCode', 'return_code', 'code']

/**
 * Exit code of a Bash call if the tool response carries one; its shape differs between CLI versions.
 * @param {unknown} response
 * @returns {number | undefined}
 */
function exitCodeOf(response) {
  if (!response || typeof response !== 'object') return undefined
  const record = /** @type {Record<string, unknown>} */ (response)
  for (const key of EXIT_CODE_KEYS) {
    if (typeof record[key] === 'number') return /** @type {number} */ (record[key])
  }
  return undefined
}

try {
  const input = await readHookInput()
  const tool = String(input.tool_name ?? '')
  const exitCode = tool === 'Bash' ? exitCodeOf(input.tool_response) : undefined
  appendHookLog({ kind: 'used', tool, target: toolTarget(input), ...(exitCode === undefined ? {} : { exitCode }) })
} catch { /* fail open */ }
process.exit(0)
