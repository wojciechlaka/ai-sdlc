// Spec quality eval (spec of stage 2, §9): the real spec agent — same sandbox, skill and schema as the app
// (`STAGE_AGENTS.design` via `runAgent`) — writes a spec per case against the fixture repo `fixtures/articles-api`,
// started with 0 questions left. Fixed checks (no model) plus a judge model scoring the rubric of specRubric.ts.
// The printed report is German (it is read by the user like the rest of the app).
//
// Run: `npm run eval:spec` (repo root). Needs `claude login`, costs about 0.20–0.40 USD (Sonnet + Haiku).
// Not part of `npm test`. Models: `EVAL_MODEL` (spec agent, default Sonnet), `EVAL_JUDGE_MODEL` (judge, default
// Haiku); threshold: `EVAL_MIN_SCORE` (default 3). New case: add it to SPEC_CASES in specCases.ts.
import { execFileSync, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { SpecSchema, type Spec } from '@refinement/shared'
import { createAgentSandbox, createHookLogFile, hookSettings, sandboxEnv } from '../src/adapters/agentSandbox/agentSandbox'
import { STAGE_AGENTS, runAgent } from '../src/adapters/claudeCli'
import { extractJsonString } from '../src/adapters/claudeCli/agentOutput'
import { renderIntent, renderSpec } from '../src/domain/render'
import { artifactPath } from '../src/domain/artifacts'
import { describeError } from '../src/domain/errors'
import { FIXTURE_NAME, SPEC_CASES, type SpecEvalCase } from './specCases'
import {
  DEFAULT_MIN_SCORE, JudgeVerdictSchema, buildJudgePrompt, failedScores, fixedChecks, type CheckResult, type JudgeVerdict,
} from './specRubric'

const MODEL = process.env.EVAL_MODEL || 'claude-sonnet-4-6'
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || 'claude-haiku-4-5-20251001'
const MIN_SCORE = Number(process.env.EVAL_MIN_SCORE || DEFAULT_MIN_SCORE)
const AGENT_TIMEOUT_MS = 600_000
const JUDGE_TIMEOUT_MS = 180_000
const CORE_DIR = path.resolve(__dirname, '..')
const HOOKS_DIR = path.join(CORE_DIR, 'hooks')
const SKILLS_DIR = path.join(CORE_DIR, 'skills')
const FIXTURE_DIR = path.join(__dirname, 'fixtures', FIXTURE_NAME)
/**
 * The judge gets no tools: everything is in its prompt, and it reads untrusted spec text. Real isolation comes from
 * `--tools ''` (no built-in tools) and `--strict-mcp-config` (no MCP servers, e.g. from the user settings, as we pass
 * no --mcp-config). This deny list is only a backup, together with the guard hooks and an empty cwd.
 */
const JUDGE_DISALLOWED_TOOLS = 'Bash,Read,Glob,Grep,Edit,Write,NotebookEdit,WebFetch,WebSearch,Task'

/** Outcome of one case for the report. */
interface CaseReport {
  key: string
  checks: CheckResult[]
  verdict: JudgeVerdict | null
  costUsd: number
  seconds: number
}

/** Paths of the fixture repo, relative and `/`-separated. */
function listFiles(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    return entry.isDirectory() ? listFiles(path.join(dir, entry.name), relative) : [relative]
  })
}

/** Every fixture file with its content — the judge's view of the codebase. */
function fixtureOverview(files: string[]): string {
  return files.map((file) => `### ${file}\n\n${fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf-8').trim()}`).join('\n\n')
}

/** Temp git repo: the fixture plus the merged intent under `docs/work/<KEY>/intent.md`; realpath like the guard's. */
function createTempRepo(evalCase: SpecEvalCase, intentMarkdown: string): string {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'spec-eval-')))
  try {
    fs.cpSync(FIXTURE_DIR, repo, { recursive: true })
    const intentFile = path.join(repo, artifactPath(evalCase.key, 'plan'))
    fs.mkdirSync(path.dirname(intentFile), { recursive: true })
    fs.writeFileSync(intentFile, intentMarkdown)
    const git = (...args: string[]) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=eval', '-c', 'user.email=eval@example.com', ...args], { cwd: repo })
    git('init', '-q')
    git('add', '.')
    git('commit', '-qm', 'init')
    return repo
  } catch (err) {
    // The caller never receives the path of a half-built repo, so it must be removed here.
    fs.rmSync(repo, { recursive: true, force: true })
    throw err
  }
}

/** Runs the design agent like the app does, with no questions left; returns its spec or null plus the cost. */
async function runSpecAgent(evalCase: SpecEvalCase, repo: string, intentMarkdown: string): Promise<{ spec: Spec | null; detail: string; costUsd: number }> {
  const sandbox = createAgentSandbox({ hooksDir: HOOKS_DIR })
  try {
    const { output, meta } = await runAgent({
      ticketKey: evalCase.key, stage: 'design', title: evalCase.title, description: evalCase.description,
      repoDir: repo, model: MODEL, intent: intentMarkdown, answeredQuestions: [], questionsRemaining: 0,
    }, { onProgress: () => {}, onToolEvent: () => {} }, { skillsDir: SKILLS_DIR, sandbox, timeoutMs: AGENT_TIMEOUT_MS })
    if (output.type !== 'spec') {
      return { spec: null, detail: `Agent lieferte „${output.type}“ statt einer Spec`, costUsd: meta.costUsd }
    }
    return { spec: SpecSchema.parse(output.result), detail: 'Spec geliefert', costUsd: meta.costUsd }
  } catch (err) {
    return { spec: null, detail: describeError(err), costUsd: 0 }
  }
}

/** Calls the judge model without tools; returns its verdict (or the error), its cost and whether it used tools. */
async function judge(prompt: string): Promise<{ verdict: JudgeVerdict | null; detail: string; costUsd: number; toolCalls: number }> {
  let cwd: string | undefined
  let hookLog: Awaited<ReturnType<typeof createHookLogFile>> | undefined
  try {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-judge-'))
    hookLog = await createHookLogFile()
    const args = [
      '--print', '--output-format', 'json', '--model', JUDGE_MODEL,
      '--setting-sources', 'user', '--settings', hookSettings(HOOKS_DIR), '--disallowedTools', JUDGE_DISALLOWED_TOOLS,
      '--tools', '', '--strict-mcp-config',
    ]
    const proc = spawnSync('claude', args, { cwd, env: sandboxEnv(process.env, hookLog.path), input: prompt, encoding: 'utf-8', timeout: JUDGE_TIMEOUT_MS })
    const toolCalls = fs.readFileSync(hookLog.path, 'utf-8').split('\n').filter(Boolean).length
    let result: { result?: string; total_cost_usd?: number; is_error?: boolean }
    try {
      result = JSON.parse(proc.stdout ?? '') as typeof result
    } catch {
      return { verdict: null, detail: `Bewerter ohne gültige Ausgabe: ${[proc.error?.message, (proc.stderr ?? '').slice(0, 300)].filter(Boolean).join(' · ')}`, costUsd: 0, toolCalls }
    }
    const parsed = JudgeVerdictSchema.safeParse(safeJson(extractJsonString(result.result ?? '')))
    const costUsd = result.total_cost_usd ?? 0
    if (result.is_error || !parsed.success) {
      return { verdict: null, detail: `Bewertung unlesbar: ${(result.result ?? '').slice(0, 300)}`, costUsd, toolCalls }
    }
    return { verdict: parsed.data, detail: 'bewertet', costUsd, toolCalls }
  } finally {
    if (cwd) {
      fs.rmSync(cwd, { recursive: true, force: true })
    }
    await hookLog?.cleanup()
  }
}

/** JSON.parse that returns undefined instead of throwing (the schema check reports the failure). */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

async function runCase(evalCase: SpecEvalCase, files: string[]): Promise<CaseReport> {
  const started = Date.now()
  const ticket = { key: evalCase.key, sourcePath: `examples/tickets/${evalCase.key.toLowerCase()}.md` }
  const intentMarkdown = renderIntent(ticket, evalCase.intent, [])
  let repo: string | undefined
  try {
    repo = createTempRepo(evalCase, intentMarkdown)
    const agent = await runSpecAgent(evalCase, repo, intentMarkdown)
    const checks: CheckResult[] = [{ name: 'Spec direkt geliefert (Schema)', pass: agent.spec !== null, detail: agent.detail }]
    if (!agent.spec) {
      return { key: evalCase.key, checks, verdict: null, costUsd: agent.costUsd, seconds: Math.round((Date.now() - started) / 1000) }
    }
    checks.push(...fixedChecks(agent.spec, evalCase.intent, new Set(files)))
    const specMarkdown = renderSpec(ticket, agent.spec, [])
    const judged = await judge(buildJudgePrompt({ intentMarkdown, specMarkdown, fixtureOverview: fixtureOverview(files) }))
    checks.push({ name: 'Bewertung gelesen', pass: judged.verdict !== null, detail: judged.detail })
    checks.push({ name: 'Bewerter ohne Werkzeuge', pass: judged.toolCalls === 0, detail: `${judged.toolCalls} Aufrufe` })
    return {
      key: evalCase.key, checks, verdict: judged.verdict,
      costUsd: agent.costUsd + judged.costUsd, seconds: Math.round((Date.now() - started) / 1000),
    }
  } finally {
    if (repo) {
      fs.rmSync(repo, { recursive: true, force: true })
    }
  }
}

/** Fits a report cell: passing rows are shortened, failed ones stay complete. */
function cell(text: string, pass: boolean): string {
  return (pass ? text.slice(0, 60) : text).padEnd(62)
}

/** Prints the German report of one case; returns the number of failed checks and scores. */
function printCase(report: CaseReport): number {
  console.log(`\n${report.key} · ${report.seconds} s · ${report.costUsd.toFixed(4)} USD`)
  for (const check of report.checks) {
    console.log(`  ${check.name.padEnd(36)}${cell(check.detail, check.pass)}${check.pass ? '✓' : '✗'}`)
  }
  const failedChecks = report.checks.filter((check) => !check.pass).length
  if (!report.verdict) {
    return failedChecks
  }
  const failed = failedScores(report.verdict, MIN_SCORE)
  for (const score of report.verdict.scores) {
    const pass = score.score >= MIN_SCORE
    console.log(`  ${`Bewertung ${score.criterion}`.padEnd(36)}${cell(`${score.score}/5 — ${score.reason}`, pass)}${pass ? '✓' : '✗'}`)
  }
  for (const entry of report.verdict.coverage) {
    console.log(`    ${entry.successCriterion} → ${entry.acceptanceCriteria.join(' | ') || '—'}`)
  }
  return failedChecks + failed.length
}

async function main(): Promise<number> {
  const files = listFiles(FIXTURE_DIR)
  console.log(`Spec-Eval · Agent ${MODEL} (${STAGE_AGENTS.design.skillFile}) · Bewerter ${JUDGE_MODEL} · Schwelle ${MIN_SCORE}/5`)
  let failures = 0
  let totalCost = 0
  const started = Date.now()
  for (const evalCase of SPEC_CASES) {
    const report = await runCase(evalCase, files)
    failures += printCase(report)
    totalCost += report.costUsd
  }
  console.log(`\nGesamt: ${totalCost.toFixed(4)} USD · ${Math.round((Date.now() - started) / 1000)} s`)
  if (failures > 0) {
    console.log(`${failures} Prüfung(en) oder Bewertung(en) fehlgeschlagen.`)
    return 1
  }
  console.log('Alle Prüfungen bestanden.')
  return 0
}

main().then((code) => {
  process.exitCode = code
}, (err: unknown) => {
  console.error(`Eval abgebrochen: ${describeError(err)}`)
  process.exitCode = 1
})
