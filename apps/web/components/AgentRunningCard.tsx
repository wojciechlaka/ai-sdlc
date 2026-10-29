'use client'

import { formatElapsed } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface Props {
  elapsed: number
  progressLog: string[]
  connected: boolean
  everConnected: boolean
}

/** Shown while the agent runs: pulse indicator, elapsed time, progress log, connection warning. */
export function AgentRunningCard({ elapsed, progressLog, connected, everConnected }: Props) {
  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
          <span className="pulse-indicator" />
          Agent läuft
          <span className="font-mono normal-case tracking-normal text-slate-400">{formatElapsed(elapsed)}</span>
          {everConnected && !connected && (
            <span className="ml-auto text-amber-600 normal-case tracking-normal font-normal">
              ⚠ Verbindung unterbrochen
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {progressLog.length === 0 ? (
          <p className="text-xs text-slate-400 font-mono">Warte auf Agent...</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {progressLog.map((msg, i) => (
              <p key={i} className="text-xs font-mono text-slate-600">
                {msg}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
