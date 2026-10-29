import {
  AgentRunTerminatedError,
  type AgentRunner,
  type AgentRunnerInput,
  type AgentRunCallbacks,
  type AgentRunResult,
  type ToolEvent,
} from '../ports'
import { SAMPLE_INTENT_OUTPUT, SAMPLE_META } from './samples'

/**
 * Agent that returns `outcome` (or throws it) and records every call.
 * Emits `progress` and `toolEvents` at the start of every run (before a `hold()` gate).
 * Like the CLI, `stop` terminates a run that is still in progress.
 */
export class FakeAgentRunner implements AgentRunner {
  readonly calls: AgentRunnerInput[] = []
  /** Callbacks of every call, so a test can report events later (e.g. after the attempt became stale). */
  readonly callbacks: AgentRunCallbacks[] = []
  readonly stopped: string[] = []
  progress: string[] = []
  toolEvents: ToolEvent[] = []
  outcome: AgentRunResult | Error = { output: SAMPLE_INTENT_OUTPUT, meta: SAMPLE_META }
  private gate: Promise<void> | null = null
  private readonly active = new Set<string>()
  private readonly terminated = new Set<string>()

  /** Holds every following run until the returned function is called. */
  hold(): () => void {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    this.gate = gate
    return () => {
      if (this.gate === gate) this.gate = null
      release()
    }
  }

  async run(input: AgentRunnerInput, callbacks: AgentRunCallbacks): Promise<AgentRunResult> {
    this.calls.push(input)
    this.callbacks.push(callbacks)
    this.active.add(input.ticketKey)
    try {
      for (const message of this.progress) callbacks.onProgress(message)
      for (const event of this.toolEvents) callbacks.onToolEvent(event)
      if (this.gate) await this.gate
      if (this.terminated.delete(input.ticketKey)) throw new AgentRunTerminatedError()
      if (this.outcome instanceof Error) throw this.outcome
      return this.outcome
    } finally {
      this.active.delete(input.ticketKey)
    }
  }

  stop(ticketKey: string): boolean {
    this.stopped.push(ticketKey)
    if (!this.active.has(ticketKey)) return false
    this.terminated.add(ticketKey)
    return true
  }
}
