import { WORK_DIR } from '../domain/artifacts'
import { CodeHostError, type BaseBranchPreparation, type CodeHost, type PullRequest } from '../ports'
import { TEST_REPO_URL } from './samples'

type CodeHostMethod = keyof CodeHost

function toPullRequest(pr: PullRequest): PullRequest {
  return { number: pr.number, url: pr.url, state: pr.state, headBranch: pr.headBranch, mergedAt: pr.mergedAt }
}

/** A PR of the fake code host, with the title and body the app sent. */
export interface FakePullRequest extends PullRequest {
  title: string
  body: string
}

/**
 * In-memory GitHub: the default branch, the baseline tag, the base branch the app works on,
 * app branches with their files, PRs.
 */
export class FakeCodeHost implements CodeHost {
  /** Name `baseBranch()` returns. */
  baseBranchName = 'showcase'
  /** Tag name used in error messages. */
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
  /** Every PR ever opened, with title and body for assertions. */
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
