import { Octokit } from '@octokit/rest'
import { WORK_DIR } from '../../domain/artifacts'
import { CodeHostError, type CodeHost, type PullRequest } from '../../ports'

export interface GitHubCodeHostOptions {
  /** `https://github.com/<owner>/<repo>`, optionally with `.git`. */
  repoUrl: string
  /** Fine-grained PAT with Contents and Pull requests: Read and write. */
  token: string
  /** Branch the app works on: content is read from it, app branches start from it, PRs target it. */
  baseBranch: string
  /** Tag marking the state `resetBaseBranch` moves the base branch back to. */
  baselineTag: string
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch
}

const REQUEST_TIMEOUT_MS = 15_000
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
/** GitHub's answer for a rejected request, e.g. a ref that already exists or a protected branch. */
const HTTP_UNPROCESSABLE = 422
const HTTP_TOO_MANY_REQUESTS = 429
/** Annotated tags may point to further tags; deeper chains are treated as broken. */
const MAX_TAG_DEPTH = 5
/** Messages of a rejected force-update: classic branch protection or a ruleset. */
const PROTECTED_RE = /protected|rule violation|force-push/i

const REPO_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/

/** Owner and repository name of a GitHub URL. @throws {Error} (German, shown at startup) for any other URL. */
export function parseGitHubRepoUrl(url: string): { owner: string; repo: string } {
  const match = REPO_URL_RE.exec(url.trim())
  if (!match) throw new Error(`TARGET_REPO ist keine GitHub-URL (https://github.com/<owner>/<repo>): ${url}`)
  return { owner: match[1]!, repo: match[2]! }
}

const STATUS_HINT: Record<number, string> = {
  [HTTP_UNAUTHORIZED]: 'GitHub lehnt das Token ab (401) — GITHUB_TOKEN prüfen.',
  [HTTP_FORBIDDEN]: 'Dem GitHub-Token fehlen Rechte (403) — nötig sind Contents und Pull requests, jeweils "Read and write".',
  [HTTP_NOT_FOUND]: 'Bei GitHub nicht gefunden (404) — TARGET_REPO und den Repo-Zugriff des Tokens prüfen.',
}

/** HTTP status of an Octokit error; 0 for errors without one (network, timeout). */
function statusOf(err: unknown): number {
  const status = (err as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : 0
}

/** German explanation of a failed GitHub request, with what the user can do about it. */
function hintFor(status: number, detail: string): string {
  const rateLimited = status === HTTP_TOO_MANY_REQUESTS || (status === HTTP_FORBIDDEN && /rate limit/i.test(detail))
  if (rateLimited) return 'GitHub-Rate-Limit erreicht — später erneut versuchen.'
  const known = STATUS_HINT[status]
  if (known) return known
  if (status === HTTP_UNPROCESSABLE) return `GitHub lehnt die Anfrage ab (422): ${detail}`
  return `GitHub-Fehler: ${detail}`
}

/** Wraps any failure of a GitHub step into a CodeHostError whose message names the step and a German hint. */
function toCodeHostError(err: unknown, action: string): CodeHostError {
  const status = statusOf(err)
  const detail = err instanceof Error ? err.message : String(err)
  return new CodeHostError(status, `${action}: ${hintFor(status, detail)}`)
}

interface GitHubPull {
  number: number
  html_url: string
  state: string
  merged_at: string | null
  head: { ref: string; repo?: { full_name: string } | null }
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
  const octokit = new Octokit({
    auth: options.token,
    // A hung connection must not block the start or a sync forever.
    request: {
      fetch: (url: string | URL | Request, init?: RequestInit) =>
        (options.fetch ?? fetch)(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    },
    // Every error becomes a CodeHostError; Octokit's own request logging would only duplicate it.
    log: { debug() {}, info() {}, warn: console.warn, error() {} },
  })
  let cachedDefaultBranch: string | null = null

  /** Runs one API step and turns every failure into a user-facing CodeHostError. */
  const step = async <T>(action: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      throw toCodeHostError(err, action)
    }
  }

  const { baseBranch, baselineTag } = options

  /** Default branch of the repository; only needed to place a missing baseline tag. */
  const defaultBranch = async () => {
    cachedDefaultBranch ??= (await octokit.rest.repos.get({ owner, repo })).data.default_branch
    return cachedDefaultBranch
  }

  /** Commit sha a ref points to; null if the ref does not exist. Annotated tags are resolved to their commit. */
  const commitOf = async (ref: string): Promise<string | null> => {
    let object: { sha: string; type: string }
    try {
      object = (await octokit.rest.git.getRef({ owner, repo, ref })).data.object
    } catch (err) {
      if (statusOf(err) === HTTP_NOT_FOUND) return null
      throw err
    }
    for (let depth = 0; object.type === 'tag'; depth++) {
      if (depth === MAX_TAG_DEPTH) throw new Error(`${ref} zeigt auf eine zu lange Kette von Tags`)
      object = (await octokit.rest.git.getTag({ owner, repo, tag_sha: object.sha })).data.object
    }
    return object.sha
  }

  /**
   * Creates `ref` on `sha` unless it exists. A 422 means someone created it meanwhile (e.g. a second start);
   * then the existing ref wins. Returns the commit of the ref and whether this call created it.
   */
  const ensureRef = async (ref: string, sha: string): Promise<{ sha: string; created: boolean }> => {
    try {
      await octokit.rest.git.createRef({ owner, repo, ref: `refs/${ref}`, sha })
      return { sha, created: true }
    } catch (err) {
      if (statusOf(err) !== HTTP_UNPROCESSABLE) throw err
      const existing = await commitOf(ref)
      if (existing === null) throw err
      return { sha: existing, created: false }
    }
  }

  /** True if the work directory (`docs/work`) exists on `ref`. */
  const hasWorkDir = async (ref: string): Promise<boolean> => {
    try {
      await octokit.rest.repos.getContent({ owner, repo, path: WORK_DIR, ref })
      return true
    } catch (err) {
      if (statusOf(err) === HTTP_NOT_FOUND) return false
      throw err
    }
  }

  /** Content and blob sha of a file on `ref`; null if it does not exist. */
  const getFile = async (path: string, ref: string): Promise<{ content: string; sha: string } | null> => {
    try {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref })
      if (Array.isArray(data) || data.type !== 'file') return null
      return { content: Buffer.from(data.content, 'base64').toString('utf-8'), sha: data.sha }
    } catch (err) {
      if (statusOf(err) === HTTP_NOT_FOUND) return null
      throw err
    }
  }

  return {
    baseBranch: async () => baseBranch,

    prepareBaseBranch: () =>
      step(`Branch ${baseBranch} vorbereiten`, async () => {
        let tagSha = await commitOf(`tags/${baselineTag}`)
        let createdTag = false
        if (tagSha === null) {
          const head = (await octokit.rest.git.getRef({ owner, repo, ref: `heads/${await defaultBranch()}` })).data.object.sha
          // Lightweight tag: a plain ref to the commit.
          const tag = await ensureRef(`tags/${baselineTag}`, head)
          tagSha = tag.sha
          createdTag = tag.created
        }
        let createdBranch = false
        if ((await commitOf(`heads/${baseBranch}`)) === null) {
          createdBranch = (await ensureRef(`heads/${baseBranch}`, tagSha)).created
        }
        const baselineHasWork = createdTag && (await hasWorkDir(baselineTag))
        return { createdTag, createdBranch, baselineHasWork }
      }),

    async resetBaseBranch() {
      const action = `Branch ${baseBranch} zurücksetzen`
      const sha = await step(action, () => commitOf(`tags/${baselineTag}`))
      if (sha === null) throw new CodeHostError(HTTP_NOT_FOUND, `${action}: Tag ${baselineTag} fehlt — beim nächsten Start legt die App ihn auf den Default-Branch.`)
      try {
        await octokit.rest.git.updateRef({ owner, repo, ref: `heads/${baseBranch}`, sha, force: true })
      } catch (err) {
        if (statusOf(err) === HTTP_UNPROCESSABLE && PROTECTED_RE.test(err instanceof Error ? err.message : '')) {
          throw new CodeHostError(HTTP_UNPROCESSABLE, `${action}: Branch-Schutz auf ${baseBranch} verhindert den Reset — Schutzregel in GitHub entfernen.`)
        }
        throw toCodeHostError(err, action)
      }
    },

    readFile: (path) => step(`${path} lesen`, async () => (await getFile(path, baseBranch))?.content ?? null),

    async createBranch(name) {
      await step(`Branch ${name} anlegen`, async () => {
        const { data } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${baseBranch}` })
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

    openPullRequest: ({ branch, title, body }) =>
      step(`PR für ${branch} öffnen`, async () =>
        toPullRequest((await octokit.rest.pulls.create({ owner, repo, head: branch, base: baseBranch, title, body })).data)),

    getPullRequest: (number) =>
      step(`PR #${number} lesen`, async () => toPullRequest((await octokit.rest.pulls.get({ owner, repo, pull_number: number })).data)),

    listOpenPullRequests: () =>
      step('Offene PRs lesen', async () =>
        (await octokit.paginate(octokit.rest.pulls.list, { owner, repo, state: 'open', per_page: 100 }))
          // PRs from forks may reuse our branch names; they are not ours to touch.
          .filter((p) => p.head.repo?.full_name === `${owner}/${repo}`)
          .map((p) => toPullRequest(p))),

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
          if (statusOf(err) !== HTTP_NOT_FOUND && statusOf(err) !== HTTP_UNPROCESSABLE) throw err
        }
      }),
  }
}
