import { notFound } from 'next/navigation'
import { errorCode } from '@refinement/core'
import type { TicketDetailDto } from '@refinement/shared'
import { getEngine } from '@/lib/container'
import { TicketDetail } from '@/components/TicketDetail'

/** Checks the ticket's PR first, so a merge shows up as soon as the page is opened. */
async function loadTicket(key: string): Promise<TicketDetailDto> {
  const engine = getEngine()
  try {
    await engine.syncReviews(key)
    return await engine.getTicket(key)
  } catch (err) {
    if (errorCode(err) === 'NOT_FOUND') notFound()
    throw err
  }
}

export default async function TicketPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const ticket = await loadTicket(key)
  return <TicketDetail ticket={ticket} tokenConfigured={getEngine().getSettings().tokenConfigured} />
}
