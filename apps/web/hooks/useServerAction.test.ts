import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ActionResult } from '@/lib/actionResult'
import { useServerAction } from './useServerAction'

describe('useServerAction', () => {
  it('passes the data of a successful action to onSuccess', async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useServerAction())
    act(() => result.current.run(async () => ({ ok: true, data: 42 }), onSuccess))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(42))
    expect(result.current.error).toBeNull()
    expect(result.current.pending).toBe(false)
  })

  it('keeps the error of a failed action and clears it on the next run', async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useServerAction())
    act(() => result.current.run(async (): Promise<ActionResult> => ({ ok: false, error: 'Konflikt' }), onSuccess))
    await waitFor(() => expect(result.current.error).toBe('Konflikt'))
    expect(onSuccess).not.toHaveBeenCalled()

    act(() => result.current.run(async () => ({ ok: true, data: undefined })))
    await waitFor(() => expect(result.current.error).toBeNull())
  })

  it('is pending while the action runs', async () => {
    let resolve!: (result: ActionResult) => void
    const { result } = renderHook(() => useServerAction())
    act(() => result.current.run(() => new Promise<ActionResult>((r) => { resolve = r })))
    await waitFor(() => expect(result.current.pending).toBe(true))
    await act(async () => resolve({ ok: true, data: undefined }))
    await waitFor(() => expect(result.current.pending).toBe(false))
  })
})
