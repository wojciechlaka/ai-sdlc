import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentRunRow } from '../src/db/agentRuns'
import type { AgentRunInput } from '../src/db/schema'

vi.mock('../src/db/tickets', () => ({
  getTicket: vi.fn(),
  updateTicketStatus: vi.fn(),
  formatTicketId: (id: number) => `T-${id}`,
}))

vi.mock('../src/db/agentRuns', () => ({
  createAgentRun: vi.fn(),
  completeAgentRun: vi.fn(),
  failAgentRun: vi.fn(),
  getRunsForTicket: vi.fn(),
}))

vi.mock('../src/db/auditEvents', () => ({
  appendAuditEvent: vi.fn(),
}))

vi.mock('../src/agentCli', () => ({
  runRefinement: vi.fn(),
  stopRefinement: vi.fn(),
}))

vi.mock('../src/repoCache', () => ({
  ensureRepo: vi.fn(),
  ensureRepoSummary: vi.fn(),
}))

import { startRefinement, startAnswerRun } from '../src/refinementOrchestrator'
import { getTicket, updateTicketStatus } from '../src/db/tickets'
import { createAgentRun, completeAgentRun, failAgentRun, getRunsForTicket } from '../src/db/agentRuns'
import { runRefinement } from '../src/agentCli'
import { ensureRepo, ensureRepoSummary } from '../src/repoCache'
import { TerminatedError } from '../src/agentCli/errors'

const mockTicket = { id: 1, title: 'T', description: 'D', status: 'backlog' as const, iteration: 0, createdAt: new Date(), updatedAt: new Date() }
const mockRun = { id: 'run1', ticketId: 1, iteration: 1, trigger: 'initial' as const, input: {} as AgentRunInput, output: null, status: 'running' as const, model: 'm', costUsd: null, inputTokens: null, cacheCreationTokens: null, cacheReadTokens: null, outputTokens: null, startedAt: new Date(), finishedAt: null }
const mockMeta = { model: 'm', durationSeconds: 1, inputTokens: 10, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 5, costUsd: 0.001 }

beforeEach(() => vi.clearAllMocks())

describe('startRefinement', () => {
  it('completes run and sets ticket to review on refinement output', async () => {
    vi.mocked(getTicket).mockReturnValue(mockTicket)
    vi.mocked(createAgentRun).mockReturnValue(mockRun)
    vi.mocked(ensureRepo).mockResolvedValue('/repo')
    vi.mocked(ensureRepoSummary).mockResolvedValue(null)
    vi.mocked(runRefinement).mockResolvedValue({
      output: { type: 'refinement', result: { title: 'T', userStory: 'U', acceptanceCriteria: [], affectedFiles: [], risks: [], openQuestions: [], confidence: 80 } },
      meta: mockMeta,
    })

    await startRefinement(1, { repo: 'r', model: 'm', acceptanceCriteria: '' })

    expect(completeAgentRun).toHaveBeenCalledWith('run1', expect.objectContaining({ output: expect.objectContaining({ type: 'refinement' }) }))
    expect(updateTicketStatus).toHaveBeenCalledWith(1, 'review')
  })

  it('completes run but keeps ticket refining on question output', async () => {
    vi.mocked(getTicket).mockReturnValue(mockTicket)
    vi.mocked(createAgentRun).mockReturnValue(mockRun)
    vi.mocked(ensureRepo).mockResolvedValue('/repo')
    vi.mocked(ensureRepoSummary).mockResolvedValue(null)
    vi.mocked(runRefinement).mockResolvedValue({
      output: { type: 'question', question: 'Which DB?' },
      meta: mockMeta,
    })

    await startRefinement(1, { repo: 'r', model: 'm', acceptanceCriteria: '' })

    expect(completeAgentRun).toHaveBeenCalledWith('run1', expect.objectContaining({ output: { type: 'question', question: 'Which DB?' } }))
    expect(updateTicketStatus).not.toHaveBeenCalledWith(1, 'review')
    expect(updateTicketStatus).not.toHaveBeenCalledWith(1, 'failed')
  })

  it('sets ticket to failed on error', async () => {
    vi.mocked(getTicket).mockReturnValue(mockTicket)
    vi.mocked(createAgentRun).mockReturnValue(mockRun)
    vi.mocked(ensureRepo).mockResolvedValue('/repo')
    vi.mocked(ensureRepoSummary).mockResolvedValue(null)
    vi.mocked(runRefinement).mockRejectedValue(new Error('boom'))

    await startRefinement(1, { repo: 'r', model: 'm', acceptanceCriteria: '' })

    expect(failAgentRun).toHaveBeenCalledWith('run1', 'failed')
    expect(updateTicketStatus).toHaveBeenCalledWith(1, 'failed')
  })

  it('sets ticket to backlog on TerminatedError', async () => {
    vi.mocked(getTicket).mockReturnValue(mockTicket)
    vi.mocked(createAgentRun).mockReturnValue(mockRun)
    vi.mocked(ensureRepo).mockResolvedValue('/repo')
    vi.mocked(ensureRepoSummary).mockResolvedValue(null)
    vi.mocked(runRefinement).mockRejectedValue(new TerminatedError())

    await startRefinement(1, { repo: 'r', model: 'm', acceptanceCriteria: '' })

    expect(failAgentRun).toHaveBeenCalledWith('run1', 'failed')
    expect(updateTicketStatus).toHaveBeenCalledWith(1, 'backlog')
  })
})

describe('startAnswerRun', () => {
  it('returns early when no pending question run exists', async () => {
    vi.mocked(getTicket).mockReturnValue({ ...mockTicket, status: 'refining' as const })
    vi.mocked(getRunsForTicket).mockReturnValue([])

    await startAnswerRun(1, 'some answer')

    expect(createAgentRun).not.toHaveBeenCalled()
  })

  it('starts a new answer-trigger run with previousRuns', async () => {
    const questionRun: AgentRunRow = {
      ...mockRun,
      id: 'run1',
      trigger: 'initial' as const,
      status: 'succeeded' as const,
      output: { type: 'question' as const, question: 'Which DB?' },
      input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'https://github.com/x/y', model: 'm' } as AgentRunInput,
    }
    vi.mocked(getTicket).mockReturnValue({ ...mockTicket, status: 'refining' as const })
    vi.mocked(getRunsForTicket).mockReturnValue([questionRun])
    vi.mocked(createAgentRun).mockReturnValue({ ...mockRun, id: 'run2', trigger: 'answer' as const })
    vi.mocked(ensureRepo).mockResolvedValue('/repo')
    vi.mocked(ensureRepoSummary).mockResolvedValue(null)
    vi.mocked(runRefinement).mockResolvedValue({
      output: { type: 'refinement', result: { title: 'T', userStory: 'U', acceptanceCriteria: [], affectedFiles: [], risks: [], openQuestions: [], confidence: 80 } },
      meta: mockMeta,
    })

    await startAnswerRun(1, 'PostgreSQL')

    expect(createAgentRun).toHaveBeenCalledWith(expect.objectContaining({
      trigger: 'answer',
      input: expect.objectContaining({
        previousRuns: [{ question: 'Which DB?', answer: 'PostgreSQL' }],
      }),
    }))
    expect(updateTicketStatus).toHaveBeenCalledWith(1, 'review')
  })
})
