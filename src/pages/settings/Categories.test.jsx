// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

/**
 * A category row says what its monthly limit is - for a category that can have
 * one. An inflow category (Salary, Gifts) has nothing to stay under, so a budget
 * it still carries from before the form stopped offering the field is a stray
 * number: it must not show on the row as if it were a limit.
 */

vi.mock('../../db/db', () => ({ default: {}, UNSYNCED: 0, SYNCED: 1 }))
vi.mock('../../components/CategoryGlyph', () => ({ default: () => null }))

const { CategoryRow } = await import('./Categories')

afterEach(cleanup)

/** @param {Record<string, any>} cat */
const row = (cat) => render(<CategoryRow cat={cat} onTap={() => {}} onLongPressDelete={() => {}} />)

describe('CategoryRow', () => {
  it('shows an expense category\'s monthly limit', () => {
    row({ name: 'Food', type: 'expense', budget: 8000 })
    expect(screen.getByText(/8,000.*\/ mo/)).toBeTruthy()
  })

  it('shows nothing for an expense category with no limit', () => {
    row({ name: 'Food', type: 'expense', budget: 0 })
    expect(screen.queryByText(/\/ mo/)).toBeNull()
  })

  it('hides the stray budget an inflow category still carries', () => {
    row({ name: 'Salary', type: 'inflow', budget: 50000 })
    expect(screen.getByText('Salary')).toBeTruthy()
    expect(screen.queryByText(/\/ mo/)).toBeNull()
  })
})
