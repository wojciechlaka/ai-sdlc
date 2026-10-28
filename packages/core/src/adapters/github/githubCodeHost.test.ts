import { describe, it, expect } from 'vitest'
import { createGitHubCodeHost, parseGitHubRepoUrl } from './githubCodeHost'

interface Route { status: number; body?: unknown }
interface Call { method: string; path: string; rawPath: string; query: string; body: unknown }

/** Minimal GitHub REST stand-in for Octokit's injectable fetch. Unknown routes answer 404. */
function fakeGitHub(routes: Record<string, Route>) {
  const calls: Call[] = []
  const inits: (RequestInit | undefined)[] = []
  const fetchFn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = decodeURIComponent(url.pathname)
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    inits.push(init)
    calls.push({ method, path, rawPath: url.pathname, query: url.search, body })
    const route = routes[`${method} ${path}`] ?? { status: 404, body: { message: 'Not Found' } }
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
      status: route.status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
  return { fetch: fetchFn as typeof fetch, calls, inits }
}

const REPO_ROUTE = { 'GET /repos/o/r': { status: 200, body: { default_branch: 'master' } } }

function setup(routes: Record<string, Route> = {}) {
  const gh = fakeGitHub({ ...REPO_ROUTE, ...routes })
  const codeHost = createGitHubCodeHost({ repoUrl: 'https://github.com/o/r', token: 't', fetch: gh.fetch })
  return { gh, codeHost }
}

const base64 = (text: string) => Buffer.from(text, 'utf-8').toString('base64')
const INTENT_PATH = 'docs/work/CB-1/intent.md'
const pr = (patch: Record<string, unknown> = {}) => ({
  number: 7, html_url: 'https://github.com/o/r/pull/7', state: 'open', merged_at: null, head: { ref: 'CB-1/intent', repo: { full_name: 'o/r' } }, ...patch,
})

describe('request timeout', () => {
  it('passes an abort signal with every request', async () => {
    const { gh, codeHost } = setup()
    await codeHost.baseBranch()
    expect(gh.inits.length).toBeGreaterThan(0)
    expect(gh.inits.every((init) => init?.signal instanceof AbortSignal)).toBe(true)
  })
})

describe('parseGitHubRepoUrl', () => {
  it('reads owner and repo', () => {
    expect(parseGitHubRepoUrl('https://github.com/o/r')).toEqual({ owner: 'o', repo: 'r' })
    expect(parseGitHubRepoUrl('https://github.com/o/r.git')).toEqual({ owner: 'o', repo: 'r' })
  })

  it('rejects other hosts', () => {
    expect(() => parseGitHubRepoUrl('https://gitlab.com/o/r')).toThrow('TARGET_REPO')
  })
})

describe('reading', () => {
  it('reads a file from the default branch', async () => {
    const { gh, codeHost } = setup({
      [`GET /repos/o/r/contents/${INTENT_PATH}`]: { status: 200, body: { type: 'file', encoding: 'base64', content: base64('# Intent'), sha: 's1' } },
    })
    expect(await codeHost.readFile(INTENT_PATH)).toBe('# Intent')
    expect(gh.calls.find((c) => c.path.includes('/contents/'))?.query).toBe('?ref=master')
  })

  it('returns null for missing files and asks for the default branch only once', async () => {
    const { gh, codeHost } = setup()
    expect(await codeHost.readFile('a.md')).toBeNull()
    expect(await codeHost.readFile('b.md')).toBeNull()
    expect(gh.calls.filter((c) => c.path === '/repos/o/r')).toHaveLength(1)
  })
})

describe('writing', () => {
  it('creates a branch from the head of the default branch', async () => {
    const { gh, codeHost } = setup({
      'GET /repos/o/r/git/ref/heads/master': { status: 200, body: { object: { sha: 'abc' } } },
      'POST /repos/o/r/git/refs': { status: 201, body: { ref: 'refs/heads/CB-1/intent' } },
    })
    await codeHost.createBranch('CB-1/intent')
    expect(gh.calls.find((c) => c.method === 'POST')?.body).toEqual({ ref: 'refs/heads/CB-1/intent', sha: 'abc' })
  })

  it('commits a new file without sha and an existing one with its sha', async () => {
    const created = setup({ [`PUT /repos/o/r/contents/${INTENT_PATH}`]: { status: 201, body: { content: {} } } })
    await created.codeHost.commitFile({ branch: 'CB-1/intent', path: INTENT_PATH, content: '# x', message: 'CB-1: Intent' })
    expect(created.gh.calls.find((c) => c.method === 'PUT')?.body).toEqual({
      message: 'CB-1: Intent', content: base64('# x'), branch: 'CB-1/intent',
    })

    const updated = setup({
      [`GET /repos/o/r/contents/${INTENT_PATH}`]: { status: 200, body: { type: 'file', encoding: 'base64', content: base64('old'), sha: 's1' } },
      [`PUT /repos/o/r/contents/${INTENT_PATH}`]: { status: 200, body: { content: {} } },
    })
    await updated.codeHost.commitFile({ branch: 'CB-1/intent', path: INTENT_PATH, content: '# x', message: 'm' })
    expect(updated.gh.calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ sha: 's1' })
    expect(decodeURIComponent(updated.gh.calls.find((c) => c.method === 'GET' && c.path.includes('/contents/'))?.query ?? '')).toBe('?ref=CB-1/intent')
  })

  it('opens a PR against the default branch', async () => {
    const { gh, codeHost } = setup({ 'POST /repos/o/r/pulls': { status: 201, body: pr() } })
    expect(await codeHost.openPullRequest({ branch: 'CB-1/intent', title: 'CB-1: Intent', body: 'b' })).toEqual({
      number: 7, url: 'https://github.com/o/r/pull/7', state: 'open', headBranch: 'CB-1/intent', mergedAt: null,
    })
    expect(gh.calls.find((c) => c.method === 'POST')?.body).toEqual({ head: 'CB-1/intent', base: 'master', title: 'CB-1: Intent', body: 'b' })
  })

  it('closes PRs and deletes branches; a missing branch is fine', async () => {
    const { gh, codeHost } = setup({
      'PATCH /repos/o/r/pulls/7': { status: 200, body: pr({ state: 'closed' }) },
      'DELETE /repos/o/r/git/refs/heads/CB-1/intent': { status: 204 },
      'DELETE /repos/o/r/git/refs/heads/CB-2/intent': { status: 422, body: { message: 'Reference does not exist' } },
    })
    await codeHost.closePullRequest(7)
    await codeHost.deleteBranch('CB-1/intent')
    await codeHost.deleteBranch('CB-2/intent')
    await codeHost.deleteBranch('CB-3/intent') // 404
    expect(gh.calls.find((c) => c.method === 'DELETE')?.rawPath).toBe('/repos/o/r/git/refs/heads%2FCB-1%2Fintent')
    expect(gh.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ state: 'closed' })
  })
})

describe('pull requests', () => {
  it('maps merged, closed and open PRs', async () => {
    const { codeHost } = setup({
      'GET /repos/o/r/pulls/7': { status: 200, body: pr({ state: 'closed', merged_at: '2026-10-28T12:00:00Z' }) },
      'GET /repos/o/r/pulls/8': { status: 200, body: pr({ number: 8, state: 'closed' }) },
    })
    expect(await codeHost.getPullRequest(7)).toMatchObject({ state: 'merged', mergedAt: new Date('2026-10-28T12:00:00Z') })
    expect(await codeHost.getPullRequest(8)).toMatchObject({ state: 'closed', mergedAt: null })
  })

  it('lists open PRs with their head branch', async () => {
    const { gh, codeHost } = setup({
      'GET /repos/o/r/pulls': { status: 200, body: [pr(), pr({ number: 8, head: { ref: 'feature/x', repo: { full_name: 'o/r' } } })] },
    })
    expect((await codeHost.listOpenPullRequests()).map((p) => p.headBranch)).toEqual(['CB-1/intent', 'feature/x'])
    expect(gh.calls.find((c) => c.path === '/repos/o/r/pulls')?.query).toContain('state=open')
  })

  it('ignores PRs whose head lives in another repository (forks)', async () => {
    const { codeHost } = setup({
      'GET /repos/o/r/pulls': {
        status: 200,
        body: [
          pr({ number: 9, head: { ref: 'CB-1/intent', repo: { full_name: 'fork/r' } } }),
          pr({ number: 10, head: { ref: 'CB-1/intent', repo: null } }),
          pr({ number: 11 }),
        ],
      },
    })
    expect((await codeHost.listOpenPullRequests()).map((p) => p.number)).toEqual([11])
  })
})

describe('errors', () => {
  it('reports rate limits', async () => {
    const { codeHost } = setup({ 'GET /repos/o/r/pulls': { status: 403, body: { message: 'API rate limit exceeded for user' } } })
    await expect(codeHost.listOpenPullRequests()).rejects.toMatchObject({ status: 403, message: expect.stringContaining('Rate-Limit') })
  })

  it('turns HTTP errors into CodeHostError with a helpful message', async () => {
    const { codeHost } = setup({ 'POST /repos/o/r/pulls': { status: 403, body: { message: 'Resource not accessible by personal access token' } } })
    await expect(codeHost.openPullRequest({ branch: 'CB-1/intent', title: 't', body: 'b' })).rejects.toMatchObject({
      name: 'CodeHostError',
      status: 403,
      message: expect.stringContaining('Pull requests'),
    })
  })

  it('reports a wrong token', async () => {
    const { codeHost } = setup({ 'GET /repos/o/r/pulls': { status: 401, body: { message: 'Bad credentials' } } })
    await expect(codeHost.listOpenPullRequests()).rejects.toMatchObject({ status: 401, message: expect.stringContaining('GITHUB_TOKEN') })
  })
})
