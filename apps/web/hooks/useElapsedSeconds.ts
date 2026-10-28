'use client'

import { useEffect, useRef, useState } from 'react'

const MS_PER_SECOND = 1000

/**
 * Seconds the agent has been working. Pauses while `isRunning` is false (e.g. waiting for an
 * answer) and resets to 0 when `shouldReset` is true.
 */
export function useElapsedSeconds(isRunning: boolean, shouldReset: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const pausedRef = useRef(0)

  useEffect(() => {
    if (shouldReset) {
      pausedRef.current = 0
      startTimeRef.current = null
      return
    }
    if (!isRunning) {
      if (startTimeRef.current !== null) {
        pausedRef.current += Math.floor((Date.now() - startTimeRef.current) / MS_PER_SECOND)
        startTimeRef.current = null
      }
      return
    }
    const offset = pausedRef.current
    startTimeRef.current = Date.now()
    const resetId = setTimeout(() => setElapsed(offset), 0)
    const id = setInterval(() => {
      if (startTimeRef.current === null) return
      setElapsed(offset + Math.floor((Date.now() - startTimeRef.current) / MS_PER_SECOND))
    }, MS_PER_SECOND)
    return () => {
      clearTimeout(resetId)
      clearInterval(id)
    }
  }, [isRunning, shouldReset])

  return shouldReset ? 0 : elapsed
}
