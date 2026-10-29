import type { Intent, IntentAgentOutput, TicketEvent } from '@refinement/shared'
import type { AgentRun, Artifact, SourceTicket, Stage, Ticket, TicketState } from '../domain/types'
import { compareTicketKeys } from '../domain/ticketKey'
import { errorCode } from '../domain/errors'
import { WORK_DIR } from '../domain/artifacts'
import {
  AgentRunTerminatedError,
  CodeHostError,
  type AgentRunner,
  type AgentRunnerInput,
  type AgentRunCallbacks,
  type ToolEvent,
  type AgentRunRepository,
  type AgentRunResult,
  type ArtifactRepository,
  type AuditLogEntry,
  type AuditLog,
  type BaseBranchPreparation,
  type CodeHost,
  type EventPublisher,
  type PullRequest,
  type RepoProvider,
  type TicketRepository,
  type TicketSource,
} from '../ports'
import type { UseCaseDeps } from '../application/deps'
import { createNodeEventPublisher } from '../adapters/nodeEvents/nodeEventPublisher'

export const TEST_REPO_URL = 'https://github.com/o/r'

export const SAMPLE_INTENT: Intent = {
  title: 'Lesezeit anzeigen',
  problem: 'Leser wissen nicht, wie lange ein Artikel dauert.',
  desiredOutcome: 'Die Artikel-API liefert eine geschätzte Lesezeit.',
  affected: ['Leser'],
  openPoints: [],
}

export const SAMPLE_INTENT_OUTPUT: IntentAgentOutput = { type: 'intent', result: SAMPLE_INTENT }

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

/** A source ticket as the Markdown source would deliver it. */
export function sourceTicket(key: string, patch: Partial<SourceTicket> = {}): SourceTicket {
  return {
    key,
    title: `Ticket ${key}`,
    description: `Beschreibung ${key}`,
    priority: 'Mittel',
    sourcePath: `examples/tickets/${key.toLowerCase()}.md`,
    ...patch,
  }
}

export interface InMemoryStore {
  tickets: Ticket[]
  runs: AgentRun[]
  artifacts: Artifact[]
  audit: AuditLogEntry[]
}

export function createInMemoryTicketRepository(store: InMemoryStore): TicketRepository {
  const find = (key: string) => store.tickets.find((t) => t.key === key)

  return {
    list: () => [...store.tickets].sort((a, b) => compareTicketKeys(a.key, b.key)).map((t) => structuredClone(t)),
    findByKey: (key) => {
      const ticket = find(key)
      return ticket ? structuredClone(ticket) : null
    },
    upsertFromSource(items) {
      const created: string[] = []
      const now = new Date()
      for (const item of items) {
        const fields = { title: item.title, description: item.description, priority: item.priority, sourcePath: item.sourcePath }
        const existing = find(item.key)
        if (existing) {
          Object.assign(existing, fields, { updatedAt: now })
        } else {
          store.tickets.push({ key: item.key, ...fields, stage: 'plan', state: 'ready', createdAt: now, updatedAt: now })
          created.push(item.key)
        }
      }
      return created
    },
    update(key, patch) {
      const ticket = find(key)
      if (!ticket) throw new Error(`Ticket ${key} not found`)
      if (patch.stage) ticket.stage = patch.stage
      if (patch.state) ticket.state = patch.state
      ticket.updatedAt = new Date()
      return structuredClone(ticket)
    },
    clear() {
      store.tickets = []
      store.runs = []
      store.artifacts = []
      store.audit = []
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

  return {
    create(input) {
      if (!store.tickets.some((t) => t.key === input.ticketKey)) throw new Error(`Ticket ${input.ticketKey} not found`)
      const run: AgentRun = {
        id: `run-${nextId++}`, ticketKey: input.ticketKey, stage: input.stage,
        seq: store.runs.filter((r) => r.ticketKey === input.ticketKey).length + 1,
        trigger: input.trigger, input: structuredClone(input.input), output: null, status: 'running', model: input.model,
        costUsd: null, inputTokens: null, cacheCreationTokens: null, cacheReadTokens: null, outputTokens: null,
        startedAt: new Date(), finishedAt: null,
      }
      store.runs.push(run)
      return structuredClone(run)
    },
    findById: (id) => {
      const run = store.runs.find((r) => r.id === id)
      return run ? structuredClone(run) : null
    },
    complete(id, result) {
      Object.assign(requireRun(id), { status: 'succeeded', ...structuredClone(result), finishedAt: new Date() })
    },
    fail(id, status) {
      Object.assign(requireRun(id), { status, finishedAt: new Date() })
    },
    listForTicket: (ticketKey, stage) =>
      store.runs
        .filter((r) => r.ticketKey === ticketKey && (!stage || r.stage === stage))
        .sort((a, b) => a.seq - b.seq)
        .map((r) => structuredClone(r)),
    findStuck: () => store.runs.filter((r) => r.status === 'running').map((r) => structuredClone(r)),
  }
}

export function createInMemoryArtifactRepository(store: InMemoryStore): ArtifactRepository {
  let nextId = 1
  const requireArtifact = (id: string) => {
    const artifact = store.artifacts.find((a) => a.id === id)
    if (!artifact) throw new Error(`Artifact ${id} not found`)
    return artifact
  }

  return {
    create(input) {
      if (!store.tickets.some((t) => t.key === input.ticketKey)) throw new Error(`Ticket ${input.ticketKey} not found`)
      const artifact: Artifact = { id: `artifact-${nextId++}`, ...input, prState: 'open', mergedAt: null, createdAt: new Date() }
      store.artifacts.push(artifact)
      return structuredClone(artifact)
    },
    listForTicket: (ticketKey) => store.artifacts.filter((a) => a.ticketKey === ticketKey).map((a) => structuredClone(a)),
    findOpen(ticketKey, stage) {
      const open = store.artifacts.filter((a) => a.ticketKey === ticketKey && a.stage === stage && a.prState === 'open')
      const latest = open[open.length - 1]
      return latest ? structuredClone(latest) : null
    },
    markMerged(id, mergedAt) {
      Object.assign(requireArtifact(id), { prState: 'merged', mergedAt })
    },
    markClosed(id) {
      requireArtifact(id).prState = 'closed'
    },
  }
}

export function createInMemoryAuditLog(store: InMemoryStore): AuditLog {
  return {
    append: (event) => {
      if (!store.tickets.some((t) => t.key === event.ticketKey)) throw new Error(`Ticket ${event.ticketKey} not found`)
      store.audit.push({ ...event, payload: structuredClone(event.payload ?? null), createdAt: new Date() })
    },
    listForTicket: (ticketKey) => store.audit.filter((e) => e.ticketKey === ticketKey).map((e) => structuredClone(e)),
  }
}

export class FakeTicketSource implements TicketSource {
  tickets: SourceTicket[] = []

  list(): SourceTicket[] {
    return this.tickets.map((t) => ({ ...t })).sort((a, b) => compareTicketKeys(a.key, b.key))
  }
}

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

type CodeHostMethod = keyof CodeHost

function toPullRequest(pr: PullRequest): PullRequest {
  return { number: pr.number, url: pr.url, state: pr.state, headBranch: pr.headBranch, mergedAt: pr.mergedAt }
}

export interface FakePullRequest extends PullRequest {
  title: string
  body: string
}

/**
 * In-memory GitHub: the default branch, the baseline tag, the base branch the app works on,
 * app branches with their files, PRs.
 */
export class FakeCodeHost implements CodeHost {
  baseBranchName = 'showcase'
  baselineTagName = 'showcase-base'
  /** Files on the repository's default branch (`master`); the app never writes there. */
  readonly defaultBranchFiles = new Map<string, string>()
  /** Files of the commit the baseline tag points to; null while the tag does not exist. */
  baselineFiles: Map<string, string> | null = null
  /** false simulates a repository without the base branch (first start). */
  baseBranchExists = true
  /** Files on the base branch. */
  readonly files = new Map<string, string>()
  /** Branch name → files committed on that branch. */
  readonly branches = new Map<string, Map<string, string>>()
  readonly pulls: FakePullRequest[] = []
  /** Every called method in order. */
  readonly calls: CodeHostMethod[] = []
  /** A method listed here throws the error on every call. */
  failures: Partial<Record<CodeHostMethod, Error>> = {}
  private nextPr = 1

  private enter(method: CodeHostMethod): void {
    this.calls.push(method)
    const failure = this.failures[method]
    if (failure) throw failure
  }

  private requirePull(number: number): FakePullRequest {
    const pr = this.pulls.find((p) => p.number === number)
    if (!pr) throw new CodeHostError(404, `PR #${number} nicht gefunden`)
    return pr
  }

  private addPull(branch: string, title: string, body: string): FakePullRequest {
    const number = this.nextPr++
    const pr: FakePullRequest = { number, url: `${TEST_REPO_URL}/pull/${number}`, state: 'open', headBranch: branch, mergedAt: null, title, body }
    this.pulls.push(pr)
    return pr
  }

  async baseBranch(): Promise<string> {
    this.enter('baseBranch')
    return this.baseBranchName
  }

  async prepareBaseBranch(): Promise<BaseBranchPreparation> {
    this.enter('prepareBaseBranch')
    const createdTag = this.baselineFiles === null
    this.baselineFiles ??= new Map(this.defaultBranchFiles)
    const baselineHasWork = createdTag && [...this.baselineFiles.keys()].some((path) => path.startsWith(`${WORK_DIR}/`))
    const createdBranch = !this.baseBranchExists
    if (createdBranch) {
      this.replaceFiles(this.baselineFiles)
      this.baseBranchExists = true
    }
    return { createdTag, createdBranch, baselineHasWork }
  }

  async resetBaseBranch(): Promise<void> {
    this.enter('resetBaseBranch')
    if (!this.baselineFiles) throw new CodeHostError(422, `Tag ${this.baselineTagName} fehlt`)
    this.replaceFiles(this.baselineFiles)
  }

  private replaceFiles(source: Map<string, string>): void {
    this.files.clear()
    for (const [path, content] of source) this.files.set(path, content)
  }

  async readFile(path: string): Promise<string | null> {
    this.enter('readFile')
    return this.files.get(path) ?? null
  }

  async createBranch(name: string): Promise<void> {
    this.enter('createBranch')
    if (this.branches.has(name)) throw new CodeHostError(422, `Branch ${name} existiert bereits`)
    this.branches.set(name, new Map())
  }

  async commitFile(input: { branch: string; path: string; content: string; message: string }): Promise<void> {
    this.enter('commitFile')
    const files = this.branches.get(input.branch)
    if (!files) throw new CodeHostError(404, `Branch ${input.branch} nicht gefunden`)
    files.set(input.path, input.content)
  }

  async openPullRequest(input: { branch: string; title: string; body: string }): Promise<PullRequest> {
    this.enter('openPullRequest')
    const files = this.branches.get(input.branch)
    if (!files) throw new CodeHostError(422, `Branch ${input.branch} nicht gefunden`)
    if (files.size === 0) throw new CodeHostError(422, `Branch ${input.branch} hat keine Commits`)
    if (this.pulls.some((p) => p.headBranch === input.branch && p.state === 'open')) {
      throw new CodeHostError(422, `Für ${input.branch} existiert bereits ein offener PR`)
    }
    return toPullRequest(this.addPull(input.branch, input.title, input.body))
  }

  async getPullRequest(number: number): Promise<PullRequest> {
    this.enter('getPullRequest')
    return toPullRequest(this.requirePull(number))
  }

  async listOpenPullRequests(): Promise<PullRequest[]> {
    this.enter('listOpenPullRequests')
    return this.pulls.filter((p) => p.state === 'open').map(toPullRequest)
  }

  async closePullRequest(number: number): Promise<void> {
    this.enter('closePullRequest')
    const pr = this.requirePull(number)
    if (pr.state === 'open') pr.state = 'closed'
  }

  async deleteBranch(name: string): Promise<void> {
    this.enter('deleteBranch')
    this.branches.delete(name)
    for (const pr of this.pulls) if (pr.headBranch === name && pr.state === 'open') pr.state = 'closed'
  }

  /** Test helper: an open PR from `branch` (created if missing), e.g. left over from an earlier start. */
  seedPullRequest(branch: string): FakePullRequest {
    if (!this.branches.has(branch)) this.branches.set(branch, new Map())
    return this.addPull(branch, branch, '')
  }

  /** Test helper: merges like GitHub — the files of the head branch land on the base branch. */
  merge(number: number, at = new Date('2026-10-28T12:00:00Z')): void {
    const pr = this.requirePull(number)
    if (pr.state !== 'open') throw new CodeHostError(422, `PR #${number} ist nicht offen`)
    pr.state = 'merged'
    pr.mergedAt = at
    for (const [path, content] of this.branches.get(pr.headBranch) ?? []) this.files.set(path, content)
  }
}

export type RecordingEventPublisher = EventPublisher & { readonly published: TicketEvent[] }

/** Real in-process bus that additionally records every published event. */
export function createRecordingEventPublisher(): RecordingEventPublisher {
  const inner = createNodeEventPublisher()
  const published: TicketEvent[] = []
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
  /** Always present; `deps.codeHost` is null when created with `{ token: false }`. */
  codeHost: FakeCodeHost
  source: FakeTicketSource
  events: RecordingEventPublisher
  /** Waits for all background tasks handed to `runInBackground`. */
  settle(): Promise<void>
}

/** @param options.token - false simulates a missing `GITHUB_TOKEN` (`deps.codeHost` is null). */
export function createTestContext(options: { token?: boolean } = {}): TestContext {
  const store: InMemoryStore = { tickets: [], runs: [], artifacts: [], audit: [] }
  const agent = new FakeAgentRunner()
  const repos = new FakeRepoProvider()
  const codeHost = new FakeCodeHost()
  const source = new FakeTicketSource()
  const events = createRecordingEventPublisher()
  const tasks: Promise<void>[] = []

  const deps: UseCaseDeps = {
    tickets: createInMemoryTicketRepository(store),
    runs: createInMemoryAgentRunRepository(store),
    artifacts: createInMemoryArtifactRepository(store),
    audit: createInMemoryAuditLog(store),
    source,
    codeHost: options.token === false ? null : codeHost,
    agent,
    repos,
    events,
    repoUrl: TEST_REPO_URL,
    baseBranch: codeHost.baseBranchName,
    baselineTag: codeHost.baselineTagName,
    runInBackground: (task) => {
      tasks.push(task)
    },
    stopSettleMs: 0,
    resetState: { resetting: false },
  }

  return {
    deps, store, agent, repos, codeHost, source, events,
    settle: async () => {
      let count = 0
      while (count < tasks.length) {
        count = tasks.length
        await Promise.all(tasks)
      }
    },
  }
}

/** Inserts one ticket directly into the repository (no import log entry) and returns it. */
export function seedTicket(
  ctx: TestContext,
  key = 'CB-1',
  patch: Partial<SourceTicket> & { stage?: Stage; state?: TicketState } = {},
): Ticket {
  const { stage, state, ...source } = patch
  ctx.deps.tickets.upsertFromSource([sourceTicket(key, source)])
  return ctx.deps.tickets.update(key, { stage, state })
}
