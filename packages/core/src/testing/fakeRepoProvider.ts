import type { RepoProvider } from '../ports'

/** Repo provider without git: returns `repoDir` and `summary`; `ensureRepoError` makes `ensureRepo` fail. */
export class FakeRepoProvider implements RepoProvider {
  /** Path `ensureRepo` returns. */
  repoDir = '/repo'
  /** What `ensureSummary` returns. */
  summary: string | null = null
  /** Thrown by `ensureRepo` when set. */
  ensureRepoError: Error | null = null
  /** URLs passed to `ensureRepo`, in order. */
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
