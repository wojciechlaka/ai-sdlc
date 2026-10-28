import type { PrState } from '../domain/types'

export interface PullRequest {
  number: number
  url: string
  state: PrState
  headBranch: string
  mergedAt: Date | null
}

/**
 * The target repository on its Git host (GitHub). All writes need a token.
 * The app works against a configured base branch (`showcase`), not the repository's default branch;
 * a baseline tag (`showcase-base`) marks the state the base branch is reset to.
 */
export interface CodeHost {
  /** Name of the base branch. */
  baseBranch(): Promise<string>
  /**
   * Creates what is missing: the baseline tag on the head of the repository's default branch,
   * then the base branch on the tag. Reports what was created.
   */
  prepareBaseBranch(): Promise<{ createdTag: boolean; createdBranch: boolean }>
  /** Force-moves the base branch to the commit of the baseline tag. Other branches stay untouched. */
  resetBaseBranch(): Promise<void>
  /** Content of a file on the base branch; null if it does not exist. */
  readFile(path: string): Promise<string | null>
  /** Creates `name` from the head of the base branch. */
  createBranch(name: string): Promise<void>
  /** Creates or overwrites one file on `branch` in a single commit. */
  commitFile(input: { branch: string; path: string; content: string; message: string }): Promise<void>
  /** Opens a PR from `branch` against the base branch. */
  openPullRequest(input: { branch: string; title: string; body: string }): Promise<PullRequest>
  getPullRequest(number: number): Promise<PullRequest>
  /** Open PRs of the repository. */
  listOpenPullRequests(): Promise<PullRequest[]>
  closePullRequest(number: number): Promise<void>
  /** Deletes a branch; a missing branch is not an error. */
  deleteBranch(name: string): Promise<void>
}

/** A request to the code host failed. `status` is the HTTP status, 0 without response. Message is user-facing. */
export class CodeHostError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'CodeHostError'
  }
}
