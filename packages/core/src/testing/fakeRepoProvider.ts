import type { RepoProvider } from '../ports'

/** Repo provider without git: returns `repoDir` and `summary`; `ensureRepoError` makes `ensureRepo` fail. */
export class FakeRepoProvider implements RepoProvider {
  repoDir = '/repo'
  summary: string | null = null
  ensureRepoError: Error | null = null
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
