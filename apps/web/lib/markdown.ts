/** Removes the YAML front matter: it is metadata for tools, and Markdown would render it as text. */
export function stripFrontMatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n+/, '')
}
