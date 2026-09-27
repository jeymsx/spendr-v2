// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { buildRecap } from '../../lib/recap'
import { recapSlides } from '../../lib/recapCopy'

/**
 * Does the recap render at all - every slide, for a month that has every
 * slide, and for one that has only the least of them.
 *
 * The gate around the recap is static and its maths is tested in lib/, but a
 * slide that throws on its first paint - a destructured undefined, a missing
 * import - reaches the person as the story going blank mid-month. So each
 * slide is mounted on its own, with the context the story gives it, and
 * asked to put its words on the page. Nothing here is about how it looks.
 *
 * jsdom has no layout and no canvas, so what the story can be asked about
 * here is its words, its controls and its keyboard; how it looks, and the
 * pictures it draws, are the browser's to check.
 */

vi.mock('../../db/db', () => ({ default: {}, dbReady: Promise.resolve() }))
vi.mock('../../hooks/useScrollLock', () => ({ useScrollLock: () => {} }))
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: () => {}, dismiss: () => {} }) }))

const { recapPalette, tonesFor } = await import('./theme')
const { SlideContext } = await import('./parts')
const slides = await import('./slides')
const { default: SummarySlide } = await import('./SummarySlide')
const { default: RecapStory } = await import('./RecapStory')

afterEach(cleanup)

const NOW = new Date(2026, 9, 3, 10)
const at = (/** @type {number} */ m, /** @type {number} */ d) => new Date(2026, m - 1, d, 12).toISOString()
let n = 0
const tx = (/** @type {Record<string, any>} */ r) => ({ txId: `s${n++}`, account: 'BPI', ...r })
const spend = (/** @type {number} */ m, /** @type {number} */ d, /** @type {number} */ amount, category = 'Food', description = 'Lunch') =>
  tx({ type: 'expense', amount, category, description, date: at(m, d) })
const earn = (/** @type {number} */ m, /** @type {number} */ d, /** @type {number} */ amount) =>
  tx({ type: 'inflow', amount, category: 'Salary', date: at(m, d) })

const categories = [
  { name: 'Food', icon: '🍔', type: 'expense', budget: 3000 },
  { name: 'Coffee', icon: '☕', type: 'expense', budget: 1000 },
  { name: 'Tech', icon: '💻', type: 'expense', budget: 0 },
]
const everything = [
  spend(8, 3, 900), earn(8, 15, 30000),
  earn(9, 15, 38500), earn(9, 30, 38500),
  spend(9, 12, 18990, 'Tech', 'Sony WH-1000XM5 headphones'),
  ...[2, 4, 6, 9, 13, 17, 21].map(d => spend(9, d, 240, 'Coffee', 'Starbucks BGC')),
  ...[1, 5, 8, 14, 19, 25].map(d => spend(9, d, 3200)),
]
const full = buildRecap({
  month: '2026-09', transactions: everything, categories, now: NOW, priceOf: t => t.amount,
  badges: [{ key: 'seven-days', earnedAt: at(9, 20) }], netWorthNow: 214000,
})
// A first month with one purchase and no pay: the fewest slides a recap has.
const sparse = buildRecap({
  month: '2026-09', transactions: [spend(9, 20, 450)], categories, now: NOW, priceOf: t => t.amount, netWorthNow: 0,
})

const SLIDE_OF = {
  intro: slides.IntroSlide, spent: slides.SpentSlide, kept: slides.KeptSlide, categories: slides.CategoriesSlide,
  days: slides.DaysSlide, biggest: slides.BiggestSlide, goto: slides.GoToSlide, budgets: slides.BudgetsSlide,
  networth: slides.NetWorthSlide, badges: slides.BadgesSlide, personality: slides.PersonalitySlide,
}

/** @param {import('../../lib/recap').Recap} recap @param {string} id */
function renderSlide(recap, id) {
  const pal = recapPalette('#FCC419', 'light')
  const ids = recapSlides(recap)
  const tone = pal.tones[tonesFor(ids)[ids.indexOf(id)]]
  const Slide = SLIDE_OF[/** @type {keyof typeof SLIDE_OF} */ (id)]
  return render(
    <SlideContext.Provider value={{ pal, tone, currency: 'PHP', hold: () => {} }}>
      {id === 'summary' ? <SummarySlide recap={recap} name="Ana" onDone={() => {}} /> : <Slide recap={recap} name="Ana" />}
    </SlideContext.Provider>,
  )
}

/** What each slide must say, whatever it draws. */
const SAYS = {
  intro: /Ana's month in money/, spent: /You spent/, kept: /You kept/, categories: /Most went to/,
  days: /Your busiest day/, biggest: /Biggest purchase/, goto: /Your go-to/, budgets: /Budgets/,
  networth: /Net worth on/, badges: /A new (badge|milestone)|new (badges|milestones)|achievements/, personality: /Your money personality/, summary: /Spendr/,
}

describe('every slide renders', () => {
  it('has a month with every slide to try them on', () => {
    expect(recapSlides(full)).toEqual(Object.keys(SAYS))
  })

  for (const id of Object.keys(SAYS)) {
    it(`draws ${id}, and says what it is`, () => {
      const { container } = renderSlide(full, id)
      expect(container.textContent).toMatch(SAYS[/** @type {keyof typeof SAYS} */ (id)])
    })
  }

  it('draws the fewest slides a month can have', () => {
    const ids = recapSlides(sparse)
    expect(ids[0]).toBe('intro')
    expect(ids.at(-1)).toBe('summary')
    for (const id of ids) {
      const { container, unmount } = renderSlide(sparse, id)
      expect(container.textContent.length).toBeGreaterThan(0)
      unmount()
    }
  })
})

describe('the story', () => {
  /** @param {string} [name] */
  const open = (name) => render(
    <MemoryRouter>
      <RecapStory recap={full} currency="PHP" accent="#2D9DFF" theme="dark" name={name} onClose={() => {}} />
    </MemoryRouter>,
  )
  const live = () => document.querySelector('[role="dialog"] .sr-only[aria-live]')?.textContent
  const press = (/** @type {string} */ key) => act(() => { fireEvent.keyDown(window, { key }) })

  it('opens on the first slide, names itself, and moves with the keyboard', () => {
    open('Ana')
    expect(screen.getByRole('dialog', { name: 'September Wrapped' })).toBeTruthy()
    expect(live()).toMatch(/Slide 1 of 12: Your month/)
    press('ArrowRight')
    expect(live()).toMatch(/Slide 2 of 12: What you spent/)
    press(' ')
    expect(live()).toMatch(/, paused$/)
    expect(screen.getByRole('button', { name: 'Play recap' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('offers a share on every slide, and ends on Done and Share', () => {
    open()
    expect(screen.getByRole('button', { name: 'Share this slide' })).toBeTruthy()
    for (let i = 0; i < 13; i++) press('ArrowRight')
    expect(live()).toMatch(/Slide 12 of 12: Summary/)
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share your Wrapped' })).toBeTruthy()
  })

  it('shares from a sheet with a switch that hides the amounts', () => {
    open()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Share this slide' })) })
    expect(screen.getByRole('dialog', { name: 'Share this slide' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Hide amounts' })).toBeTruthy()
    // The story holds still, and leaves the keys to the sheet, while it is open.
    press('ArrowRight')
    expect(live()).toMatch(/Slide 1 of 12/)
  })
})
