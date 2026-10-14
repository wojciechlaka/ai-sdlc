import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { formatElapsed } from '../lib/utils'

interface Props {
  elapsed: number
  progressLog: string[]
  connected: boolean
  everConnected: boolean
}

/**
 * Card displayed while the agent is running. Shows a pulse indicator, elapsed time,
 * a scrollable progress log, and a warning if the SSE connection was lost.
 * @param elapsed      - Elapsed seconds since the current run started.
 * @param progressLog  - Ordered list of progress messages emitted by the agent.
 * @param connected    - Whether the SSE connection is currently active.
 * @param everConnected - Whether the SSE connection was ever established in this session.
 */
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
        {progressLog.length === 0
          ? <p className="text-xs text-slate-400 font-mono">Warte auf Agent...</p>
          : <div className="space-y-1 max-h-48 overflow-y-auto">
              {progressLog.map((msg, i) => (
                <p key={i} className="text-xs font-mono text-slate-600">{msg}</p>
              ))}
            </div>
        }
      </CardContent>
    </Card>
  )
}
