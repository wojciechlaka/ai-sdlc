import { describe, it, expect, afterEach } from 'vitest'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createAgentSandbox, hookSettings, sandboxEnv } from './agentSandbox'

const HOOKS_DIR = path.resolve(__dirname, '../../../hooks')
const BLOCKED_CALL = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: '/repo' })

const tempDirs: string[] = []
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

/** Runs a hook command the way Claude Code does: `/bin/sh -c <command>` with the hook input on stdin. */
function runThroughShell(command: string, input = BLOCKED_CALL) {
  return spawnSync('/bin/sh', ['-c', command], { input, env: { PATH: process.env.PATH }, encoding: 'utf-8' })
}

const guardCommand = (hooksDir: string) => JSON.parse(hookSettings(hooksDir)).hooks.PreToolUse[0].hooks[0].command as string

describe('createAgentSandbox', () => {
  it('loads only user settings, sets the hooks and allows only read-only tools', () => {
    const { args } = createAgentSandbox({ hooksDir: HOOKS_DIR })
    const after = (flag: string) => args[args.indexOf(flag) + 1]
    expect(after('--setting-sources')).toBe('user')
    expect(after('--allowedTools')).toBe('Read,Glob,Grep,Bash')
    const settings = JSON.parse(after('--settings')!)
    expect(settings.hooks.PreToolUse).toEqual([{ matcher: '', hooks: [{ type: 'command', timeout: 10, command: expect.stringContaining(path.join(HOOKS_DIR, 'guard.mjs')) }] }])
    expect(settings.hooks.PostToolUse).toEqual([{ matcher: '', hooks: [{ type: 'command', timeout: 10, command: expect.stringContaining(path.join(HOOKS_DIR, 'audit.mjs')) }] }])
  })

  it('builds the headless stream-json call with the model and the sandbox flags', () => {
    const sandbox = createAgentSandbox({ hooksDir: HOOKS_DIR })
    expect(sandbox.claudeArgs('claude-haiku')).toEqual([
      '--print', '--output-format', 'stream-json', '--verbose', '--model', 'claude-haiku', ...sandbox.args,
    ])
  })
})

describe('sandboxEnv', () => {
  it('passes only allowlisted variables, no app secrets', () => {
    const env = sandboxEnv({
      PATH: '/bin', HOME: '/home/u', USER: 'u', LANG: 'de_DE.UTF-8', TMPDIR: '/tmp', SHELL: '/bin/zsh',
      ANTHROPIC_API_KEY: 'sk', CLAUDE_CONFIG_DIR: '/c', CLAUDE_CODE_USE_BEDROCK: '1', HTTPS_PROXY: 'http://proxy',
      GITHUB_TOKEN: 'ghp_secret', DB_PATH: '/db', TARGET_REPO: 'x', GIT_PAGER: 'sh', NODE_OPTIONS: '--require x',
      OPENAI_API_KEY: 'o', NPM_TOKEN: 'n', REPO_CACHE_DIR: '/c', AWS_DEFAULT_OUTPUT: 'json', ANTHROPIC_MODEL: undefined,
    }, '/tmp/log.jsonl')
    expect(env).toEqual({
      PATH: '/bin', HOME: '/home/u', USER: 'u', LANG: 'de_DE.UTF-8', TMPDIR: '/tmp', SHELL: '/bin/zsh',
      ANTHROPIC_API_KEY: 'sk', CLAUDE_CONFIG_DIR: '/c', CLAUDE_CODE_USE_BEDROCK: '1', HTTPS_PROXY: 'http://proxy',
      REFINEMENT_HOOK_LOG: '/tmp/log.jsonl', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    })
  })

  it('passes gateway, Bedrock and Vertex AI credentials when set', () => {
    const provider = {
      ANTHROPIC_BASE_URL: 'https://gw', ANTHROPIC_AUTH_TOKEN: 't', ANTHROPIC_CUSTOM_HEADERS: 'X-A: 1', ANTHROPIC_MODEL: 'm',
      CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_USE_VERTEX: '1', AWS_REGION: 'eu-central-1', AWS_PROFILE: 'p',
      AWS_ACCESS_KEY_ID: 'k', AWS_SECRET_ACCESS_KEY: 's', AWS_SESSION_TOKEN: 'st', CLOUD_ML_REGION: 'europe-west1',
      ANTHROPIC_VERTEX_PROJECT_ID: 'proj', GOOGLE_APPLICATION_CREDENTIALS: '/gcp.json',
    }
    expect(sandboxEnv({ ...provider, GITHUB_TOKEN: 'ghp' }, '/l')).toEqual({
      ...provider, REFINEMENT_HOOK_LOG: '/l', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    })
    expect(sandboxEnv({}, '/l')).toEqual({ REFINEMENT_HOOK_LOG: '/l', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' })
  })

  it('reads the process environment when none is given', () => {
    const sandbox = createAgentSandbox({ hooksDir: HOOKS_DIR })
    const env = sandbox.env('/tmp/x.jsonl')
    expect(env.PATH).toBe(process.env.PATH)
    expect(env).not.toHaveProperty('GITHUB_TOKEN')
  })
})

describe('guard command via /bin/sh (fail closed)', () => {
  it('denies with the real guard', () => {
    const result = runThroughShell(guardCommand(HOOKS_DIR))
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe('deny')
  })

  it('exits with code 2 (blocking) when the script is missing', () => {
    const result = runThroughShell(guardCommand(path.join(os.tmpdir(), 'gibt-es-nicht')))
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Guard nicht ausführbar')
  })

  it('denies when the policy cannot be loaded', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broken-hooks-'))
    tempDirs.push(dir)
    for (const file of ['guard.mjs', 'hookIo.mjs']) fs.copyFileSync(path.join(HOOKS_DIR, file), path.join(dir, file))
    fs.writeFileSync(path.join(dir, 'guardPolicy.mjs'), 'export const = kaputt')
    const allowedCall = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'a' }, cwd: dir })
    const result = runThroughShell(guardCommand(dir), allowedCall)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).hookSpecificOutput).toMatchObject({ permissionDecision: 'deny', permissionDecisionReason: expect.stringContaining('Guard-Fehler') })
  })

  it('denies when hookIo is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broken-hooks-'))
    tempDirs.push(dir)
    fs.copyFileSync(path.join(HOOKS_DIR, 'guard.mjs'), path.join(dir, 'guard.mjs'))
    const result = runThroughShell(guardCommand(dir))
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).hookSpecificOutput).toMatchObject({ permissionDecision: 'deny', permissionDecisionReason: expect.stringContaining('Guard-Fehler') })
  })
})
