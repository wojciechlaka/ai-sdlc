// Guard policy for the Claude agent (spec §13): the agent may only read inside the clone.
// Pure functions without I/O — used by guard.mjs (PreToolUse) and audit.mjs (PostToolUse).
// Plain Node ESM, no dependencies: the hook scripts run as standalone `node` processes.
// To change what the agent may do, edit the lists below and the table tests in guardPolicy.test.ts.

/**
 * @typedef {{ tool_name?: unknown, tool_input?: unknown, cwd?: unknown }} HookToolCall
 * @typedef {{ allow: true } | { allow: false, reason: string }} Decision
 */

/** Tools the agent may use without further checks. `Bash` is checked command by command. */
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep'])

/** Commands that only read. Some have extra checks in `checkCommand`. */
const READ_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find', 'tree', 'pwd', 'file', 'stat', 'du',
  'sort', 'uniq', 'cut', 'awk', 'sed', 'jq', 'git',
])

const GIT_READ_SUBCOMMANDS = new Set([
  'log', 'show', 'diff', 'status', 'ls-files', 'blame', 'grep', 'branch', 'rev-parse', 'cat-file',
])

const NETWORK_COMMANDS = new Set(['curl', 'wget', 'nc', 'ncat', 'netcat', 'ssh', 'scp', 'sftp', 'rsync', 'ftp', 'telnet'])

const INTERPRETERS = new Set([
  'npm', 'npx', 'yarn', 'pnpm', 'bun', 'deno', 'node', 'python', 'python3', 'pip', 'pip3', 'ruby', 'perl', 'php',
  'sh', 'bash', 'zsh', 'dash', 'fish', 'eval', 'exec', 'source', '.',
])

/** `find` actions that delete, execute or write files. */
const FIND_FORBIDDEN = new Set(['-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint', '-fprint0', '-fprintf', '-fls'])

/** `git branch` options that change branches. */
const GIT_BRANCH_FORBIDDEN = new Set([
  '-d', '-D', '--delete', '-m', '-M', '--move', '-c', '-C', '--copy', '-f', '--force',
  '-u', '--set-upstream-to', '--unset-upstream', '--edit-description', '--track', '--no-track',
])

/** `git branch` options after which positional arguments are filters, not new branch names. */
const GIT_BRANCH_LISTING = new Set(['-l', '--list', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at'])

/** sed commands `w`/`W` (write file) and `e` (execute) — heuristic on the script text. */
const SED_WRITE_OR_EXEC = /(^|[;{}/\s\d$])[wWe](\s|$|;)/
/** awk: `system()`, pipes to commands and output redirection. */
const AWK_FORBIDDEN = /\bsystem\b|\||>/

const MAX_TARGET_CHARS = 200

const deny = (/** @type {string} */ reason) => /** @type {Decision} */ ({ allow: false, reason })
const ALLOW = /** @type {Decision} */ ({ allow: true })

/**
 * Splits a shell command at `|`, `||`, `&&`, `;` and newlines into segments of words (quotes removed).
 * Rejects what cannot be checked safely: redirects, command and process substitution, background jobs.
 * @param {string} command
 * @returns {{ segments: string[][] } | { error: string }}
 */
export function splitCommand(command) {
  /** @type {string[][]} */
  const segments = []
  /** @type {string[]} */
  let words = []
  let word = ''
  let inWord = false
  /** @type {"'" | '"' | null} */
  let quote = null

  const endWord = () => {
    if (inWord) words.push(word)
    word = ''
    inWord = false
  }
  const endSegment = () => {
    endWord()
    if (words.length > 0) segments.push(words)
    words = []
  }

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    const next = command[i + 1]
    if (quote === "'") {
      if (ch === "'") quote = null
      else word += ch
      continue
    }
    if (ch === '`' || (ch === '$' && next === '(')) return { error: 'Befehlsersetzung ($(…), Backticks) ist nicht erlaubt' }
    if (ch === '\\') {
      word += next ?? ''
      inWord = true
      i++
      continue
    }
    if (quote === '"') {
      if (ch === '"') quote = null
      else word += ch
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      inWord = true
      continue
    }
    if (ch === '>') return { error: 'Ausgabeumleitung (>, >>) ist nicht erlaubt' }
    if (ch === '<') {
      if (next === '(') return { error: 'Prozessersetzung <(…) ist nicht erlaubt' }
      endWord()
      continue
    }
    if (ch === '&') {
      if (next !== '&') return { error: 'Hintergrundprozesse (&) sind nicht erlaubt' }
      i++
      endSegment()
      continue
    }
    if (ch === '|') {
      if (next === '|') i++
      endSegment()
      continue
    }
    if (ch === ';' || ch === '\n') {
      endSegment()
      continue
    }
    if (ch === ' ' || ch === '\t') {
      endWord()
      continue
    }
    word += ch
    inWord = true
  }
  if (quote) return { error: 'Unvollständige Anführungszeichen' }
  endSegment()
  return { segments }
}

/**
 * @param {string[]} args - arguments after `git`.
 * @returns {Decision}
 */
function checkGit(args) {
  const rest = args[0] === '--no-pager' ? args.slice(1) : args
  const sub = rest[0]
  if (sub === undefined) return ALLOW
  if (sub.startsWith('-')) return deny(`git ${sub} ist nicht erlaubt (nur lesende git-Befehle)`)
  if (!GIT_READ_SUBCOMMANDS.has(sub)) return deny(`git ${sub} ist nicht erlaubt (nur lesende git-Befehle)`)
  const options = rest.slice(1)
  const writing = options.find((a) => a.startsWith('--output') || a === '-O' || a.startsWith('--open-files-in-pager'))
  if (writing) return deny(`git ${sub} ${writing} ist nicht erlaubt`)
  if (sub === 'branch') {
    const forbidden = options.find((a) => GIT_BRANCH_FORBIDDEN.has(a))
    if (forbidden) return deny(`git branch ${forbidden} ist nicht erlaubt (nur auflisten)`)
    const listing = options.some((a) => GIT_BRANCH_LISTING.has(a))
    if (!listing && options.some((a) => !a.startsWith('-'))) return deny('git branch <name> ist nicht erlaubt (nur auflisten)')
  }
  return ALLOW
}

/**
 * Checks one segment of a Bash command (first word = command).
 * @param {string[]} words
 * @returns {Decision}
 */
function checkCommand(words) {
  const [cmd, ...args] = words
  if (cmd === 'tee') return deny('tee: Ausgabeumleitung ist nicht erlaubt')
  if (NETWORK_COMMANDS.has(cmd)) return deny(`${cmd}: Netzwerkzugriff ist nicht erlaubt`)
  if (INTERPRETERS.has(cmd)) return deny(`${cmd}: Interpreter und Paketmanager sind nicht erlaubt`)
  if (!READ_COMMANDS.has(cmd)) return deny(`Befehl ${cmd} ist nicht erlaubt (nur lesende Befehle)`)

  switch (cmd) {
    case 'git':
      return checkGit(args)
    case 'find': {
      const action = args.find((a) => FIND_FORBIDDEN.has(a))
      return action ? deny(`find mit ${action} ist nicht erlaubt`) : ALLOW
    }
    case 'sed': {
      if (args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) return deny('sed -i ist nicht erlaubt (Dateien nicht ändern)')
      const script = args.filter((a) => !a.startsWith('-'))
      return script.some((a) => SED_WRITE_OR_EXEC.test(a)) ? deny('sed mit w- oder e-Befehl ist nicht erlaubt') : ALLOW
    }
    case 'awk':
      return args.some((a) => AWK_FORBIDDEN.test(a)) ? deny('awk mit system, Pipe oder Umleitung ist nicht erlaubt') : ALLOW
    case 'sort':
      return args.some((a) => a === '-o' || a.startsWith('--output') || a.startsWith('--compress-program'))
        ? deny('sort -o ist nicht erlaubt (schreibt eine Datei)')
        : ALLOW
    case 'rg':
      return args.some((a) => a.startsWith('--pre')) ? deny('rg --pre ist nicht erlaubt (führt Befehle aus)') : ALLOW
    case 'tree':
      return args.includes('-o') ? deny('tree -o ist nicht erlaubt (schreibt eine Datei)') : ALLOW
    case 'uniq':
      return args.filter((a) => !a.startsWith('-')).length > 1 ? deny('uniq mit Ausgabedatei ist nicht erlaubt') : ALLOW
    default:
      return ALLOW
  }
}

/**
 * Checks a Bash command against the allowlist: every segment must start with a reading command.
 * @param {string} command
 * @returns {Decision}
 */
export function decideBash(command) {
  const split = splitCommand(command)
  if ('error' in split) return deny(split.error)
  if (split.segments.length === 0) return deny('Leerer Befehl')
  for (const words of split.segments) {
    const decision = checkCommand(words)
    if (!decision.allow) return decision
  }
  return ALLOW
}

/**
 * Decides whether the agent may run a tool call.
 * @param {HookToolCall} call - `tool_name` and `tool_input` of the PreToolUse hook input.
 * @returns {Decision}
 */
export function decide(call) {
  const tool = typeof call.tool_name === 'string' ? call.tool_name : ''
  if (READ_TOOLS.has(tool)) return ALLOW
  if (tool === 'Bash') {
    const command = /** @type {{ command?: unknown }} */ (call.tool_input ?? {}).command
    return typeof command === 'string' ? decideBash(command) : deny('Bash ohne Befehl')
  }
  return deny(`Werkzeug ${tool || 'unbekannt'} ist nicht erlaubt (nur Read, Glob, Grep und lesende Bash-Befehle)`)
}

/**
 * @param {string} value
 * @param {unknown} cwd
 */
function relativeTo(value, cwd) {
  if (typeof cwd !== 'string' || cwd === '') return value
  if (value === cwd) return '.'
  const prefix = cwd.endsWith('/') ? cwd : `${cwd}/`
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

/**
 * Short description of what a tool call works on: the command (Bash), the file (Read, Write, …)
 * or the pattern (Glob, Grep). Paths inside the working directory are shown relative; at most 200 characters.
 * @param {HookToolCall} call
 * @returns {string}
 */
export function toolTarget(call) {
  const input = /** @type {Record<string, unknown>} */ (call.tool_input && typeof call.tool_input === 'object' ? call.tool_input : {})
  const str = (/** @type {string} */ key) => (typeof input[key] === 'string' ? /** @type {string} */ (input[key]) : '')
  let target
  if (str('command')) target = str('command')
  else if (str('pattern')) target = str('path') ? `${str('pattern')} in ${relativeTo(str('path'), call.cwd)}` : str('pattern')
  else if (str('file_path')) target = relativeTo(str('file_path'), call.cwd)
  else if (str('notebook_path')) target = relativeTo(str('notebook_path'), call.cwd)
  else if (str('path')) target = relativeTo(str('path'), call.cwd)
  else if (str('url')) target = str('url')
  else target = Object.keys(input).length > 0 ? JSON.stringify(input) : ''
  target = target.replace(/\s*\n\s*/g, ' ')
  return target.length > MAX_TARGET_CHARS ? `${target.slice(0, MAX_TARGET_CHARS - 1)}…` : target
}
