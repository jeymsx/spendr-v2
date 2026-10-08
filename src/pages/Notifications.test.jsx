// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The notifications list, laid out as the ledger is: a heading and a card
 * per day, a tile on every row.
 *
 * The store is stood in for by the two reads the page makes - newest first,
 * and which are unread - over a fixed list, so what is pinned is the page's
 * grouping and its words, not Dexie.
 */

/* Noon on a calendar day, not a multiple of 24 hours back: across a clock
   change, 24 hours before just after midnight is two days ago. */
/** @param {number} daysAgo */
const noon = (daysAgo) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}
/** @param {string} id @param {string} kind @param {number} daysAgo @param {Record<string, any>} [more] */
const row = (id, kind, daysAgo, more = {}) => ({
  id, kind, at: noon(daysAgo), title: `Title ${id}`, body: `Body ${id}`, url: '/budget', read: 1, ...more,
})
const ROWS = [
  row('a', 'card-overdue', 0, { read: 0 }),
  row('b', 'badge', 0),
  row('c', 'bill-due', 0, { read: 0 }),
  row('d', 'recap', 1),
  row('e', 'from-a-newer-version', 1, { body: '' }),
]

vi.mock('../db/db', () => ({
  default: {
    notifications: {
      orderBy: () => ({ reverse: () => ({ toArray: async () => [...ROWS].sort((x, y) => y.at.localeCompare(x.at)) }) }),
      where: () => ({ equals: () => ({ primaryKeys: async () => ROWS.filter(r => r.read === 0).map(r => r.id) }) }),
    },
    // No Getting started list on this device (hooks/useGettingStarted).
    meta: { get: async () => undefined },
  },
}))
vi.mock('../db/notifications', () => ({ markRead: async () => {} }))
vi.mock('../hooks/useLiveQuery', async () => {
  const { useEffect, useState } = await import('react')
  return {
    /** @param {() => Promise<any>} querier */
    useLiveQuery: (querier, _deps, initial) => {
      const [value, setValue] = useState(initial)
      // Read once, on mount: the list here never changes, and the page's
      // querier is a new function every render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useEffect(() => { querier().then(setValue) }, [])
      return value
    },
  }
})

const { default: Notifications } = await import('./Notifications')

afterEach(cleanup)

const renderPage = () => render(<MemoryRouter><Notifications /></MemoryRouter>)

describe('Notifications', () => {
  it('puts each day in a card of its own, under its heading', async () => {
    renderPage()
    const today = await screen.findByRole('region', { name: 'Today' })
    const yesterday = screen.getByRole('region', { name: 'Yesterday' })
    expect(within(today).getAllByRole('listitem')).toHaveLength(3)
    expect(within(yesterday).getAllByRole('listitem')).toHaveLength(2)
    expect(today.querySelector('.card')).toBeTruthy()
    expect(yesterday.querySelector('.card')).toBeTruthy()
  })

  it('says how many of a day are new, and marks each one', async () => {
    renderPage()
    const today = await screen.findByRole('region', { name: 'Today' })
    expect(within(today).getByText('2 new')).toBeTruthy()
    expect(within(today).getAllByText('New')).toHaveLength(2)
    // A day with nothing new says nothing about it.
    expect(within(screen.getByRole('region', { name: 'Yesterday' })).queryByText(/new$/)).toBeNull()
  })

  it('gives every row a tile, a kind it does not know included', async () => {
    renderPage()
    await screen.findByText('Title e')
    const tiles = document.querySelectorAll('.cat-tile')
    expect(tiles).toHaveLength(ROWS.length)
    // The known kinds say their urgency in colour; the unknown one keeps the tile's own slate.
    const unknown = screen.getByText('Title e').closest('button')?.querySelector('.cat-tile')
    expect(/** @type {HTMLElement} */ (unknown).style.getPropertyValue('--cat-color')).toBe('')
    const overdue = screen.getByText('Title a').closest('button')?.querySelector('.cat-tile')
    expect(/** @type {HTMLElement} */ (overdue).style.getPropertyValue('--cat-color')).not.toBe('')
  })

  it('shows a title alone when there is nothing more to say', async () => {
    renderPage()
    const title = await screen.findByText('Title e')
    expect(title.closest('button')?.textContent).not.toContain('Body')
  })
})
