import type { CostSummaryDto, SettingsDto, StageViewDto, TicketDetailDto, TicketDto } from '@refinement/shared'
import type { Artifact, ArtifactStage, Ticket } from '../domain/types'
import { summarizeCosts } from '../domain/costs'
import type { AuditLogEntry } from '../ports'
import { ARTIFACT_STAGES, artifactPath, fileUrl } from '../domain/artifacts'
import { countQuestionsAsked, currentArtifactStage, isStageCompleted, questionLimit } from '../domain/rules'
import type { UseCaseDeps } from './deps'
import { toAuditLogEntryDto, toPullRequestRef, toTicketDto } from './dto'
import { describeError } from '../domain/errors'
import { requireTicket } from './requireTicket'

function openArtifact(deps: UseCaseDeps, ticket: Ticket): Artifact | null {
  const stage = currentArtifactStage(ticket)
  return stage ? deps.artifacts.findOpen(ticket.key, stage) : null
}

/**
 * Agent cost of a ticket from its log (cost reported by the CLI). Runs without a `run_started` entry take their
 * stage from the AgentRun row.
 */
function ticketCosts(deps: UseCaseDeps, log: AuditLogEntry[]): CostSummaryDto {
  return summarizeCosts(log, (runId) => deps.runs.findById(runId)?.stage ?? null)
}

/** All tickets for the board, each with the PR of its current stage while in review and its total agent cost. */
export function listTickets(deps: UseCaseDeps): TicketDto[] {
  return deps.tickets.list().map((ticket) => {
    const costs = ticketCosts(deps, deps.audit.listForTicket(ticket.key))
    return toTicketDto(ticket, openArtifact(deps, ticket), costs.totalUsd)
  })
}

/** Content of a merged artifact, read live from the base branch; null without token or on errors. */
async function readMergedContent(deps: UseCaseDeps, path: string): Promise<string | null> {
  if (!deps.codeHost) {
    return null
  }
  try {
    return await deps.codeHost.readFile(path)
  } catch (err) {
    console.warn(`[getTicket] ${path} not readable: ${describeError(err)}`)
    return null
  }
}

async function stageView(deps: UseCaseDeps, ticket: Ticket, artifacts: Artifact[], stage: ArtifactStage): Promise<StageViewDto> {
  const path = artifactPath(ticket.key, stage)
  const latest = artifacts.filter((a) => a.stage === stage).at(-1) ?? null
  const completed = isStageCompleted(ticket, stage)
  return {
    stage,
    path,
    fileUrl: fileUrl(deps.repoUrl, deps.baseBranch, path),
    completed,
    pr: latest ? toPullRequestRef(latest) : null,
    mergedAt: latest?.mergedAt ?? null,
    content: completed ? await readMergedContent(deps, path) : null,
  }
}

/** Open question or choice and the question counter of the current stage, as the ticket page shows them. */
type QuestionState = Pick<TicketDetailDto, 'pendingQuestion' | 'pendingChoice' | 'questionsAsked' | 'questionLimit'>

/** The agent's open question or choice while the ticket waits for an answer, and how many it asked so far. */
function questionState(deps: UseCaseDeps, ticket: Ticket): QuestionState {
  const stage = currentArtifactStage(ticket)
  if (!stage) {
    return { pendingQuestion: null, pendingChoice: null, questionsAsked: 0, questionLimit: null }
  }
  const runs = deps.runs.listForTicket(ticket.key, stage)
  const output = ticket.state === 'awaiting_answer' ? runs.at(-1)?.output : undefined
  return {
    pendingQuestion: output?.type === 'question' ? output.question : null,
    pendingChoice: output?.type === 'choice'
      ? { question: output.question, options: output.options, recommended: output.recommended }
      : null,
    questionsAsked: countQuestionsAsked(runs),
    questionLimit: questionLimit(stage),
  }
}

/**
 * Ticket page data: stages (merged content read live), log, open question or choice with the question counter,
 * and agent cost per stage.
 * @throws {NotFoundError}
 */
export async function getTicket(deps: UseCaseDeps, key: string): Promise<TicketDetailDto> {
  const ticket = requireTicket(deps.tickets, key)
  const artifacts = deps.artifacts.listForTicket(ticket.key)
  const log = deps.audit.listForTicket(ticket.key)
  const costs = ticketCosts(deps, log)
  return {
    ...toTicketDto(ticket, openArtifact(deps, ticket), costs.totalUsd),
    stages: await Promise.all(ARTIFACT_STAGES.map((stage) => stageView(deps, ticket, artifacts, stage))),
    log: log.map(toAuditLogEntryDto),
    ...questionState(deps, ticket),
    costs,
  }
}

/** Target repo, base branch and whether a token is configured — for the sidebar. */
export function getSettings(deps: UseCaseDeps): SettingsDto {
  return {
    repoUrl: deps.repoUrl,
    baseBranch: deps.baseBranch,
    baselineTag: deps.baselineTag,
    tokenConfigured: deps.codeHost !== null,
  }
}
