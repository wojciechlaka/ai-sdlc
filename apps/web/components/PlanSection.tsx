'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { RefinementOutput } from '@refinement/shared'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

/** Collapsible refinement result rendered as Markdown. */
export function PlanSection({ output }: { output: RefinementOutput }) {
  const [open, setOpen] = useState(false)
  const blocking = output.openQuestions.filter((q) => q.blocksImplementation)
  const plan = [
    output.userStory ? `## User Story\n${output.userStory}` : '',
    output.acceptanceCriteria.length
      ? `## Akzeptanzkriterien\n${output.acceptanceCriteria.map((ac) => `- ${ac}`).join('\n')}`
      : '',
    output.affectedFiles.length
      ? `## Betroffene Dateien\n${output.affectedFiles.map((f) => `- **${f.path}**: ${f.description}`).join('\n')}`
      : '',
    output.risks.length
      ? `## Risiken\n${output.risks.map((r) => `- [${r.severity}] ${r.description}`).join('\n')}`
      : '',
    blocking.length
      ? `## Offene Fragen (blockierend)\n${blocking.map((q) => `- ${q.question}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n')

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setOpen((v) => !v)}>
        <CardTitle className="text-sm flex items-center justify-between">
          Agent-Run
          <span className="text-slate-400 text-xs font-normal">{open ? '▲ einklappen' : '▼ ausklappen'}</span>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="prose-plan">
            <ReactMarkdown>{plan}</ReactMarkdown>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
