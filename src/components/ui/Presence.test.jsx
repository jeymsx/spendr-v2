// @vitest-environment jsdom
/**
 * When a row arrives, and how.
 *
 * The animations themselves are the browser's and are looked at in a real
 * one. What is decided here is WHICH rows move, and that is where a list
 * goes wrong: a first visit that animates every row, a filter that plays as
 * a mass deletion, a sync that ripples the whole ledger. Each scope below is
 * its own, because what a list has shown is remembered for the session.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, render, cleanup, act } from '@testing-library/react'
import { AnimatePresence } from 'motion/react'
import { useRowMotion, RowDivider, PresenceItem } from './Presence'

afterEach(cleanup)

const hook = (props) => renderHook((p) => useRowMotion(p), { initialProps: props })

describe('useRowMotion', () => {
  it('never animates the first rows a list draws', () => {
    const ids = [1, 2]
    const { result, rerender } = hook({ scope: 's1', ready: false, allIds: [], visibleIds: [], viewKey: '' })
    rerender({ scope: 's1', ready: true, allIds: ids, visibleIds: ids, viewKey: '' })
    expect(result.current.arrival(1)).toBe('none')
    expect(result.current.arrival(2)).toBe('none')
  })

  it('opens a row added while the list is on screen', () => {
    const { result, rerender } = hook({ scope: 's2', ready: true, allIds: [1, 2], visibleIds: [1, 2], viewKey: '' })
    const epoch = result.current.epoch
    rerender({ scope: 's2', ready: true, allIds: [3, 1, 2], visibleIds: [3, 1, 2], viewKey: '' })
    expect(result.current.arrival(3)).toBe('expand')
    expect(result.current.arrival(1)).toBe('none')
    // Same epoch: the list animates this change rather than redrawing.
    expect(result.current.epoch).toBe(epoch)
  })

  it('redraws, rather than animating, when the view changes', () => {
    const { result, rerender } = hook({ scope: 's3', ready: true, allIds: [1, 2, 3], visibleIds: [1, 2, 3], viewKey: 'all' })
    const epoch = result.current.epoch
    // A filter: two rows leave the view. That is not two deletions.
    rerender({ scope: 's3', ready: true, allIds: [1, 2, 3], visibleIds: [1], viewKey: 'expense' })
    expect(result.current.epoch).toBe(epoch + 1)
    expect(result.current.arrival(1)).toBe('none')
  })

  it('redraws when more than a few rows change at once', () => {
    const { result, rerender } = hook({ scope: 's4', ready: true, allIds: [1], visibleIds: [1], viewKey: '' })
    const epoch = result.current.epoch
    const many = [2, 3, 4, 5, 1]
    rerender({ scope: 's4', ready: true, allIds: many, visibleIds: many, viewKey: '' })
    expect(result.current.epoch).toBe(epoch + 1)
    expect(result.current.arrival(2)).toBe('none')
  })

  it('adds nothing when a sync hands back the same rows in a new array', () => {
    const { result, rerender } = hook({ scope: 's5', ready: true, allIds: [1, 2], visibleIds: [1, 2], viewKey: '' })
    const epoch = result.current.epoch
    rerender({ scope: 's5', ready: true, allIds: [1, 2], visibleIds: [1, 2], viewKey: '' })
    expect(result.current.epoch).toBe(epoch)
    expect(result.current.arrival(1)).toBe('none')
  })

  it('raises a row added elsewhere - once, and only in the view it was found in', () => {
    // First visit: the list sees rows 1 and 2.
    const first = hook({ scope: 's6', ready: false, allIds: [], visibleIds: [], viewKey: '' })
    first.rerender({ scope: 's6', ready: true, allIds: [1, 2], visibleIds: [1, 2], viewKey: '' })
    first.unmount()
    // Row 3 was logged on another screen. Coming back, it rises.
    const back = hook({ scope: 's6', ready: false, allIds: [], visibleIds: [], viewKey: '' })
    back.rerender({ scope: 's6', ready: true, allIds: [3, 1, 2], visibleIds: [3, 1, 2], viewKey: '' })
    expect(back.result.current.arrival(3)).toBe('rise')
    expect(back.result.current.arrival(1)).toBe('none')
    // A filter afterwards does not replay it.
    back.rerender({ scope: 's6', ready: true, allIds: [3, 1, 2], visibleIds: [3], viewKey: 'expense' })
    expect(back.result.current.arrival(3)).toBe('none')
  })

  it('raises nothing when too much is new - a restore, a first sync', () => {
    const first = hook({ scope: 's7', ready: false, allIds: [], visibleIds: [], viewKey: '' })
    first.rerender({ scope: 's7', ready: true, allIds: [1], visibleIds: [1], viewKey: '' })
    first.unmount()
    const lots = [2, 3, 4, 5, 6, 1]
    const back = hook({ scope: 's7', ready: false, allIds: [], visibleIds: [], viewKey: '' })
    back.rerender({ scope: 's7', ready: true, allIds: lots, visibleIds: lots, viewKey: '' })
    for (const id of lots) expect(back.result.current.arrival(id)).toBe('none')
  })

  it('opens an undo, even for a row that was new on arrival', () => {
    // Undo puts a row back while the list is up: it has to make room.
    const first = hook({ scope: 's8', ready: false, allIds: [], visibleIds: [], viewKey: '' })
    first.rerender({ scope: 's8', ready: true, allIds: [1], visibleIds: [1], viewKey: '' })
    first.unmount()
    const back = hook({ scope: 's8', ready: false, allIds: [], visibleIds: [], viewKey: '' })
    back.rerender({ scope: 's8', ready: true, allIds: [2, 1], visibleIds: [2, 1], viewKey: '' })
    back.rerender({ scope: 's8', ready: true, allIds: [1], visibleIds: [1], viewKey: '' }) // deleted
    back.rerender({ scope: 's8', ready: true, allIds: [2, 1], visibleIds: [2, 1], viewKey: '' }) // undone
    expect(back.result.current.arrival(2)).toBe('expand')
  })
})

describe('RowDivider', () => {
  it('takes no space when hidden, a hairline when not', () => {
    const { container, rerender } = render(<RowDivider hidden />)
    expect(container.firstChild.className).toContain('h-0')
    rerender(<RowDivider hidden={false} />)
    expect(container.firstChild.className).toContain('h-px')
  })
})

describe('PresenceItem', () => {
  it('lets a removed row go even where nothing can animate it', async () => {
    // jsdom has no element.animate. A row that leaves must still leave.
    function List({ ids }) {
      return (
        <AnimatePresence initial={false}>
          {ids.map(id => <PresenceItem key={id}><p>row {id}</p></PresenceItem>)}
        </AnimatePresence>
      )
    }
    const { rerender, queryByText } = render(<List ids={[1, 2]} />)
    await act(async () => { rerender(<List ids={[1]} />) })
    expect(queryByText('row 2')).toBe(null)
    expect(queryByText('row 1')).not.toBe(null)
  })
})
