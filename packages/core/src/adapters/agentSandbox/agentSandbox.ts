import path from 'path'
import type { ClaudeProcessSandbox } from '../../ports'

// Sandbox of every `claude` process the app starts (agent and codebase summary, spec §13): which settings are
// loaded, which hooks guard the tools, which tools are allowed and which environment the process sees.
// Built once in compose.ts and handed to the adapters that spawn `claude`, so the rules live in one place.

/** Environment variable the hook scripts write their JSON lines to (see `hooks/hookIo.mjs`). */
export const HOOK_LOG_ENV = 'REFINEMENT_HOOK_LOG'
/** Read-only tools; the guard additionally confines them to the clone and restricts Bash to reading git commands. */
export const ALLOWED_TOOLS = 'Read,Glob,Grep,Bash'
/** Seconds Claude Code waits for a hook; the scripts need milliseconds. */
const HOOK_TIMEOUT_SECONDS = 10

/** Variables the `claude` process may see; everything else (GITHUB_TOKEN, DB_PATH, …) stays in the app. */
const ENV_ALLOWLIST = new Set([
  'PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR', 'SHELL',
  // Claude login and configuration (Anthropic API, gateway, Bedrock, Vertex AI); CLAUDE_CODE_* below.
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_CUSTOM_HEADERS', 'ANTHROPIC_MODEL',
  'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX',
  'AWS_REGION', 'AWS_PROFILE', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
  'CLOUD_ML_REGION', 'ANTHROPIC_VERTEX_PROJECT_ID', 'GOOGLE_APPLICATION_CREDENTIALS',
  // Reaching the Anthropic API behind a corporate proxy.
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS',
])
const ENV_ALLOWED_PREFIX = 'CLAUDE_CODE_'

/** Quotes a value for `/bin/sh -c` (Claude Code runs hook commands through the shell). */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * The `--settings` JSON: guard before and audit after every tool call (empty matcher = all tools).
 * The guard fails closed: if node or the script cannot run, the shell fallback exits with 2, which blocks the call.
 * @param hooksDir - Absolute path to `packages/core/hooks`.
 * @param nodePath - Node binary; the one running the app by default.
 */
export function hookSettings(hooksDir: string, nodePath = process.execPath): string {
  const script = (name: string) => `${shellQuote(nodePath)} ${shellQuote(path.join(/*turbopackIgnore: true*/ hooksDir, name))}`
  const hook = (command: string) => [{ matcher: '', hooks: [{ type: 'command', command, timeout: HOOK_TIMEOUT_SECONDS }] }]
  return JSON.stringify({
    hooks: {
      PreToolUse: hook(`${script('guard.mjs')} || { echo 'Guard nicht ausführbar' >&2; exit 2; }`),
      PostToolUse: hook(script('audit.mjs')),
    },
  })
}

/**
 * Environment of a `claude` process: only allowlisted variables of `baseEnv`, plus the hook log and git without
 * global or system configuration (the clone's `.git/config` is written by the app).
 */
export function sandboxEnv(baseEnv: NodeJS.ProcessEnv, logFile: string): NodeJS.ProcessEnv {
  // Built from scratch on purpose; the cast only drops type augmentations (e.g. Next.js requires NODE_ENV).
  const env = {} as NodeJS.ProcessEnv
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined && (ENV_ALLOWLIST.has(key) || key.startsWith(ENV_ALLOWED_PREFIX))) env[key] = value
  }
  env[HOOK_LOG_ENV] = logFile
  env.GIT_CONFIG_NOSYSTEM = '1'
  env.GIT_CONFIG_GLOBAL = '/dev/null'
  return env
}

/** Flags of a headless `claude` call whose stream-json output the adapters parse line by line. */
const HEADLESS_ARGS = ['--print', '--output-format', 'stream-json', '--verbose']

/**
 * Sandbox for the `claude` processes of the app. `--setting-sources user` keeps project and local settings of the
 * untrusted clone (`.claude/settings*.json`, including their hooks) from being loaded.
 */
export function createAgentSandbox(options: { hooksDir: string }): ClaudeProcessSandbox {
  const args = Object.freeze([
    '--setting-sources', 'user',
    '--settings', hookSettings(options.hooksDir),
    '--allowedTools', ALLOWED_TOOLS,
  ])
  return {
    args,
    env: (logFile) => sandboxEnv(process.env, logFile),
    claudeArgs: (model) => [...HEADLESS_ARGS, '--model', model, ...args],
  }
}
