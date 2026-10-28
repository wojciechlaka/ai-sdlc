#!/usr/bin/env node
// PreToolUse hook (spec §13): lets the agent only read. Denied calls get a reason the agent sees and are
// logged as `blocked`. Fails closed: any error of this script denies the call.
import { decide, toolTarget } from './guardPolicy.mjs'
import { appendHookLog, readHookInput } from './hookIo.mjs'

/** @param {string} reason */
function printDeny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }))
}

try {
  const input = await readHookInput()
  const decision = decide(input)
  if (!decision.allow) {
    try {
      appendHookLog({ kind: 'blocked', tool: String(input.tool_name ?? ''), target: toolTarget(input), reason: decision.reason })
    } catch { /* the decision stands even if the log cannot be written */ }
    printDeny(`Blockiert durch die Leitplanken der Refinement Engine: ${decision.reason}. Du darfst im Repository nur lesen.`)
  }
  // Allowed: no output, exit 0 — Claude Code continues with its normal permission handling (--allowedTools).
} catch (err) {
  const reason = `Guard-Fehler, Aufruf abgelehnt: ${err instanceof Error ? err.message : String(err)}`
  try { appendHookLog({ kind: 'blocked', tool: 'unbekannt', target: '', reason }) } catch { /* ignore */ }
  printDeny(reason)
}
