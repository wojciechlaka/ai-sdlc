import type { SettingsDto, StageViewDto, TicketDetailDto, TicketDto } from '@refinement/shared'
import type { Artifact, ArtifactStage, Ticket } from '../domain/types'
import { ARTIFACT_STAGES, artifactPath, fileUrl } from '../domain/artifacts'
import { currentArtifactStage, isStageCompleted } from '../domain/rules'
import type { UseCaseDeps } from './deps'
import { toAuditEventDto, toPullRequestRef, toTicketDto } from './dto'
import { describeError } from './describeError'
import { requireTicket } from './requireTicket'

function openArtifact(deps: UseCaseDeps, ticket: Ticket): Artifact | null {
  const stage = currentArtifactStage(ticket)
  return stage ? deps.artifacts.findOpen(ticket.key, stage) : null
}

/** All tickets for the board, each with the PR of its current stage while in review. */
export function listTickets(deps: UseCaseDeps): TicketDto[] {
  return deps.tickets.list().map((ticket) => toTicketDto(ticket, openArtifact(deps, ticket)))
}

/** Content of a merged artifact, read live from the base branch; null without token or on errors. */
async function readMergedContent(deps: UseCaseDeps, path: string): Promise<string | null> {
  if (!deps.codeHost) return null
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

/** The agent's question while the ticket waits for an answer. */
function pendingQuestion(deps: UseCaseDeps, ticket: Ticket): string | null {
  const stage = currentArtifactStage(ticket)
  if (ticket.state !== 'awaiting_answer' || !stage) return null
  const output = deps.runs.listForTicket(ticket.key, stage).at(-1)?.output
  return output?.type === 'question' ? output.question : null
}

/** Ticket page data: stages (merged content read live), log and open question. @throws {NotFoundError} */
export async function getTicket(deps: UseCaseDeps, key: string): Promise<TicketDetailDto> {
  const ticket = requireTicket(deps.tickets, key)
  const artifacts = deps.artifacts.listForTicket(ticket.key)
  return {
    ...toTicketDto(ticket, openArtifact(deps, ticket)),
    stages: await Promise.all(ARTIFACT_STAGES.map((stage) => stageView(deps, ticket, artifacts, stage))),
    log: deps.audit.listForTicket(ticket.key).map(toAuditEventDto),
    pendingQuestion: pendingQuestion(deps, ticket),
  }
}

/** Target repo, base branch and whether a token is configured — for the sidebar. */
export function getSettings(deps: UseCaseDeps): SettingsDto {
  return { repoUrl: deps.repoUrl, baseBranch: deps.baseBranch, tokenConfigured: deps.codeHost !== null }
}
