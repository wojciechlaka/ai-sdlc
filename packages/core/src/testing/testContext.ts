import type { TicketEvent } from '@refinement/shared'
import type { SourceTicket, Stage, Ticket, TicketState } from '../domain/types'
import { errorCode } from '../domain/errors'
import type { EventPublisher } from '../ports'
import type { UseCaseDeps } from '../application/deps'
import { createNodeEventPublisher } from '../adapters/nodeEvents/nodeEventPublisher'
import {
  createInMemoryAgentRunRepository,
  createInMemoryArtifactRepository,
  createInMemoryAuditLog,
  createInMemoryTicketRepository,
  type InMemoryStore,
} from './inMemoryRepositories'
import { FakeAgentRunner } from './fakeAgentRunner'
import { FakeCodeHost } from './fakeCodeHost'
import { FakeRepoProvider } from './fakeRepoProvider'
import { FakeTicketSource } from './fakeTicketSource'
import { TEST_REPO_URL, sourceTicket } from './samples'

/** Runs `fn` and returns the domain error code it throws, or null if it does not throw a domain error. */
export function errorCodeOf(fn: () => unknown): string | null {
  try {
    fn()
  } catch (err) {
    return errorCode(err)
  }
  return null
}

/** Event publisher whose events a test can inspect. */
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

/** Use case deps wired to fakes, plus direct access to every fake. */
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

/**
 * Fresh use case deps on in-memory repositories and fakes; background tasks are collected for `settle()`.
 * @param options.token - false simulates a missing `GITHUB_TOKEN` (`deps.codeHost` is null).
 */
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
