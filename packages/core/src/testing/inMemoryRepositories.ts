import type { AgentRun, Artifact, Ticket } from '../domain/types'
import { compareTicketKeys } from '../domain/ticketKey'
import type { AgentRunRepository, ArtifactRepository, AuditLog, AuditLogEntry, TicketRepository } from '../ports'

// In-memory versions of the persistence ports with the semantics of the SQLite adapters.

/** Shared state of the in-memory repositories; `clear()` of the ticket repository empties all of it. */
export interface InMemoryStore {
  tickets: Ticket[]
  runs: AgentRun[]
  artifacts: Artifact[]
  audit: AuditLogEntry[]
}

/** TicketRepository with the SQLite semantics: key order, upsert from source, copies on read. */
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

/** AgentRunRepository with per-ticket `seq`; rejects runs of unknown tickets like the foreign key does. */
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

/** ArtifactRepository; `findOpen` returns the latest open artifact of a stage. */
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

/** AuditLog that stores deep copies of the payloads and rejects entries of unknown tickets. */
export function createInMemoryAuditLog(store: InMemoryStore): AuditLog {
  return {
    append: (event) => {
      if (!store.tickets.some((t) => t.key === event.ticketKey)) throw new Error(`Ticket ${event.ticketKey} not found`)
      store.audit.push({ ...event, payload: structuredClone(event.payload ?? null), createdAt: new Date() })
    },
    listForTicket: (ticketKey) => store.audit.filter((e) => e.ticketKey === ticketKey).map((e) => structuredClone(e)),
  }
}
