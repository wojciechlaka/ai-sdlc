import { spawn, type ChildProcess } from 'child_process'
import { AgentRunTerminatedError, AgentRunTimeoutError, type ClaudeProcessSandbox } from '../../ports'
import { CliError } from './errors'
import { extractResult, handleLine } from './streamJson'
import type { ExtractedResult } from './types'

// One `claude` process per ticket: spawn it in the sandbox, enforce the timeout, stop it on request.

const SIGTERM_EXIT_CODE = 143

/** Running process per ticket key, so `stopAgent` can terminate it. */
const runningProcesses = new Map<string, ChildProcess>()

/** Everything one `claude` process needs. */
export interface SpawnClaudeOptions {
  /** Ticket the process belongs to; the handle for `stopAgent`. */
  ticketKey: string
  /** Sent via stdin. */
  prompt: string
  /** Working directory: the clone of the target repository. */
  cwd: string
  model: string
  /** Receives German progress texts derived from the streamed tool calls. */
  onProgress: (msg: string) => void
  /** Flags and environment of the process (spec §13). */
  sandbox: ClaudeProcessSandbox
  /** Hook log file of this process (`sandbox.env(logFile)`). */
  logFile: string
  /** The process is killed and the call fails with AgentRunTimeoutError after this many milliseconds. */
  timeoutMs: number
}

/**
 * Sends SIGTERM to the running Claude process of the ticket. Returns false if none is running.
 * @param ticketKey - e.g. `CB-2`.
 */
export function stopAgent(ticketKey: string): boolean {
  const proc = runningProcesses.get(ticketKey)
  if (!proc) {
    return false
  }
  runningProcesses.delete(ticketKey)
  proc.kill('SIGTERM')
  return true
}

/**
 * Interprets the Claude process exit code and returns the extracted result, or throws an appropriate error.
 * @param code   - Process exit code, or null if the process was killed.
 * @param output - Full stdout of the Claude process.
 * @param stderr - Full stderr of the Claude process, included in CliError on non-zero exit.
 */
function parseProcessExit(code: number | null, output: string, stderr: string): ExtractedResult {
  if (code === SIGTERM_EXIT_CODE || code === null) {
    throw new AgentRunTerminatedError()
  }
  if (code !== 0) {
    throw new CliError(code, stderr)
  }
  return extractResult(output)
}

/**
 * Spawns the Claude CLI, pipes the prompt via stdin and streams stdout line by line for progress events.
 * Rejects with AgentRunTimeoutError, AgentRunTerminatedError or CliError.
 */
export function spawnClaude(options: SpawnClaudeOptions): Promise<ExtractedResult> {
  const { ticketKey, prompt, cwd, model, onProgress, sandbox, logFile, timeoutMs } = options

  return new Promise<ExtractedResult>((resolve, reject) => {
    let settled = false
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true
        fn()
      }
    }

    const proc = spawn('claude', sandbox.claudeArgs(model), {
      cwd,
      env: sandbox.env(logFile),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    runningProcesses.set(ticketKey, proc)
    const cleanup = () => {
      if (runningProcesses.get(ticketKey) === proc) {
        runningProcesses.delete(ticketKey)
      }
    }

    let stderrBuf = ''

    const timer = setTimeout(() => {
      cleanup()
      proc.kill('SIGTERM')
      settle(() => reject(new AgentRunTimeoutError(timeoutMs)))
    }, timeoutMs)

    proc.stdin.write(prompt)
    proc.stdin.end()

    let output = ''
    let stdoutBuf = ''
    let lastProgressMsg = ''

    proc.stdout.on('data', (d: Buffer) => {
      const chunk = d.toString()
      output += chunk
      stdoutBuf += chunk
      const lines = stdoutBuf.split('\n')
      stdoutBuf = lines.pop() ?? ''
      for (const line of lines) {
        lastProgressMsg = handleLine(line, lastProgressMsg, onProgress)
      }
    })

    proc.stderr.on('data', (d: Buffer) => {
      stderrBuf += d.toString()
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      cleanup()
      settle(() => {
        try {
          resolve(parseProcessExit(code, output, stderrBuf))
        } catch (e) {
          reject(e as Error)
        }
      })
    })
  })
}
