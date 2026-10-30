import type { ReactNode } from 'react'

const CODE_CLASS = 'rounded bg-slate-100 px-1 font-mono text-[0.9em]'

/**
 * Splits text on backtick pairs and renders the inner parts as `<code>`; no other Markdown.
 * Unpaired backticks and empty pairs stay as literal text.
 */
export function inlineCode(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
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
