import { getEngine } from '@/lib/container'
import { Board } from '@/components/Board'
import { BoardLive } from '@/components/BoardLive'

/** Board of all tickets by stage; `BoardLive` refreshes it on ticket events. */
export default function BoardPage() {
  return (
    <>
      <h1 className="sr-only">Board</h1>
      <BoardLive />
      <Board tickets={getEngine().listTickets()} />
    </>
  )
}
