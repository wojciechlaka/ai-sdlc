'use client'

import { useEffect, useState } from 'react'

const MS_PER_SECOND = 1000

/** Whole seconds since `isRunning` last became true; 0 while it is false. */
export function useElapsedSeconds(isRunning: boolean): number {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isRunning) {
      return
    }
    const startedAt = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / MS_PER_SECOND)), MS_PER_SECOND)
    return () => {
      clearInterval(id)
      setElapsed(0)
    }
  }, [isRunning])

  return elapsed
}
