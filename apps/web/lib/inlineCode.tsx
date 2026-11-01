import type { ReactNode } from 'react'

const CODE_CLASS = 'rounded bg-slate-100 px-1 font-mono text-[0.9em]'

/**
 * Renders Markdown-style inline code in agent text (questions, choice titles, descriptions, pros and cons): every
 * pair of single backticks becomes `<code>`, everything else stays plain text. No other Markdown is interpreted on
 * purpose, so agent text cannot add headings, links or emphasis to the panels.
 *
 * A deliberate subset of CommonMark code spans, enough for short identifiers such as `published` or `POST /articles`:
 * - a pair of single backticks with at least one character between them is code;
 * - unpaired backticks and empty pairs stay as literal text;
 * - not supported: code wrapped in double backticks (to contain a backtick), escaped backticks (`\``) and the
 *   stripping of one leading/trailing space inside the span.
 * If full Markdown is ever needed, use a parser (e.g. `react-markdown` with an element allowlist) instead of
 * extending the pattern.
 *
 * @example inlineCode('Feld `published` setzen') // ['Feld ', <code>published</code>, ' setzen']
 * @returns Text and `<code>` nodes in their original order, ready to render as children.
 */
export function inlineCode(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // `[^`]+` stops at the next backtick, so two spans on one line stay separate (a greedy `.+` would join them).
  // Created per call: with the `g` flag `exec` keeps its position in `lastIndex`, a module-level regex would carry
  // it over to the next call.
  const pattern = /`([^`]+)`/g
  let last = 0
  let match = pattern.exec(text)
  while (match) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index))
    }
    nodes.push(
      <code key={match.index} className={CODE_CLASS}>
        {match[1]}
      </code>,
    )
    last = match.index + match[0].length
    match = pattern.exec(text)
  }
  if (last < text.length) {
    nodes.push(text.slice(last))
  }
  return nodes
}
