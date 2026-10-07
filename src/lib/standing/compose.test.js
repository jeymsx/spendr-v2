import { describe, it, expect } from 'vitest'
import { LIMITS, composeNote, noteText, normalise } from './compose'
import { SAMPLE_FACTS, SCENARIOS } from './scenarios'
import { countObjects, countWords, textOf } from './tokens'

/** Anything a note must never say. */
const BAD = [/NaN/, /undefined/, /Infinity/, /null/, /\[object/, /—/, /–/, / {2}/, / [.,;:!?]/, /\$\{/, /₱-/, /-₱/, /\bnan\b/i]

/** @param {import('./compose').Note} note */
function allTokens(note) {
  return note.paragraphs.flatMap(p => p.tokens)
}

/** @param {import('./compose').Note} note */
function checkNote(note, label = '') {
  const text = noteText(note)
  for (const re of BAD) expect(text, `${label} -> ${re}\n${text}`).not.toMatch(re)
  expect(note.title.length).toBeGreaterThan(0)
  expect(note.paragraphs.length).toBeGreaterThanOrEqual(1)
  // Always something to end on.
  expect(note.paragraphs.at(-1)?.id, label).toBe('c')
  const tokens = allTokens(note)
  expect(countObjects(tokens), label).toBeLessThanOrEqual(LIMITS.objects)
  expect(countWords(tokens), `${label}\n${text}`).toBeLessThanOrEqual(LIMITS.words)
  for (const t of tokens) {
    expect(['t', 'fig', 'cat', 'acct', 'date', 'pace', 'split', 'dotfig', 'arrow', 'spark']).toContain(t.k)
    if (t.k === 't' || t.k === 'fig' || t.k === 'dotfig') expect(t.v.length, label).toBeGreaterThan(0)
    if (t.k === 'pace') { expect(Number.isFinite(t.used)).toBe(true); expect(Number.isFinite(t.elapsed)).toBe(true) }
    if (t.k === 'split') { expect(t.parts.length).toBeGreaterThan(0); for (const p of t.parts) expect(Number.isFinite(p.v) && p.v >= 0).toBe(true) }
    if (t.k === 'spark') for (const v of t.values) expect(Number.isFinite(v)).toBe(true)
  }
  // Sentence case, and every paragraph ends like a sentence.
  for (const p of note.paragraphs) expect(textOf(p.tokens), label).toMatch(/[.?!]$/)
}

describe('every scenario', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.id}: reads as ${sc.level}, and is a clean note`, () => {
      const note = composeNote(sc.facts)
      expect(note.level.id).toBe(sc.level)
      checkNote(note, sc.id)
    })
  }

  it('has a scenario for each standing', () => {
    expect(new Set(SCENARIOS.map(s => s.level))).toEqual(new Set(['fresh', 'short', 'tight', 'hot', 'steady', 'ahead']))
  })
})

describe('the sample data note', () => {
  const note = composeNote(SAMPLE_FACTS)
  const text = noteText(note)

  it('is addressed to the person', () => {
    expect(note.title).toBe('Hi, James.')
    expect(note.eyebrow).toEqual({ date: 'Wednesday, Oct 7', day: 'Day 7 of 31' })
  })

  it('says what a day is worth, and does not alarm about the rent', () => {
    expect(text).toMatch(/₱937 a day/)
    expect(text).toMatch(/48% of the budget is gone, and 28% without Rent/)
  })

  it('says what is coming, and what the net worth is made of', () => {
    expect(text).toMatch(/₱5,607 in bills coming, then your ₱24,000 salary lands Oct 15/)
    expect(text).toMatch(/Net worth ₱141,400: ₱47\.6K spend, ₱52K saved, ₱52\.3K invested and ₱11\.5K owed/)
  })

  it('is short: a glance, not a page', () => {
    expect(countWords(allTokens(note))).toBeLessThanOrEqual(52)
    expect(note.paragraphs).toHaveLength(3)
  })

  it('draws the figures it can: the pace, the split, the date, the tile', () => {
    const kinds = allTokens(note).map(t => t.k)
    for (const k of ['pace', 'split', 'date', 'cat', 'dotfig']) expect(kinds).toContain(k)
  })
})

describe('determinism', () => {
  it('writes the same note for the same facts and the same day', () => {
    for (const sc of SCENARIOS) expect(composeNote(sc.facts)).toEqual(composeNote(sc.facts))
  })

  it('does not change with the time of day within a day, except where the hour matters', () => {
    const a = noteText(composeNote({ ...SAMPLE_FACTS, now: new Date(2026, 9, 7, 9, 0) }))
    const b = noteText(composeNote({ ...SAMPLE_FACTS, now: new Date(2026, 9, 7, 15, 0) }))
    expect(a).toBe(b)
  })

  it('words things differently on different days', () => {
    const seen = new Set()
    for (let salt = 0; salt < 30; salt++) seen.add(noteText(composeNote(SAMPLE_FACTS, { salt })))
    expect(seen.size).toBeGreaterThan(3)
    for (const text of seen) expect(text).toMatch(/Hi, James\./)
  })

  it('every day of wording is a clean note, in every scenario', () => {
    for (const sc of SCENARIOS) for (let salt = 0; salt < 30; salt++) checkNote(composeNote(sc.facts, { salt }), `${sc.id}#${salt}`)
  }, 60_000)
})

describe('the last line', () => {
  it('is never a question when the money is short or tight', () => {
    for (const sc of SCENARIOS.filter(s => s.level === 'short' || s.level === 'tight')) {
      for (let salt = 0; salt < 40; salt++) {
        const last = composeNote(sc.facts, { salt }).paragraphs.at(-1)
        expect(last?.kind, `${sc.id}#${salt}`).not.toBe('question')
      }
    }
  })

  it('leans on the thing that is due, when something is due tomorrow', () => {
    const card = SCENARIOS.find(s => s.id === 'card-due')
    expect(noteText(composeNote(card.facts))).toMatch(/Pay BPI Credit tomorrow and that ₱14,200 is done\./)
  })

  it('does not say a bill twice: when the last line covers it, the paragraph above leaves it out', () => {
    const card = SCENARIOS.find(s => s.id === 'card-due')
    const note = composeNote(card.facts)
    expect(note.ids).toContain('n-due')
    expect(note.ids).not.toContain('due-soon')
  })

  it('alternates between a nudge, a question, a notice and a win across days, when the facts allow it', () => {
    const kinds = new Set()
    for (let salt = 0; salt < 60; salt++) kinds.add(composeNote(SAMPLE_FACTS, { salt }).paragraphs.at(-1)?.kind)
    expect(kinds.size).toBeGreaterThanOrEqual(2)
  })

  it('on payday, says what to do with it', () => {
    const payday = SCENARIOS.find(s => s.id === 'payday')
    expect(composeNote(payday.facts).occasion).toBe('payday')
    expect(noteText(composeNote(payday.facts))).toMatch(/Payday\. Set aside ₱5,607/)
  })

  it('in the evening with nothing logged, asks about the day', () => {
    const late = SCENARIOS.find(s => s.id === 'late-log')
    const seen = new Set()
    for (let salt = 0; salt < 60; salt++) seen.add(composeNote(late.facts, { salt }).paragraphs.at(-1)?.tokens.length)
    expect(noteText(composeNote(late.facts, { hour: 21 }))).toMatch(/Nothing spent today, with|₱0 today, with|and nothing spent today/)
  })
})

describe('the standing sets the tone', () => {
  it('a short month says so first, and tells you to hold off', () => {
    const sc = SCENARIOS.find(s => s.id === 'short')
    const text = noteText(composeNote(sc.facts))
    expect(text).toMatch(/Cash runs out on Oct 12 if nothing changes\./)
    expect(text).toMatch(/Hold off on anything big until payday\./)
  })

  it('a month past its budget says by how much', () => {
    const sc = SCENARIOS.find(s => s.id === 'over')
    expect(noteText(composeNote(sc.facts))).toMatch(/You're ₱3,200 past this month's budget\./)
  })

  it('a comfortable month says how far under it is', () => {
    const sc = SCENARIOS.find(s => s.id === 'ahead')
    expect(noteText(composeNote(sc.facts))).toMatch(/Only 32% of the budget is gone, with 58% of the month\./)
  })

  it('a new ledger is told what to do, not shown a page of zeros', () => {
    const sc = SCENARIOS.find(s => s.id === 'nothing')
    const note = composeNote(sc.facts)
    expect(note.title).toBe('Hi there.')
    expect(noteText(note)).toMatch(/Nothing to read yet/)
    expect(noteText(note)).not.toMatch(/₱/)
  })

  it('a dollar ledger is written in dollars', () => {
    const sc = SCENARIOS.find(s => s.id === 'no-name-usd')
    const text = noteText(composeNote(sc.facts))
    expect(text).toMatch(/\$75 a day/)
    expect(text).not.toMatch(/₱/)
  })

  it('a net worth below zero is said plainly', () => {
    const sc = SCENARIOS.find(s => s.id === 'underwater')
    expect(noteText(composeNote(sc.facts))).toMatch(/You owe ₱14,200 more than you have\./)
  })
})

describe('the turn of the month and of the day', () => {
  it('on the last day, says it is the last', () => {
    const f = { ...SAMPLE_FACTS, now: new Date(2026, 9, 31, 10, 0) }
    expect(noteText(composeNote(f))).toMatch(/Last day of October, with ₱\d[\d,]* left\./)
  })

  it('in the first days, looks back at last month', () => {
    const sc = SCENARIOS.find(s => s.id === 'month-start')
    expect(noteText(composeNote(sc.facts))).toMatch(/September/)
    expect(composeNote(sc.facts).occasion).toBe('monthStart')
  })

  it('in the last days, counts what is left', () => {
    const sc = SCENARIOS.find(s => s.id === 'month-end')
    expect(noteText(composeNote(sc.facts))).toMatch(/3 days left, with ₱6,800 still in the budget/)
    expect(composeNote(sc.facts).occasion).toBe('monthEnd')
  })

  it('says "today" differently late in the evening', () => {
    const a = noteText(composeNote({ ...SAMPLE_FACTS, month: { ...SAMPLE_FACTS.month, spentToday: 0 } }, { hour: 10 }))
    const b = noteText(composeNote({ ...SAMPLE_FACTS, month: { ...SAMPLE_FACTS.month, spentToday: 0 } }, { hour: 21 }))
    expect(a).toMatch(/spent today, with|Nothing spent today so far|nothing yet today/)
    expect(b).not.toMatch(/so far|yet today/)
  })
})

describe('what is missing is left out, not made up', () => {
  it('says nothing about a budget when there is none', () => {
    const text = noteText(composeNote({ ...SAMPLE_FACTS, budget: null }))
    expect(text).not.toMatch(/budget/)
  })

  it('says nothing about bills or pay when there is no forecast', () => {
    const text = noteText(composeNote({ ...SAMPLE_FACTS, plan: null }))
    expect(text).not.toMatch(/salary|in bills|safe to spend/)
  })

  it('says nothing about last month when there was none', () => {
    const f = { ...SAMPLE_FACTS, month: { ...SAMPLE_FACTS.month, prevSpent: /** @type {number|null} */ (null) } }
    expect(noteText(composeNote(f))).not.toMatch(/last month/)
  })

  it('says nothing about net worth when it is not known', () => {
    expect(noteText(composeNote({ ...SAMPLE_FACTS, worth: null }))).not.toMatch(/net worth/)
  })

  it('copes with nothing at all', () => {
    checkNote(composeNote({}), 'empty')
    checkNote(composeNote({ now: new Date('nonsense') }), 'bad date')
  })
})

describe('normalise', () => {
  it('takes the day and the length of the month from the date, whatever the month says', () => {
    const f = normalise({ now: new Date(2026, 1, 11), month: /** @type {any} */ ({ day: 3, days: 99, spent: 10 }) })
    expect(f.month.day).toBe(11)
    expect(f.month.days).toBe(28)
    expect(f.month.spent).toBe(10)
  })
})

// ── Anything at all: facts of every shape, thin, odd or extreme ──────────────

/** A small seeded generator, so a failure can be reproduced. @param {number} seed */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** @param {() => number} r */
function randomFacts(r) {
  const pick = (/** @type {any[]} */ xs) => xs[Math.floor(r() * xs.length)]
  const money = () => pick([0, 0, 1, 12.5, 99.99, 340, 936.8, 1500, 12000, 45000, 250000, 3_000_000, -50, -12000, NaN, Infinity, null, undefined])
  const maybe = (/** @type {() => any} */ make, p = 0.7) => (r() < p ? make() : null)
  const day = 1 + Math.floor(r() * 31)
  const now = new Date(2026, Math.floor(r() * 12), Math.min(day, 28) + (r() < 0.2 ? 3 : 0), Math.floor(r() * 24), Math.floor(r() * 60))
  const cats = ['Rent', 'Food', 'Groceries', 'Transpo', 'Shopping', 'Bills', 'Fun', 'Health']
  const date = () => new Date(now.getFullYear(), now.getMonth(), now.getDate() + Math.floor(r() * 40) - 5)
  return {
    now,
    name: pick(['James', '', '  ', 'Alexander M.', 'Zoë', 'A'.repeat(40)]),
    currency: pick(['', 'PHP', 'USD', 'JPY', 'KWD']),
    txCount: pick([0, 1, 4, 5, 6, 200, NaN]),
    loggedToday: pick([0, 0, 1, 3]),
    month: {
      spent: money(), earned: money(), spentToday: money(), spentYesterday: maybe(money), prevSpent: maybe(money), quietRun: pick([0, 1, 2, 3, 9, 400]),
      biggestDay: maybe(() => ({ label: 'Oct 5', amount: money() })),
      byCategory: maybe(() => cats.slice(0, Math.floor(r() * 5)).map(name => ({ name, value: money() })), 0.8) ?? [],
      biggestBuy: maybe(() => ({ name: pick(['Decathlon', 'Sneakers', '']), amount: money(), category: null })),
      last7: pick([[], [1, 2, 3], [100, 0, 50, 0, 0, 3000, 12], [NaN, 1, 2, 3, 4, 5, 6]]),
      weekday: maybe(() => ({ name: 'Wednesdays', rank: pick(['quiet', 'busy', null]) }), 0.3),
    },
    budget: maybe(() => ({ total: money(), rows: cats.slice(0, Math.floor(r() * 9)).map(name => ({ name, budget: money(), spent: money(), fixed: r() < 0.2 })) })),
    plan: maybe(() => ({
      safe: maybe(money), payDate: maybe(date), payName: maybe(() => pick(['Salary', 'Paycheck', 'GCash sale', ''])), payAmount: maybe(money),
      bills: Array.from({ length: Math.floor(r() * 5) }, (_, i) => ({ name: `Bill ${i}`, amount: money(), date: date(), kind: pick(['bill', 'card', 'loan']), account: maybe(() => 'BPI Credit'), overdue: r() < 0.15 })),
      shortOn: maybe(date, 0.2), belowFloorOn: maybe(date, 0.2), floor: money(), liquid: maybe(money),
    })),
    worth: maybe(() => ({ total: money(), spending: money(), savings: money(), invested: money(), owed: money(), owedToYou: money(), changeMonth: maybe(money) })),
    cards: Array.from({ length: Math.floor(r() * 3) }, () => ({ name: 'BPI Credit', owed: money(), limit: maybe(money), free: maybe(money) })),
    goal: maybe(() => ({ name: 'Emergency fund', saved: money(), target: money(), pct: pick([0, 30, 99.5, 100, 140, NaN]), left: money() }), 0.4),
    last: pick([{ spent: null, earned: null, label: null }, { spent: 41000, earned: 50000, label: 'September' }, { spent: NaN, earned: 1, label: 'September' }]),
  }
}

describe('facts of every kind', () => {
  it('always gives a clean note, whatever it is handed', () => {
    for (let i = 0; i < 4000; i++) {
      const facts = randomFacts(rng(i + 1))
      let note
      try { note = composeNote(/** @type {any} */ (facts), { salt: i % 9 }) } catch (e) { throw new Error(`seed ${i + 1} threw`, { cause: e }) }
      checkNote(note, `seed ${i + 1}`)
    }
  }, 60_000)

  it('never asks a question of a month that is short', () => {
    for (let i = 0; i < 1500; i++) {
      const note = composeNote(/** @type {any} */ (randomFacts(rng(9000 + i))), { salt: i % 5 })
      if (note.level.id === 'short') expect(note.paragraphs.at(-1)?.kind, `seed ${9000 + i}`).not.toBe('question')
    }
  }, 60_000)
})
