#!/usr/bin/env node
// PostToolUse hook (spec §13): records every executed tool call as `used` (tool, target).
// Fails open: errors are ignored, the exit code is always 0 and never affects the run.
import { toolTarget } from './guardPolicy.mjs'
import { appendHookLog, readHookInput } from './hookIo.mjs'

try {
  const input = await readHookInput()
  // `tool_response` is not recorded: its shape differs per tool and Bash reports no exit code.
  appendHookLog({ kind: 'used', tool: String(input.tool_name ?? ''), target: toolTarget(input) })
} catch { /* fail open */ }
process.exit(0)
