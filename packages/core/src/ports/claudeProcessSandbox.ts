import type { ToolEvent } from './agentRunner'

/** Executable of the Claude Code CLI; every agent, summary and eval run starts it. */
export const CLAUDE_BIN = 'claude'

/**
 * Tools a sandboxed `claude` process may use: read-only; the guard confines them to the clone and restricts Bash to
 * reading git commands. `hooks/guardPolicy.mjs` keeps its own copy (the hook scripts cannot import src);
 * `hooks/guardPolicy.test.ts` checks that both lists match.
 */
export const SANDBOX_TOOLS = ['Read', 'Glob', 'Grep', 'Bash'] as const

/**
 * Parses one line of a hook log file (written by `hooks/guard.mjs` and `hooks/audit.mjs`); null for anything that
 * is not a tool event, e.g. an empty or partial line.
 */
export function parseToolEvent(line: string): ToolEvent | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }
  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const { kind, tool, target, reason } = raw as Record<string, unknown>
  if (!isToolEventKind(kind) || typeof tool !== 'string') {
    return null
  }
  return {
    kind,
    tool,
    target: typeof target === 'string' ? target : '',
    ...(typeof reason === 'string' ? { reason } : {}),
  }
}

const TOOL_EVENT_KINDS: readonly ToolEvent['kind'][] = ['blocked', 'used']

function isToolEventKind(value: unknown): value is ToolEvent['kind'] {
  return TOOL_EVENT_KINDS.includes(value as ToolEvent['kind'])
}

/** Temp file the guard and audit hooks of one `claude` process append their JSON lines to. */
export interface HookLogFile {
  /** Absolute path; pass it to `ClaudeProcessSandbox.env`. */
  readonly path: string
  /** Deletes the file and its temp directory; never throws. */
  cleanup(): Promise<void>
}

/**
 * Sandbox of every `claude` process the app starts (agent run, codebase summary, guard eval; spec §13):
 * settings sources, guard/audit hooks, allowed tools and a clean environment. Implemented by
 * `adapters/agentSandbox`, built once in compose.ts and handed to the adapters that spawn `claude`.
 */
export interface ClaudeProcessSandbox {
  /** Sandbox flags only: `--setting-sources user`, `--settings <hooks>`, `--allowedTools`. */
  readonly args: readonly string[]
  /** Environment of one `claude` process whose hooks write their JSON lines to `logFile`. */
  env(logFile: string): NodeJS.ProcessEnv
  /** Full argument list of a headless call (`--print`, stream-json output, `--model`) plus the sandbox flags. */
  claudeArgs(model: string): string[]
  /** Creates an empty hook log file for one `claude` process; the caller follows or reads it, then cleans up. */
  createLogFile(): Promise<HookLogFile>
}
