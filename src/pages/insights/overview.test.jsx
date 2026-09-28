// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

/**
 * The top of the Insights overview, and the pieces its cards are made of.
 *
 * jsdom has no layout, no canvas and no animation, so the donut's ring and
 * the card-to-page transition are the browser's to check. What it can say
 * is the words and the ways out: that Net reads the way the month went, that
 * every card and every category leads where it should, and that a card
 * still gets you there with nothing to animate it.
 */

vi.mock('../../db/db', () => ({ default: {}, dbReady: Promise.resolve() }))
/* An empty period draws a glass picture, in the accent. */
vi.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', accentColor: '#2D9DFF' }) }))

const { StatPair, CategoryLegend, DonutHero } = await import('./Summary')
const { sparkPath } = await import('./Explore')
const { shownHighlights } = await import('./Highlights')
const { generateTrivia } = await import('./Trivia')

afterEach(cleanup)

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}

/** @param {import('react').ReactNode} ui */
const inRouter = (ui) => render(
  <MemoryRouter initialEntries={['/insights']}>
    <Routes>
      <Route path="/insights" element={ui} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>,
)

describe('Income and Net', () => {
  it('reads a kept month: what came in, and how much of it stayed', () => {
    inRouter(<StatPair income={38500} spent={29700} />)
    expect(screen.getByText('Income')).toBeTruthy()
    expect(screen.getByText('Net · 23% kept')).toBeTruthy()
    expect(screen.getByText(/^\+.*8\.8K$/)).toBeTruthy()
  })

  it('reads a month that went past what came in', () => {
    inRouter(<StatPair income={1000} spent={1500} />)
    expect(screen.getByText('Net · 50% over')).toBeTruthy()
    expect(screen.getByText(/^−.*500/)).toBeTruthy()
  })

  it('with nothing coming in, says only what net is', () => {
    inRouter(<StatPair income={0} spent={400} />)
    expect(screen.getByText('Net')).toBeTruthy()
  })

  it('each opens the Trend page on its own series - with nothing to animate, at once', () => {
    inRouter(<StatPair income={38500} spent={29700} />)
    fireEvent.click(screen.getByText('Income'))
    expect(screen.getByTestId('where').textContent).toBe('/insights/trend?type=income')
  })
})

describe('the legend', () => {
  const segments = [
    { name: 'Food & Drink', value: 1200, color: '#f00', icon: '🍔' },
    { name: '50% off', value: 800, color: '#0f0', icon: '🏷️' },
    { name: 'Bills', value: 400, color: '#00f', icon: '🧾' },
  ]

  it('is a way into each category, names encoded', () => {
    inRouter(<CategoryLegend segments={segments} selected={null} />)
    const hrefs = screen.getAllByRole('link').map(a => a.getAttribute('href'))
    expect(hrefs).toEqual(['/categories/Food%20%26%20Drink', '/categories/50%25%20off', '/categories/Bills'])
  })

  it('dims the others when a slice is picked', () => {
    inRouter(<CategoryLegend segments={segments} selected={1} />)
    const links = screen.getAllByRole('link')
    expect(links.map(a => a.className.includes('opacity-30'))).toEqual([true, false, true])
  })
})

describe('the donut\'s comparison', () => {
  const segments = [{ name: 'Food', value: 100, color: '#f00', icon: '🍔' }]

  it('says which way spending went, against what', () => {
    inRouter(<DonutHero segments={segments} total={100} animKey="k" selected={null} onSelect={() => {}}
      change={{ pct: 12, up: false, same: false }} compareLabel="Aug 1–27" emptyPhrase="this month" />)
    expect(screen.getByText('↓ 12% vs Aug 1–27')).toBeTruthy()
  })

  it('says so when nothing moved', () => {
    inRouter(<DonutHero segments={segments} total={100} animKey="k" selected={null} onSelect={() => {}}
      change={{ pct: 0, up: false, same: true }} compareLabel="last week" emptyPhrase="this month" />)
    expect(screen.getByText('Same as last week')).toBeTruthy()
  })

  it('is left out when there is nothing to compare with', () => {
    const { container } = inRouter(<DonutHero segments={segments} total={100} animKey="k" selected={null} onSelect={() => {}}
      change={null} compareLabel={null} emptyPhrase="this month" />)
    expect(container.textContent).not.toMatch(/vs /)
  })

  it('an empty period says so, in its own words', () => {
    inRouter(<DonutHero segments={[]} total={0} animKey="k" selected={null} onSelect={() => {}}
      change={null} compareLabel={null} emptyPhrase="in August" />)
    expect(screen.getByText('No expenses in August')).toBeTruthy()
  })
})

describe('sparkPath', () => {
  it('draws from zero up, across the box', () => {
    expect(sparkPath([0, 10, 5])).toBe('M0.00,30.00L50.00,2.00L100.00,16.00')
  })

  it('or across the values\' own range, for a figure nowhere near zero', () => {
    expect(sparkPath([100, 110], { zero: false })).toBe('M0.00,30.00L100.00,2.00')
  })

  it('needs two points to be a line', () => {
    expect(sparkPath([5])).toBe('')
  })
})

describe('highlights', () => {
  const base = {
    expenses: [{ type: 'expense', amount: 500, date: new Date(2026, 8, 6, 12).toISOString(), category: 'Food', description: 'Lunch' }],
    inflows: [], totalSpent: 500, totalEarned: 1000,
    categorySegments: [{ name: 'Food', value: 500, icon: '🍔' }], topCategory: { name: 'Food', value: 500, icon: '🍔' },
    dailyData: [{ day: 5, value: 0, label: 'Sep 5' }, { day: 6, value: 500, label: 'Sep 6' }],
    topExpenses: [{ type: 'expense', amount: 500, category: 'Food', description: 'Lunch' }],
    budgetData: [], monthName: 'September',
  }

  it('each fact carries a key, and the biggest day is named by its label', () => {
    const items = generateTrivia(base)
    expect(items.map(i => i.key)).toContain('peak-day')
    expect(items.find(i => i.key === 'peak-day')?.text).toMatch(/Your biggest day was Sep 6/)
    expect(items.find(i => i.key === 'quiet-days')?.text).toBe('No spending on 1 of 2 days in September.')
  })

  it('leaves out what the page already says: the savings rate and the biggest purchase', () => {
    const shown = shownHighlights(generateTrivia(base)).map(i => i.key)
    expect(shown).not.toContain('savings')
    expect(shown).not.toContain('biggest')
    expect(shown.length).toBeGreaterThan(0)
  })

  it('says it without an em dash', () => {
    expect(generateTrivia(base).every(i => !/—/.test(i.text))).toBe(true)
  })
})
