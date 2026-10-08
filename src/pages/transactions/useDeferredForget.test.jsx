// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

/**
 * Deleting out of Recently deleted for good, with an Undo: the phone's swipe
 * and the desktop's single-row and multi-row "Delete for good" both go through
 * this. RecentlyDeleted.test.jsx drives it from the phone's list; this pins the
 * parts the desktop leans on - several rows at once, and the toast's words.
 */

const deleteForever = vi.fn(async (/** @type {number} */ _id) => {})
const showToast = vi.fn()
const dismiss = vi.fn()

vi.mock('../../db/trash', () => ({
  deleteForever: (/** @type {number} */ id) => deleteForever(id),
}))
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast, dismiss }) }))

const { useDeferredForget, UNDO_MS } = await import('./useDeferredForget')

/** The options the hook handed the toast, from its most recent call. */
const lastToast = () => {
  const call = showToast.mock.calls.at(-1)
  return { message: call[0], type: call[1], options: call[2] }
}

beforeEach(() => {
  vi.useFakeTimers()
  deleteForever.mockReset()
  deleteForever.mockImplementation(async () => {})
  showToast.mockClear()
  dismiss.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useDeferredForget', () => {
  it('hides a row at once, deletes nothing yet, and offers Undo for as long as it waits', () => {
    const { result } = renderHook(() => useDeferredForget())
    act(() => { result.current.forgetWithUndo(4) })

    expect(result.current.hidden).toEqual([4])
    expect(deleteForever).not.toHaveBeenCalled()
    expect(lastToast()).toMatchObject({
      message: 'Deleted for good', type: 'success',
      options: { actionLabel: 'Undo', duration: UNDO_MS },
    })
  })

  it('takes several rows as one delete, with its own words, and deletes each when the Undo runs out', async () => {
    const { result } = renderHook(() => useDeferredForget())
    act(() => { result.current.forgetWithUndo([1, 2, 3], '3 deleted for good') })

    expect(result.current.hidden).toEqual([1, 2, 3])
    expect(lastToast().message).toBe('3 deleted for good')

    await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_MS - 100) })
    expect(deleteForever).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(deleteForever.mock.calls.map(c => c[0])).toEqual([1, 2, 3])
    expect(result.current.hidden).toEqual([])
  })

  it('brings every row back on Undo, and never deletes any', async () => {
    const { result } = renderHook(() => useDeferredForget())
    act(() => { result.current.forgetWithUndo([1, 2]) })

    act(() => { lastToast().options.onAction() })
    expect(result.current.hidden).toEqual([])

    await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_MS * 2) })
    expect(deleteForever).not.toHaveBeenCalled()
  })

  it('makes the first delete final when a second begins, and Undo is only the second\'s', async () => {
    const { result } = renderHook(() => useDeferredForget())
    act(() => { result.current.forgetWithUndo([1, 2]) })
    const firstUndo = lastToast().options.onAction
    act(() => { result.current.forgetWithUndo(3) })
    await act(async () => { await Promise.resolve() })

    expect(deleteForever.mock.calls.map(c => c[0])).toEqual([1, 2])
    // The first one's Undo is gone with its timer.
    act(() => { firstUndo() })
    expect(result.current.hidden).toEqual([3])

    act(() => { lastToast().options.onAction() })
    expect(result.current.hidden).toEqual([])
    await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_MS * 2) })
    expect(deleteForever).toHaveBeenCalledTimes(2)
  })

  it('settles on request, so an empty-all never races a delete that is waiting', async () => {
    const { result } = renderHook(() => useDeferredForget())
    act(() => { result.current.forgetWithUndo(7) })

    await act(async () => { await result.current.settle() })
    expect(deleteForever).toHaveBeenCalledWith(7)
    expect(result.current.hidden).toEqual([])
    // Nothing left waiting: the timer was cleared with it.
    await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_MS * 2) })
    expect(deleteForever).toHaveBeenCalledTimes(1)
  })

  it('settles what is waiting, and takes the Undo down, when the page is left', async () => {
    const { result, unmount } = renderHook(() => useDeferredForget())
    act(() => { result.current.forgetWithUndo([8, 9]) })

    unmount()
    // The first goes at once, in the unmount itself; the rest follow it.
    expect(deleteForever.mock.calls.map(c => c[0])).toEqual([8])
    await vi.advanceTimersByTimeAsync(0)
    expect(deleteForever.mock.calls.map(c => c[0])).toEqual([8, 9])
    expect(dismiss).toHaveBeenCalled()
    // And the timer went with it: nothing is deleted twice.
    await vi.advanceTimersByTimeAsync(UNDO_MS * 2)
    expect(deleteForever).toHaveBeenCalledTimes(2)
  })

  it('leaves nothing to settle, and no toast to dismiss, when nothing was deleted', () => {
    const { unmount } = renderHook(() => useDeferredForget())
    unmount()
    expect(deleteForever).not.toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('does not let one row that cannot go keep the others, and says so', async () => {
    deleteForever.mockImplementation(async (id) => { if (id === 2) throw new Error('locked') })
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useDeferredForget())
    act(() => { result.current.forgetWithUndo([1, 2, 3]) })

    await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_MS + 100) })
    expect(deleteForever.mock.calls.map(c => c[0])).toEqual([1, 2, 3])
    expect(showToast).toHaveBeenLastCalledWith('Could not delete it. Try again.', 'error')
    expect(result.current.hidden).toEqual([])
    quiet.mockRestore()
  })

  it('has nothing to delete for no rows', () => {
    const { result } = renderHook(() => useDeferredForget())
    let took = true
    act(() => { took = result.current.forgetWithUndo([]) })
    expect(took).toBe(false)
    expect(showToast).not.toHaveBeenCalled()
  })
})
