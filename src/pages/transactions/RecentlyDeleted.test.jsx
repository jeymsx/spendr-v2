// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

/**
 * Swiping a row away in Recently deleted used to delete it for good at once,
 * with nothing to take it back. Now the row leaves the list and a toast offers
 * Undo; the deletion is made final only when that runs out, when another
 * delete begins, or when the page is left. Until then the entry is still in
 * the trash, so closing the app mid-toast loses nothing.
 */

const entries = [
  { id: 1, deletedAt: new Date().toISOString(), lead: { description: 'Lunch', category: 'Food', type: 'expense', amount: 250, account: 'GCash' } },
  { id: 2, deletedAt: new Date().toISOString(), lead: { description: 'Taxi', category: 'Transport', type: 'expense', amount: 180, account: 'GCash' } },
]

const deleteForever = vi.fn(async (/** @type {number} */ _id) => {})
const emptyTrash = vi.fn(async () => {})
const showToast = vi.fn()
const dismiss = vi.fn()

vi.mock('../../db/db', () => ({
  default: {
    trash: { orderBy: () => ({ reverse: () => ({ toArray: async () => entries }) }) },
    categories: { toArray: async () => [] },
  },
  dbReady: Promise.resolve(),
  TRASH_DAYS: 30,
}))
vi.mock('../../db/trash', () => ({
  MissingAccountError: class extends Error {},
  TRASH_DAYS: 30,
  deleteForever: (/** @type {number} */ id) => deleteForever(id),
  emptyTrash: () => emptyTrash(),
  purgeTrash: async () => {},
  restoreFromTrash: async () => 1,
  describeEntry: (/** @type {any} */ e) => ({ lead: e.lead, extra: '', total: e.lead.amount, daysLeft: 20, count: 1 }),
}))
vi.mock('../../hooks/useLiveQuery', async () => {
  const { useState, useEffect } = await import('react')
  return {
    useLiveQuery: (/** @type {() => Promise<any>} */ q, /** @type {any} */ _deps, /** @type {any} */ initial) => {
      const [v, setV] = useState(initial)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useEffect(() => { let on = true; q().then(r => { if (on) setV(r) }); return () => { on = false } }, [])
      return v
    },
  }
})
vi.mock('../../hooks/useBack', () => ({ useBack: () => () => {} }))
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast, dismiss }) }))
vi.mock('../../components/SubPage', () => ({
  default: ({ children, action }) => <div>{action}{children}</div>,
}))
// A flick, stood in for by a button: the gesture is SwipeRow's own business.
vi.mock('../../components/ui/SwipeRow', () => ({
  default: ({ children, onDelete, label }) => (
    <div>{children}<button type="button" aria-label={label} onClick={() => onDelete()}>flick</button></div>
  ),
}))
vi.mock('../../components/ui/Sheet', () => ({
  default: ({ open, children }) => (open ? <div>{children}</div> : null),
}))
vi.mock('../../components/SwipeConfirm', () => ({ default: () => null }))
vi.mock('../../components/ui/Presence', () => ({ RowDivider: () => null }))
vi.mock('../../components/CategoryGlyph', () => ({ default: () => null }))
// The empty state draws art that needs the theme; what it says is all that matters here.
vi.mock('../../components/ui/EmptyState', () => ({ default: ({ title }) => <p>{title}</p> }))

const { default: RecentlyDeleted } = await import('./RecentlyDeleted')

/** The Undo handler the page handed the toast, from its most recent call. */
const lastToast = () => {
  const call = showToast.mock.calls.at(-1)
  return { message: call[0], options: call[2] }
}

async function flush() {
  await act(async () => { await Promise.resolve() })
}

beforeEach(async () => {
  vi.useFakeTimers()
  deleteForever.mockClear()
  emptyTrash.mockClear()
  showToast.mockClear()
  dismiss.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function open() {
  const view = render(<RecentlyDeleted />)
  await flush()
  return view
}

describe('swiping a row away in Recently deleted', () => {
  it('hides the row and offers Undo, without deleting anything yet', async () => {
    await open()
    expect(screen.getByText('Lunch')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Lunch for good' }))
    await flush()

    expect(screen.queryByText('Lunch')).toBeNull()
    expect(screen.getByText('Taxi')).toBeTruthy()
    expect(deleteForever).not.toHaveBeenCalled()
    const { message, options } = lastToast()
    expect(message).toBe('Deleted for good')
    expect(options).toMatchObject({ actionLabel: 'Undo', duration: 6000 })
  })

  it('brings the row back on Undo, and never deletes it', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Lunch for good' }))
    await flush()

    act(() => { lastToast().options.onAction() })
    expect(screen.getByText('Lunch')).toBeTruthy()

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(deleteForever).not.toHaveBeenCalled()
  })

  it('deletes it for good when the Undo has run out, and not before', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Lunch for good' }))
    await flush()

    await act(async () => { await vi.advanceTimersByTimeAsync(5_900) })
    expect(deleteForever).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(deleteForever).toHaveBeenCalledTimes(1)
    expect(deleteForever).toHaveBeenCalledWith(1)
  })

  it('makes the first one final when a second delete begins, and gives Undo to the second', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Lunch for good' }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Taxi for good' }))
    await flush()

    expect(deleteForever).toHaveBeenCalledTimes(1)
    expect(deleteForever).toHaveBeenCalledWith(1)

    // The first one's Undo is gone with its timer: only the second can come back.
    act(() => { lastToast().options.onAction() })
    expect(screen.getByText('Taxi')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(deleteForever).toHaveBeenCalledTimes(1)
  })

  it('settles what is waiting, and takes the Undo down, when the page is left', async () => {
    const view = await open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Lunch for good' }))
    await flush()

    view.unmount()
    expect(deleteForever).toHaveBeenCalledWith(1)
    expect(dismiss).toHaveBeenCalled()
  })

  it('leaves nothing to settle, and no toast to dismiss, when nothing was swiped', async () => {
    const view = await open()
    view.unmount()
    expect(deleteForever).not.toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('tells the person if the deletion fails, and shows the row again', async () => {
    deleteForever.mockRejectedValueOnce(new Error('locked'))
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Lunch for good' }))
    await flush()

    await act(async () => { await vi.advanceTimersByTimeAsync(6_100) })
    expect(showToast).toHaveBeenLastCalledWith('Could not delete it. Try again.', 'error')
    expect(screen.getByText('Lunch')).toBeTruthy()
    quiet.mockRestore()
  })
})
