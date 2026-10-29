/** Local checkout of the target repository and the codebase summary the agent gets. */
export interface RepoProvider {
  /** Clones or updates the repository and returns the local checkout path. */
  ensureRepo(url: string): Promise<string>
  /** Returns a cached or freshly generated codebase summary, or null if unavailable. Never throws. */
  ensureSummary(repoDir: string, model: string, onProgress: (message: string) => void): Promise<string | null>
}
