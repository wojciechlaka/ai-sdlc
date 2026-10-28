#!/usr/bin/env node
// PreToolUse hook (spec §13): lets the agent only read, and only inside the clone. Denied calls get a reason the
// agent sees and are logged as `blocked`. Fails closed: the modules are loaded inside the try, so any error of this
// script denies the call; if node itself cannot start, the shell fallback in the hook command exits with 2.

const MAX_BLOCKED_TARGET_CHARS = 1000

/** @param {string} reason */
function printDeny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }))
}

/** @type {((entry: Record<string, unknown>) => void) | undefined} */
let appendHookLog
try {
  const io = await import('./hookIo.mjs')
  appendHookLog = io.appendHookLog
  const { decide, toolTarget } = await import('./guardPolicy.mjs')
  const input = await io.readHookInput()
  const decision = decide(input)
  if (!decision.allow) {
    try {
      appendHookLog({ kind: 'blocked', tool: String(input.tool_name ?? ''), target: toolTarget(input, MAX_BLOCKED_TARGET_CHARS), reason: decision.reason })
    } catch { /* the decision stands even if the log cannot be written */ }
    printDeny(`Blockiert durch die Leitplanken der Refinement Engine: ${decision.reason}`)
  }
  // Allowed: no output, exit 0 — Claude Code continues with its normal permission handling (--allowedTools).
} catch (err) {
  const reason = `Guard-Fehler, Aufruf abgelehnt: ${err instanceof Error ? err.message : String(err)}`
  try { appendHookLog?.({ kind: 'blocked', tool: 'unbekannt', target: '', reason }) } catch { /* ignore */ }
  printDeny(reason)
}
