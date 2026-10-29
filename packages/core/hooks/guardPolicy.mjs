// Guard policy for the Claude agent (spec §13): the agent may only read, and only inside the clone.
// Used by guard.mjs (PreToolUse) and audit.mjs (PostToolUse). Plain Node ESM without dependencies:
// the hook scripts run as standalone `node` processes.
//
// Design: no shell parser. Exploring the code is the job of Read, Glob and Grep (confined to the clone);
// Bash is only a narrow door for reading git history. A command is allowed only if it has no shell special
// characters at all, splits on single spaces into words and matches the git grammar below — everything else
// is denied. To change what the agent may do, edit the lists below and the table tests in guardPolicy.test.ts.
//
// Grammar: `git [--no-pager] <subcommand> <word>…` — the subcommand is a key of GIT_OPTIONS; every word starting
// with `-` must match one of its option rules, every other word must be a PLAIN_WORD (revision, `rev:path` or a
// path inside the clone; no absolute path, no `..`). Worked example:
//   `git --no-pager log --oneline -n20 -- src/app.ts`
//   → `--no-pager` skipped, subcommand `log`; `--oneline`, `-n20` and `--` are log options; `src/app.ts` is a
//     plain word inside the clone → allowed. `git log --output=x` is denied (option not listed).
//
// git configuration: the clone and its `.git/config` are created by the app (adapters/git), global and system
// config are switched off for the agent (GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1), so no pager,
// external diff or textconv driver can be configured; the allowlists keep `--ext-diff`/`--textconv` out anyway.
import fs from 'node:fs'
import path from 'node:path'

/**
 * @typedef {{ tool_name?: unknown, tool_input?: unknown, cwd?: unknown }} HookToolCall
 * @typedef {{ allow: true } | { allow: false, reason: string }} Decision
 * @typedef {string | RegExp} OptionRule
 */

const MAX_COMMAND_CHARS = 300
const DEFAULT_TARGET_CHARS = 200

/** Not allowed anywhere in a Bash command, quoted or not; control characters (newline, tab, …) neither. */
const FORBIDDEN_CHARS = /[$`;&|<>(){}[\]*?!\\'"]|[\u0000-\u001f\u007f]/
/**
 * `~` and `^` only inside a word for revisions (`HEAD~1`, `HEAD^`): at the start of a word or after `=`/`:`
 * the shell may expand `~` to a home directory (zsh also treats a leading `^` as glob negation).
 */
const REVISION_SUFFIX_MISPLACED = /(^|[ =:])[~^]/
/** Non-option words: revisions, paths in the clone, `rev:path`. */
const PLAIN_WORD = /^[A-Za-z0-9._/:@=+-][A-Za-z0-9._/:@=+~^-]*$/

/**
 * Allowed git subcommands and their allowed options (exact strings or full-match patterns).
 * @type {Record<string, OptionRule[]>}
 */
const GIT_OPTIONS = {
  log: ['--oneline', '-p', /^-n\d+$/, /^-\d+$/, '--stat', '--name-only', '--name-status', /^--since=[A-Za-z0-9.:-]+$/,
    /^--author=[A-Za-z0-9._@-]+$/, '--follow', '--'],
  show: ['--stat', '--name-only', '--oneline', '--'],
  diff: ['--stat', '--name-only', '--name-status', '--no-ext-diff', '--'],
  blame: [/^-L\d+,\d+$/],
  'ls-files': ['--'],
  status: ['--short', '--porcelain'],
  'rev-parse': ['--short', '--abbrev-ref'],
}

const BASH_HINT = 'Nur git log/show/diff/blame/ls-files/status/rev-parse ohne Sonderzeichen erlaubt — zum Lesen Read, Glob oder Grep verwenden'
const PATH_HINT = 'Nur innerhalb des Repositorys lesen'

const ALLOW = /** @type {Decision} */ ({ allow: true })
const deny = (/** @type {string} */ reason) => /** @type {Decision} */ ({ allow: false, reason })
const denyBash = (/** @type {string} */ detail) => deny(`${detail}. ${BASH_HINT}`)
const denyPath = (/** @type {string} */ detail) => deny(`${PATH_HINT} (${detail})`)

/**
 * String value of `input[key]`, or undefined when it is missing or not a string.
 * @param {Record<string, unknown>} input
 * @param {string} key
 * @returns {string | undefined}
 */
function optionalString(input, key) {
  const value = input[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * String value of `input[key]`, or `''` when it is missing or not a string.
 * @param {Record<string, unknown>} input
 * @param {string} key
 * @returns {string}
 */
function stringOrEmpty(input, key) {
  return optionalString(input, key) ?? ''
}

/**
 * True if `word` matches one of the option rules of the subcommand.
 * @param {string} word
 * @param {OptionRule[]} rules
 */
const optionAllowed = (word, rules) => rules.some((rule) => (typeof rule === 'string' ? rule === word : rule.test(word)))

/**
 * Checks a Bash command against the git grammar. No shell parsing: special characters are rejected outright.
 * @param {string} command
 * @returns {Decision}
 */
export function decideBash(command) {
  if (command.length > MAX_COMMAND_CHARS) {
    return denyBash(`Befehl länger als ${MAX_COMMAND_CHARS} Zeichen`)
  }
  const special = command.match(FORBIDDEN_CHARS)
  if (special) {
    const shown = /[\u0000-\u001f\u007f]/.test(special[0]) ? 'Steuerzeichen' : `„${special[0]}“`
    return denyBash(`Sonderzeichen ${shown} ist nicht erlaubt`)
  }
  const misplaced = command.match(REVISION_SUFFIX_MISPLACED)
  if (misplaced) {
    return denyBash(`„${misplaced[0].trim().slice(-1)}“ ist nur innerhalb einer Revision erlaubt (z. B. HEAD~1)`)
  }
  const words = command.trim().split(' ')
  if (words.some((w) => w === '')) {
    return denyBash('Leerer Befehl oder doppelte Leerzeichen')
  }
  if (words[0] !== 'git') {
    return denyBash(`Befehl ${words[0]} ist nicht erlaubt`)
  }
  const args = words[1] === '--no-pager' ? words.slice(2) : words.slice(1)
  const [sub, ...rest] = args
  if (sub === undefined) {
    return denyBash('git ohne Unterbefehl')
  }
  const rules = Object.hasOwn(GIT_OPTIONS, sub) ? GIT_OPTIONS[sub] : undefined
  if (!rules) {
    return denyBash(`git ${sub} ist nicht erlaubt`)
  }
  for (const word of rest) {
    if (word.startsWith('-')) {
      if (!optionAllowed(word, rules)) {
        return denyBash(`Option ${word} ist für git ${sub} nicht erlaubt`)
      }
    } else if (!PLAIN_WORD.test(word)) {
      return denyBash(`Argument ${word} enthält unerlaubte Zeichen`)
    } else if (word.startsWith('/') || word.includes('..')) {
      return denyBash(`Argument ${word} zeigt aus dem Repository heraus`)
    }
  }
  return ALLOW
}

/**
 * Real path of `target`; for paths that do not exist yet, the real path of the nearest existing parent
 * plus the remaining segments (so symlinks in the existing part are resolved).
 * @param {string} target - absolute path
 */
function realPathOf(target) {
  /** @type {string[]} */
  const missing = []
  let current = target
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...missing.reverse())
    } catch {
      const parent = path.dirname(current)
      if (parent === current) {
        return target
      }
      missing.push(path.basename(current))
      current = parent
    }
  }
}

/**
 * Null if `value` (a path, relative to `cwd` or absolute) stays inside the real path of `cwd`, otherwise why not.
 * @param {string} value
 * @param {string} cwd
 * @returns {string | null}
 */
function outsideReason(value, cwd) {
  if (value.startsWith('~')) {
    return `${value} liegt außerhalb`
  }
  let root
  try {
    root = fs.realpathSync(cwd)
  } catch {
    return 'Arbeitsordner nicht lesbar'
  }
  const resolved = realPathOf(path.resolve(cwd, value))
  return resolved === root || resolved.startsWith(root + path.sep) ? null : `${value} liegt außerhalb`
}

/**
 * Glob patterns are resolved by the tool relative to its path: no absolute patterns (also inside `{a,b}`),
 * no home directory, no `..`, no `(`, `\` or `[/`.
 * @param {string} pattern
 * @returns {string | null}
 */
function globReason(pattern) {
  // `(` (extglob such as `@(/etc)`), `\` (escaped `/`) and `[/` (character class with `/`) could hide an absolute path.
  if (/(^|[{,])\s*[/~]/.test(pattern) || pattern.includes('..') || /[(\\]|\[\//.test(pattern)) {
    return `Muster ${pattern} zeigt aus dem Repository heraus`
  }
  return null
}

/**
 * Confines the file tools to the clone. Read: `file_path`; Glob: `path`, `pattern`; Grep: `path`, `glob`.
 * Grep's `pattern` is a regular expression over file contents, not a path, and stays unrestricted.
 * @param {string} tool
 * @param {Record<string, unknown>} input
 * @param {unknown} cwd
 * @returns {Decision}
 */
function decideFileTool(tool, input, cwd) {
  if (typeof cwd !== 'string' || cwd === '') {
    return denyPath('Arbeitsordner unbekannt')
  }
  /** @type {(string | null)[]} */
  const reasons = []
  if (tool === 'Read') {
    const file = optionalString(input, 'file_path')
    reasons.push(file ? outsideReason(file, cwd) : 'Datei fehlt')
  } else {
    const dir = optionalString(input, 'path')
    if (dir !== undefined) {
      reasons.push(outsideReason(dir, cwd))
    }
    const pattern = optionalString(input, tool === 'Glob' ? 'pattern' : 'glob')
    if (pattern !== undefined) {
      reasons.push(globReason(pattern))
    }
  }
  const reason = reasons.find((r) => r !== null)
  return reason ? denyPath(reason) : ALLOW
}

/**
 * Decides whether the agent may run a tool call.
 * @param {HookToolCall} call - `tool_name`, `tool_input` and `cwd` of the PreToolUse hook input.
 * @returns {Decision}
 */
export function decide(call) {
  const tool = typeof call.tool_name === 'string' ? call.tool_name : ''
  const input = /** @type {Record<string, unknown>} */ (call.tool_input && typeof call.tool_input === 'object' ? call.tool_input : {})
  if (tool === 'Read' || tool === 'Glob' || tool === 'Grep') {
    return decideFileTool(tool, input, call.cwd)
  }
  if (tool === 'Bash') {
    return typeof input.command === 'string' ? decideBash(input.command) : denyBash('Bash ohne Befehl')
  }
  return deny(`Werkzeug ${tool || 'unbekannt'} ist nicht erlaubt (nur Read, Glob, Grep und lesende git-Befehle)`)
}

/**
 * `value` relative to `cwd` when it lies inside it, otherwise unchanged.
 * @param {string} value
 * @param {unknown} cwd
 */
function relativeTo(value, cwd) {
  if (typeof cwd !== 'string' || cwd === '') {
    return value
  }
  if (value === cwd) {
    return '.'
  }
  const prefix = cwd.endsWith('/') ? cwd : `${cwd}/`
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

/**
 * Short description of what a tool call works on: the command (Bash), the file (Read, Write, …)
 * or the pattern (Glob, Grep). Paths inside the working directory are shown relative.
 * @param {HookToolCall} call
 * @param {number} [maxChars] - 200 by default; the guard keeps more of blocked calls.
 * @returns {string}
 */
export function toolTarget(call, maxChars = DEFAULT_TARGET_CHARS) {
  const input = /** @type {Record<string, unknown>} */ (call.tool_input && typeof call.tool_input === 'object' ? call.tool_input : {})
  const command = stringOrEmpty(input, 'command')
  const pattern = stringOrEmpty(input, 'pattern')
  const dir = stringOrEmpty(input, 'path')
  const file = stringOrEmpty(input, 'file_path') || stringOrEmpty(input, 'notebook_path')
  const url = stringOrEmpty(input, 'url')
  let target
  if (command) {
    target = command
  } else if (pattern) {
    target = dir ? `${pattern} in ${relativeTo(dir, call.cwd)}` : pattern
  } else if (file) {
    target = relativeTo(file, call.cwd)
  } else if (dir) {
    target = relativeTo(dir, call.cwd)
  } else if (url) {
    target = url
  } else {
    target = Object.keys(input).length > 0 ? JSON.stringify(input) : ''
  }
  target = target.replace(/\s*\n\s*/g, ' ')
  return target.length > maxChars ? `${target.slice(0, maxChars - 1)}…` : target
}
