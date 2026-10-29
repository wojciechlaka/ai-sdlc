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
}
