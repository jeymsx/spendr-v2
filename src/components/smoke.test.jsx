// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

/**
 * Does it render at all.
 *
 * ── Why this exists ──
 *
 * Every other test here pins a pure function, and the gate around them is
 * static: a type checker, a scope checker, a build. None of that renders
 * anything, and the failure they cannot see is the one that matters most -
 * a component that throws on its first paint, which reaches the user as a
 * blank screen with a stack trace in a console they will never open.
 *
 * This is deliberately shallow. It asserts that the newest screens mount and
 * put their own words on the page, nothing about how they look. A screenshot
 * test would be a better answer and a worse trade; this one runs in a second
 * and catches the class of mistake that actually ships: a bad import, a
 * destructured undefined, a hook called conditionally, a JSX comment that
 * turns into visible text.
 *
 * The contexts are mocked rather than provided. Wrapping in the real ones
 * drags in Dexie, a Supabase client and localStorage, none of which say
 * anything about whether the markup is sound.
 */

vi.mock('../db/db', () => ({
  default: {},
  UNSYNCED: 0,
  SYNCED: 1,
  SYNCED_TABLES: [],
}))
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: () => {}, accentColor: '#2D9DFF' }),
}))
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: () => {}, dismiss: () => {} }),
}))
/* The dedupe sheet surveys on open. Stubbed rather than given a fake Dexie:
   what is being checked is that it renders what the planner hands it. */
vi.mock('../lib/dedupeWrite', () => ({
  surveyDuplicates: async () => ({
    total: 3,
    debts: {
      rows: 4, real: 2, removes: 2,
      groups: [{
        key: 'k1',
        keep: { id: 5, contact: 'Robina', amount: 527 },
        drop: [{ id: 6 }, { id: 21 }],
      }],
    },
    recurring: {
      rows: 2, real: 1, removes: 1,
      groups: [{ key: 'k2', keep: { id: 2, name: 'Spotify', amount: 229 }, drop: [{ id: 5 }] }],
    },
    templates: { rows: 1, real: 1, removes: 0, groups: [] },
  }),
  applyDedupe: async () => ({ removed: 3 }),
}))

const { default: SwipeConfirm } = await import('./SwipeConfirm')
const { default: AmountInput } = await import('./ui/AmountInput')
const { default: DeleteConfirmSheet } = await import('./DeleteConfirmSheet')
const { default: PeopleSplit, EMPTY_SPLIT } = await import('./PeopleSplit')
const { DedupeSheet } = await import('../pages/settings/Dedupe')

afterEach(cleanup)

describe('SwipeConfirm', () => {
  /* role=button, not slider: it commits rather than selects a value, and
     Enter or Space does the whole thing for anyone who cannot drag. */
  it('renders its label, and is reachable as a control', () => {
    render(<SwipeConfirm label="Swipe to delete" onConfirm={() => {}} />)
    expect(screen.getByRole('button', { name: 'Swipe to delete' })).toBeTruthy()
  })

  /* The tone added for deletes. A bad key here would silently fall back to
     the accent colour, which is the one thing a delete must not look like. */
  it('takes the danger tone without falling over', () => {
    const { container } = render(
      <SwipeConfirm tone="danger" label="Swipe to delete" onConfirm={() => {}} />)
    expect(container.querySelector('.bg-red-500')).toBeTruthy()
  })

  it('says it is working while it is', () => {
    render(<SwipeConfirm busy label="Swipe to delete" confirmingLabel="Deleting…" onConfirm={() => {}} />)
    expect(screen.getByText('Deleting…')).toBeTruthy()
  })
})

describe('AmountInput', () => {
  /* The mark is part of the value, which is the whole change. If it ever goes
     back to being a sibling span this reads "500" and fails. */
  it('puts the peso sign in the value', () => {
    render(<AmountInput value="500" onChange={() => {}} label="Amount" />)
    expect(screen.getByLabelText('Amount').value).toBe('₱500')
  })

  it('stays empty when there is nothing typed, so the placeholder shows', () => {
    render(<AmountInput value="" onChange={() => {}} label="Amount" />)
    const el = screen.getByLabelText('Amount')
    expect(el.value).toBe('')
    expect(el.placeholder).toBe('₱0')
  })

  it('carries a sign in front of the mark when asked', () => {
    render(<AmountInput value="500" sign="−" onChange={() => {}} label="Amount" />)
    expect(screen.getByLabelText('Amount').value).toBe('−₱500')
  })
})

describe('DeleteConfirmSheet', () => {
  it('asks the question and offers the drag', () => {
    render(
      <DeleteConfirmSheet
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="Delete this bill?"
        body="Charges already posted stay in the ledger."
        amount="₱699.00"
      />,
    )
    expect(screen.getByText('Delete this bill?')).toBeTruthy()
    expect(screen.getByText('₱699.00')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Swipe to delete' })).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('renders nothing while closed', () => {
    const { container } = render(
      <DeleteConfirmSheet open={false} onClose={() => {}} onConfirm={() => {}} title="Gone?" />)
    expect(container.textContent).not.toContain('Gone?')
  })
})

describe('PeopleSplit', () => {
  const withTwo = {
    ...EMPTY_SPLIT,
    people: [{ name: 'Gelo', value: '', included: true }],
  }

  it('renders the editor and the people in it', () => {
    render(<PeopleSplit total={1000} value={withTwo} onChange={() => {}} />)
    expect(screen.getByText('Add someone')).toBeTruthy()
    expect(screen.getByDisplayValue('Gelo')).toBeTruthy()
  })

  /* The chip only exists when there is more than one category to choose. */
  it('offers no category chip for a single-category purchase', () => {
    render(<PeopleSplit total={1000} value={withTwo} onChange={() => {}} legCategories={[]} />)
    expect(screen.queryByText('Their share is for')).toBeNull()
  })

  it('offers the chip, as a real select, once there are two', () => {
    render(
      <PeopleSplit
        total={1000}
        value={withTwo}
        onChange={() => {}}
        legCategories={[{ id: 1, name: 'Groceries' }, { id: 2, name: 'Household' }]}
      />,
    )
    expect(screen.getByText('Their share is for')).toBeTruthy()
    const select = screen.getByLabelText('Which category Gelo is sharing')
    expect(select.tagName).toBe('SELECT')
    expect([...select.options].map(o => o.textContent))
      .toEqual(['the whole purchase', 'Groceries', 'Household'])
  })

  /* Exact is the one mode where the typed figure IS the share, so the row
     shows one field rather than two. */
  it('gives Exact a single editable amount carrying the mark', () => {
    render(
      <PeopleSplit
        total={1000}
        value={{ ...withTwo, mode: 'exact', people: [{ name: 'Gelo', value: '250', included: true }] }}
        onChange={() => {}}
      />,
    )
    expect(screen.getByLabelText('Amount for Gelo').value).toBe('₱250')
    expect(screen.queryByLabelText('exact value for Gelo')).toBeNull()
  })

  it('keeps two fields in Percent, where they are different numbers', () => {
    render(
      <PeopleSplit
        total={1000}
        value={{ ...withTwo, mode: 'percent', people: [{ name: 'Gelo', value: '30', included: true }] }}
        onChange={() => {}}
      />,
    )
    expect(screen.getByLabelText('percent value for Gelo').value).toBe('30')
    expect(screen.queryByLabelText('Amount for Gelo')).toBeNull()
  })
})

describe('DedupeSheet', () => {
  /* It deletes financial records, so it has to name them before it does.
     findBy, because the survey is async. */
  it('names every group and offers the drag once it has counted', async () => {
    render(<DedupeSheet open onClose={() => {}} />)

    expect(await screen.findByText(/Robina/)).toBeTruthy()
    expect(screen.getByText(/Spotify/)).toBeTruthy()
    expect(screen.getByText('4 rows → 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Swipe to merge 3' })).toBeTruthy()
  })

  it('says how many copies of each there are', async () => {
    render(<DedupeSheet open onClose={() => {}} />)
    expect(await screen.findByText('stored 3 times')).toBeTruthy()
    expect(screen.getByText('stored 2 times')).toBeTruthy()
  })
})
