import { Octokit } from '@octokit/rest'
import { CodeHostError, type CodeHost, type PullRequest } from '../../ports'

export interface GitHubCodeHostOptions {
  /** `https://github.com/<owner>/<repo>`, optionally with `.git`. */
  repoUrl: string
  /** Fine-grained PAT with Contents and Pull requests: Read and write. */
  token: string
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch
}

const REPO_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/

export function parseGitHubRepoUrl(url: string): { owner: string; repo: string } {
  const match = REPO_URL_RE.exec(url.trim())
  if (!match) throw new Error(`TARGET_REPO ist keine GitHub-URL (https://github.com/<owner>/<repo>): ${url}`)
  return { owner: match[1]!, repo: match[2]! }
}

const STATUS_HINT: Record<number, string> = {
  401: 'GitHub lehnt das Token ab (401) — GITHUB_TOKEN prüfen.',
  403: 'Dem GitHub-Token fehlen Rechte (403) — nötig sind Contents und Pull requests, jeweils "Read and write".',
  404: 'Bei GitHub nicht gefunden (404) — TARGET_REPO und den Repo-Zugriff des Tokens prüfen.',
}

function statusOf(err: unknown): number {
  const status = (err as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : 0
}

function toCodeHostError(err: unknown, action: string): CodeHostError {
  const status = statusOf(err)
  const detail = err instanceof Error ? err.message : String(err)
  const hint = STATUS_HINT[status] ?? (status === 422 ? `GitHub lehnt die Anfrage ab (422): ${detail}` : `GitHub-Fehler: ${detail}`)
  return new CodeHostError(status, `${action}: ${hint}`)
}

interface GitHubPull {
  number: number
  html_url: string
  state: string
  merged_at: string | null
  head: { ref: string }
}

function toPullRequest(pr: GitHubPull): PullRequest {
  return {
    number: pr.number,
    url: pr.html_url,
    state: pr.merged_at ? 'merged' : pr.state === 'open' ? 'open' : 'closed',
    headBranch: pr.head.ref,
    mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
  }
}

/** CodeHost port backed by the GitHub REST API. */
export function createGitHubCodeHost(options: GitHubCodeHostOptions): CodeHost {
  const { owner, repo } = parseGitHubRepoUrl(options.repoUrl)
  const octokit = new Octokit({ auth: options.token, request: options.fetch ? { fetch: options.fetch } : undefined })
  let cachedDefaultBranch: string | null = null

  /** Runs one API step and turns every failure into a user-facing CodeHostError. */
  const step = async <T>(action: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      throw toCodeHostError(err, action)
    }
  }

  const defaultBranch = () =>
    step('Default-Branch lesen', async () => {
      cachedDefaultBranch ??= (await octokit.rest.repos.get({ owner, repo })).data.default_branch
      return cachedDefaultBranch
    })

  /** Content and blob sha of a file on `ref`; null if it does not exist. */
  const getFile = async (path: string, ref: string): Promise<{ content: string; sha: string } | null> => {
    try {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref })
      if (Array.isArray(data) || data.type !== 'file') return null
      return { content: Buffer.from(data.content, 'base64').toString('utf-8'), sha: data.sha }
    } catch (err) {
      if (statusOf(err) === 404) return null
      throw err
    }
  }

  return {
    defaultBranch,

    async readFile(path) {
      const ref = await defaultBranch()
      return step(`${path} lesen`, async () => (await getFile(path, ref))?.content ?? null)
    },

    async createBranch(name) {
      const base = await defaultBranch()
      await step(`Branch ${name} anlegen`, async () => {
        const { data } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${base}` })
        await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${name}`, sha: data.object.sha })
      })
    },

    async commitFile({ branch, path, content, message }) {
      await step(`${path} committen`, async () => {
        const existing = await getFile(path, branch)
        await octokit.rest.repos.createOrUpdateFileContents({
          owner, repo, path, branch, message,
          content: Buffer.from(content, 'utf-8').toString('base64'),
          sha: existing?.sha,
        })
      })
    },

    async openPullRequest({ branch, title, body }) {
      const base = await defaultBranch()
      return step(`PR für ${branch} öffnen`, async () =>
        toPullRequest((await octokit.rest.pulls.create({ owner, repo, head: branch, base, title, body })).data))
    },

    getPullRequest: (number) =>
      step(`PR #${number} lesen`, async () => toPullRequest((await octokit.rest.pulls.get({ owner, repo, pull_number: number })).data)),

    listOpenPullRequests: () =>
      step('Offene PRs lesen', async () =>
        (await octokit.rest.pulls.list({ owner, repo, state: 'open', per_page: 100 })).data.map(toPullRequest)),

    closePullRequest: (number) =>
      step(`PR #${number} schließen`, async () => {
        await octokit.rest.pulls.update({ owner, repo, pull_number: number, state: 'closed' })
      }),

    deleteBranch: (name) =>
      step(`Branch ${name} löschen`, async () => {
        try {
          await octokit.rest.git.deleteRef({ owner, repo, ref: `heads/${name}` })
        } catch (err) {
          // GitHub answers 422 (or 404) for a branch that does not exist.
          if (statusOf(err) !== 404 && statusOf(err) !== 422) throw err
        }
      }),
  }
}
