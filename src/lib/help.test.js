import { describe, it, expect } from 'vitest'
// @ts-ignore - the logic layer is typed without node's types; this test reads the router's source
import { readFileSync } from 'node:fs'
import { HELP_ARTICLES, HELP_TOPICS, HELP_SHOTS, HELP_POPULAR, HELP_QUICK, helpArticle, articlesIn } from './help.js'
import { searchHelp, fold } from './helpSearch.js'

/**
 * The help centre is read by people who are stuck, so a broken link in it, a
 * picture that is not there or a button to a page that does not exist is
 * worse than no answer. These hold every article to the shape both readers
 * (the app and the website) depend on.
 */

/** The app's routes, read from the router itself, as patterns. */
const routes = [...readFileSync(new URL('../App.jsx', import.meta.url), 'utf8').matchAll(/path="([^"]+)"/g)]
  .map(m => m[1])
  .filter(p => p !== '*')
  .map(p => new RegExp('^' + p.replace(/:[a-zA-Z]+/g, '[^/]+').replace(/\*$/, '.*') + '$'))
const isRoute = (/** @type {string} */ to) => {
  const path = to.split(/[?#]/)[0]
  return routes.some(r => r.test(path))
}

/** Every string an article shows. @param {import('./help.js').HelpArticle} a */
const textOf = (a) => [
  a.title, a.summary, ...(a.keywords ?? []),
  ...a.body.flatMap(b => ('p' in b ? [b.p] : 'tip' in b ? [b.tip] : 'steps' in b ? b.steps : 'label' in b ? [b.label] : 'caption' in b && b.caption ? [b.caption] : [])),
]

describe('the help articles', () => {
  it('each has its own id, a known topic, and every field it needs', () => {
    const ids = new Set()
    const topics = new Set(HELP_TOPICS.map(t => t.id))
    for (const a of HELP_ARTICLES) {
      expect(a.id, a.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(ids.has(a.id), `two articles called ${a.id}`).toBe(false)
      ids.add(a.id)
      expect(topics.has(a.topic), `${a.id}: no topic ${a.topic}`).toBe(true)
      expect(a.title.length, a.id).toBeGreaterThan(5)
      expect(a.summary.length, `${a.id}: summary`).toBeGreaterThan(10)
      expect(a.summary.length, `${a.id}: summary is one sentence, not a paragraph`).toBeLessThanOrEqual(170)
      expect(a.body.length, `${a.id}: body`).toBeGreaterThan(0)
    }
  })

  it('every topic has articles', () => {
    for (const t of HELP_TOPICS) expect(articlesIn(t.id).length, t.id).toBeGreaterThan(0)
  })

  it('links only to articles that exist', () => {
    for (const a of HELP_ARTICLES) {
      for (const r of a.related ?? []) expect(helpArticle(r), `${a.id} -> ${r}`).not.toBeNull()
      expect((a.related ?? []).includes(a.id), `${a.id} links to itself`).toBe(false)
    }
    for (const id of [...HELP_POPULAR, ...HELP_QUICK]) expect(helpArticle(id), id).not.toBeNull()
  })

  it('shows only screenshots that exist', () => {
    for (const a of HELP_ARTICLES) {
      for (const b of a.body) if ('shot' in b) expect(HELP_SHOTS, `${a.id}: ${b.shot}`).toContain(b.shot)
    }
  })

  it('sends people only to places in the app that exist', () => {
    expect(routes.length).toBeGreaterThan(20)
    for (const a of HELP_ARTICLES) {
      for (const b of a.body) {
        if (!('go' in b)) continue
        expect(b.go.startsWith('/'), `${a.id}: ${b.go}`).toBe(true)
        expect(isRoute(b.go), `${a.id}: no route for ${b.go}`).toBe(true)
        expect(b.label.length, `${a.id}: button label`).toBeGreaterThan(2)
      }
    }
  })

  it('is written the way the app is: no em dashes, no all-caps words, steps one at a time', () => {
    for (const a of HELP_ARTICLES) {
      for (const s of textOf(a)) {
        expect(s.includes('—') || s.includes('&mdash;'), `${a.id}: em dash in "${s.slice(0, 60)}"`).toBe(false)
        expect(/\b[A-Z]{4,}\b/.test(s.replace(/\b(PDF|CSV|PHP|USD|QR|PIN|GCASH|BPI|BDO|iOS|ID|URL)\b/g, '')), `${a.id}: shouting in "${s.slice(0, 60)}"`).toBe(false)
      }
      for (const b of a.body) if ('steps' in b) expect(b.steps.length, `${a.id}: steps`).toBeGreaterThan(1)
    }
  })

  it('has enough of them to be worth searching', () => {
    expect(HELP_ARTICLES.length).toBeGreaterThan(1)
  })
})

describe('searchHelp', () => {
  it('finds an article by its title first', () => {
    expect(searchHelp('getting started')[0]?.id).toBe('getting-started-list')
  })

  it('needs every word to be somewhere in the article', () => {
    expect(searchHelp('getting zebra')).toEqual([])
  })

  it('takes their words for the app’s', () => {
    expect(fold('Café’s')).toBe('cafes')
    // "tutorial" is a keyword of the Getting started list, not a word on the page.
    expect(searchHelp('tutorial').map(a => a.id)).toContain('getting-started-list')
  })

  it('finds nothing for nothing', () => {
    expect(searchHelp('')).toEqual([])
    expect(searchHelp('   ')).toEqual([])
    expect(searchHelp('a')).toEqual([])
  })

  it('stops at the limit', () => {
    expect(searchHelp('spendr', { limit: 1 }).length).toBeLessThanOrEqual(1)
  })

  /* The search is indexed by article id, so each of these has ids of its own. */
  /** @param {string} id @param {string} title @param {Partial<import('./help.js').HelpArticle>} [over] */
  const article = (id, title, over = {}) => /** @type {import('./help.js').HelpArticle} */ ({
    id, topic: 'start', title, summary: 'Something to read.', keywords: [], body: [{ p: 'Some words.' }], ...over,
  })
  const ids = (/** @type {string} */ q, /** @type {import('./help.js').HelpArticle[]} */ articles) =>
    searchHelp(q, { articles }).map(a => a.id)

  it('puts the word they typed ahead of a word that only means the same', () => {
    // The synonym is first in the list, so it is the score that puts it second.
    const list = [article('syn-sub', 'Your subscription renewals'), article('syn-bill', 'Paying a bill')]
    expect(ids('bill', list)).toEqual(['syn-bill', 'syn-sub'])
  })

  it('treats a plural as the same word', () => {
    const list = [article('plural-one', 'Paying a bill')]
    expect(ids('bills', list)).toEqual(['plural-one'])
  })

  it('leaves out an article that only mentions the word, when there is a real answer', () => {
    const answer = article('far-answer', 'Paying a bill', { keywords: ['bill'], summary: 'Pay a bill.' })
    const mention = article('far-mention', 'Moving house', { body: [{ p: 'Pay your bill first.' }] })
    expect(ids('bill', [mention, answer])).toEqual(['far-answer'])
    // On its own, a mention is still the best there is.
    expect(ids('bill', [mention])).toEqual(['far-mention'])
  })

  it('does not take the app’s own name for spending', () => {
    const name = article('brand-name', 'What is Spendr?', { summary: 'Spendr is a money tracker.' })
    const safe = article('brand-safe', 'Your safe to spend number')
    expect(ids('spend', [name, safe])).toEqual(['brand-safe'])
    expect(ids('spendr', [name, safe])).toEqual(['brand-name'])
  })

  it('keeps a short word to a short list, in the real help', () => {
    const found = searchHelp('bill', { limit: 50 }).map(a => a.id)
    expect(found.length).toBeLessThan(12)
    // Every one has the word in its title or keywords, not in a passing line.
    for (const id of found) {
      const a = /** @type {import('./help.js').HelpArticle} */ (helpArticle(id))
      expect(`${a.title} ${(a.keywords ?? []).join(' ')}`, id).toMatch(/bill/i)
    }
    expect(found.slice(0, 5)).toContain('add-bill')
  })

  it('answers a credit card question with the card articles first', () => {
    const top = searchHelp('credit card').slice(0, 3).map(a => a.id)
    expect(top).toContain('pay-credit-card')
    expect(top).toContain('credit-card-statements')
    expect(searchHelp('credit card', { limit: 50 }).length).toBeLessThan(10)
  })

  it('answers a more specific question with fewer, not more', () => {
    const wide = searchHelp('card', { limit: 50 }).length
    expect(searchHelp('pay card', { limit: 50 }).length).toBeLessThanOrEqual(wide)
    expect(searchHelp('add expense')[0]?.id).toBe('add-expense')
  })
})
