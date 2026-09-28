// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { ListEnd, useInfiniteList } from './InfiniteList'

/**
 * A list that grows as its end comes near. jsdom has no IntersectionObserver,
 * so a stand-in records each one made and lets a test say "the marker is in
 * view" - what the browser would report as the user scrolled.
 */

/** @type {Array<{cb: (entries: any[]) => void, disconnected: boolean}>} */
let observers = []
beforeEach(() => {
  observers = []
  // @ts-ignore - test stand-in
  window.IntersectionObserver = class {
    /** @param {(entries: any[]) => void} cb */
    constructor(cb) { this.rec = { cb, disconnected: false }; observers.push(this.rec) }
    observe() {}
    disconnect() { this.rec.disconnected = true }
  }
})
afterEach(cleanup)

/** The live observer, told the marker is in view. */
const scrollToEnd = () => act(() => { observers.filter(o => !o.disconnected).at(-1)?.cb([{ isIntersecting: true }]) })

const rows = (/** @type {number} */ n) => Array.from({ length: n }, (_, i) => `Row ${i + 1}`)

/** @param {{items: string[], resetKey?: string}} props */
function List({ items, resetKey = 'a' }) {
  const list = useInfiniteList(items, { page: 10, resetKey })
  return (
    <div>
      {list.visible.map(r => <p key={r}>{r}</p>)}
      <ListEnd list={list} done={`All ${items.length}`} />
    </div>
  )
}

describe('useInfiniteList and ListEnd', () => {
  it('shows one page, and the next as the end comes near', () => {
    render(<List items={rows(25)} />)
    expect(screen.queryByText('Row 10')).not.toBeNull()
    expect(screen.queryByText('Row 11')).toBeNull()
    scrollToEnd()
    expect(screen.queryByText('Row 20')).not.toBeNull()
    expect(screen.queryByText('Row 21')).toBeNull()
  })

  it('says the list is complete once it is, and stops watching', () => {
    render(<List items={rows(25)} />)
    scrollToEnd()
    scrollToEnd()
    expect(screen.queryByText('Row 25')).not.toBeNull()
    expect(screen.queryByText('All 25')).not.toBeNull()
    expect(observers.every(o => o.disconnected)).toBe(true)
  })

  it('ends a list that fits on one page without a caption', () => {
    render(<List items={rows(6)} />)
    expect(screen.queryByText('Row 6')).not.toBeNull()
    expect(screen.queryByText('All 6')).toBeNull()
    expect(observers).toHaveLength(0)
  })

  it('starts again from one page when it becomes a different list', () => {
    const { rerender } = render(<List items={rows(40)} resetKey="a" />)
    scrollToEnd()
    scrollToEnd()
    expect(screen.queryByText('Row 30')).not.toBeNull()
    rerender(<List items={rows(40)} resetKey="b" />)
    expect(screen.queryByText('Row 10')).not.toBeNull()
    expect(screen.queryByText('Row 11')).toBeNull()
  })
})
