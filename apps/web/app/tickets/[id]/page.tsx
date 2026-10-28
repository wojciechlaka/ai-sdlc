import { notFound } from 'next/navigation'
import { errorCode } from '@refinement/core'
import type { TicketDetailDto } from '@refinement/shared'
import { getEngine } from '@/lib/container'
import { TicketDetail } from '@/components/TicketDetail'

function loadTicket(id: string): TicketDetailDto {
  try {
    return getEngine().getTicket(id)
  } catch (err) {
    if (errorCode(err) === 'NOT_FOUND') notFound()
    throw err
  }
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TicketDetail ticket={loadTicket(id)} />
}
