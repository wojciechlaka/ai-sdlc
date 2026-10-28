import type { ArtifactStage } from './types'
import { TICKET_KEY_PATTERN } from './ticketKey'

/** Stages that produce an artifact in the target repo. */
export const ARTIFACT_STAGES: readonly ArtifactStage[] = ['plan', 'design']

const FILE_NAME: Record<ArtifactStage, string> = { plan: 'intent', design: 'spec' }
const LABEL: Record<ArtifactStage, string> = { plan: 'Intent', design: 'Spec' }
const APP_BRANCH_RE = new RegExp(`^(${TICKET_KEY_PATTERN})/(intent|spec)$`)

/** `docs/work/CB-3/intent.md` */
export function artifactPath(key: string, stage: ArtifactStage): string {
  return `docs/work/${key}/${FILE_NAME[stage]}.md`
}

/** `CB-3/intent` — one branch per ticket and stage. */
export function branchName(key: string, stage: ArtifactStage): string {
  return `${key}/${FILE_NAME[stage]}`
}

/** `CB-3: Intent` — PR title and commit message. */
export function artifactTitle(key: string, stage: ArtifactStage): string {
  return `${key}: ${LABEL[stage]}`
}

/** Link to a file on `branch`. */
export function fileUrl(repoUrl: string, branch: string, path: string): string {
  const base = repoUrl.trim().replace(/\/+$/, '').replace(/\.git$/, '')
  return `${base}/blob/${branch}/${path}`
}

/** Recognises a branch the app created for one of the known tickets; null for every other branch. */
export function parseAppBranch(
  branch: string,
  knownKeys: ReadonlySet<string>,
): { key: string; stage: ArtifactStage } | null {
  const match = APP_BRANCH_RE.exec(branch)
  if (!match || !knownKeys.has(match[1]!)) return null
  return { key: match[1]!, stage: match[2] === 'intent' ? 'plan' : 'design' }
}
