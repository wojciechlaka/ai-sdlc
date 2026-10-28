import type { AgentOutput, RefinementEvent } from '@refinement/shared'
import type { AgentRun, Ticket } from '../domain/types'
import type {
  AgentRunner,
  AgentRunnerInput,
  AgentRunRepository,
  AgentRunResult,
  AuditActor,
  AuditLog,
  EventPublisher,
  RepoProvider,
  TicketRepository,
} from '../ports'
import type { UseCaseDeps } from '../application/deps'
import { createNodeEventPublisher } from '../adapters/nodeEvents/nodeEventPublisher'
import { errorCode } from '../domain/errors'

export const SAMPLE_REFINEMENT: AgentOutput = {
  type: 'refinement',
  result: { title: 'T', userStory: 'U', acceptanceCriteria: [], affectedFiles: [], risks: [], openQuestions: [], confidence: 80 },
}

export const SAMPLE_META = {
  model: 'm', durationSeconds: 1, inputTokens: 10, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 5, costUsd: 0.001,
}

/** Runs `fn` and returns the domain error code it throws, or null if it does not throw a domain error. */
export function errorCodeOf(fn: () => unknown): string | null {
  try {
    fn()
  } catch (err) {
    return errorCode(err)
  }
  return null
}

export interface AuditEntry {
  ticketId: number
  actor: AuditActor
  type: string
  payload?: unknown
}

export interface InMemoryStore {
  tickets: Ticket[]
  runs: AgentRun[]
  audit: AuditEntry[]
}

export function createInMemoryTicketRepository(store: InMemoryStore): TicketRepository {
  let nextId = 1
  const find = (id: number) => store.tickets.find((t) => t.id === id)
  const requireTicket = (id: number) => {
    const ticket = find(id)
    if (!ticket) throw new Error(`Ticket ${id} not found`)
    return ticket
  }
  const create = (input: { title: string; description: string }): Ticket => {
    const now = new Date()
    const ticket: Ticket = {
      id: nextId++, title: input.title, description: input.description,
      status: 'backlog', iteration: 0, createdAt: now, updatedAt: now,
    }
    store.tickets.push(ticket)
    return ticket
  }

  return {
    list: () => [...store.tickets],
    findById: (id) => find(id) ?? null,
    count: () => store.tickets.length,
    create,
    updateStatus(id, status) {
      const ticket = requireTicket(id)
      ticket.status = status
      ticket.updatedAt = new Date()
    },
    delete(id) {
      requireTicket(id)
      store.tickets = store.tickets.filter((t) => t.id !== id)
      store.runs = store.runs.filter((r) => r.ticketId !== id)
    },
    replaceAll(newTickets) {
      store.tickets = []
      store.runs = []
      store.audit = []
      return newTickets.map(create)
    },
  }
}

export function createInMemoryAgentRunRepository(store: InMemoryStore): AgentRunRepository {
  let nextId = 1
  const requireRun = (id: string) => {
    const run = store.runs.find((r) => r.id === id)
    if (!run) throw new Error(`AgentRun ${id} not found`)
    return run
  }
  const listForTicket = (ticketId: number) =>
    store.runs.filter((r) => r.ticketId === ticketId).sort((a, b) => a.iteration - b.iteration)

  return {
    create(input) {
      const ticket = store.tickets.find((t) => t.id === input.ticketId)
      if (!ticket) throw new Error(`Ticket ${input.ticketId} not found`)
      ticket.iteration += 1
      const run: AgentRun = {
        id: `run-${nextId++}`, ticketId: input.ticketId, iteration: ticket.iteration, trigger: input.trigger,
        input: input.input, output: null, status: 'running', model: input.model, costUsd: null, inputTokens: null,
        cacheCreationTokens: null, cacheReadTokens: null, outputTokens: null, startedAt: new Date(), finishedAt: null,
      }
      store.runs.push(run)
      return run
    },
    findById: (id) => store.runs.find((r) => r.id === id) ?? null,
    complete(id, result) {
      Object.assign(requireRun(id), { status: 'succeeded', ...result, finishedAt: new Date() })
    },
    fail(id, status) {
      Object.assign(requireRun(id), { status, finishedAt: new Date() })
    },
    listForTicket,
    latestForTicket: (ticketId) => listForTicket(ticketId).at(-1) ?? null,
    findStuck: () => store.runs.filter((r) => r.status === 'running'),
  }
}

export function createInMemoryAuditLog(store: InMemoryStore): AuditLog {
  return { append: (event) => { store.audit.push(event) } }
}

/** Agent that returns `outcome` (or throws it) and records every call. */
export class FakeAgentRunner implements AgentRunner {
  readonly calls: AgentRunnerInput[] = []
  readonly stopped: string[] = []
  progress: string[] = []
  outcome: AgentRunResult | Error = { output: SAMPLE_REFINEMENT, meta: SAMPLE_META }

  async run(input: AgentRunnerInput, onProgress: (message: string) => void): Promise<AgentRunResult> {
    this.calls.push(input)
    for (const message of this.progress) onProgress(message)
    if (this.outcome instanceof Error) throw this.outcome
    return this.outcome
  }

  stop(ticketId: string): boolean {
    this.stopped.push(ticketId)
    return true
  }
}

export class FakeRepoProvider implements RepoProvider {
  repoDir = '/repo'
  summary: string | null = null
  ensureRepoError: Error | null = null
  readonly requestedUrls: string[] = []

  async ensureRepo(url: string): Promise<string> {
    this.requestedUrls.push(url)
    if (this.ensureRepoError) throw this.ensureRepoError
    return this.repoDir
  }

  async ensureSummary(): Promise<string | null> {
    return this.summary
  }
}

export type RecordingEventPublisher = EventPublisher & { readonly published: RefinementEvent[] }

/** Real in-process bus that additionally records every published event. */
export function createRecordingEventPublisher(): RecordingEventPublisher {
  const inner = createNodeEventPublisher()
  const published: RefinementEvent[] = []
  return {
    published,
    publish(event) {
      published.push(event)
      inner.publish(event)
    },
    subscribe: inner.subscribe,
  }
}

export interface TestContext {
  deps: UseCaseDeps
  store: InMemoryStore
  agent: FakeAgentRunner
  repos: FakeRepoProvider
  events: RecordingEventPublisher
  /** Waits for all background tasks handed to `runInBackground`. */
  settle(): Promise<void>
}

export function createTestContext(): TestContext {
  const store: InMemoryStore = { tickets: [], runs: [], audit: [] }
  const agent = new FakeAgentRunner()
  const repos = new FakeRepoProvider()
  const events = createRecordingEventPublisher()
  const tasks: Promise<void>[] = []

  const deps: UseCaseDeps = {
    tickets: createInMemoryTicketRepository(store),
    runs: createInMemoryAgentRunRepository(store),
    audit: createInMemoryAuditLog(store),
    agent,
    repos,
    events,
    runInBackground: (task) => { tasks.push(task) },
    stopSettleMs: 0,
  }

  return { deps, store, agent, repos, events, settle: async () => { await Promise.all(tasks) } }
}
