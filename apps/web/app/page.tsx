import { getEngine } from '@/lib/container'
import { Board } from '@/components/Board'
import { BoardLive } from '@/components/BoardLive'

export default function BoardPage() {
  return (
    <>
      <BoardLive />
      <Board tickets={getEngine().listTickets()} />
    </>
  )
}
