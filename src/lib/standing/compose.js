import { LEVELS, standingOf } from './level'
import { metricsOf } from './metrics'
import { candidatesA, candidatesB, candidatesC, candidatesFresh } from './sentences'
import { choose, isoOf, money, monthName, num, rand01, shortDate, weekdayName } from './format'
import { countObjects, countWords, paragraph, textOf } from './tokens'

/**
 * Writes the note: facts in, a few short paragraphs out.
 *
 * Three beats, always in this order so the shape can be learned in a glance -
 *
 *   A  where you stand     today, what is yours to spend, what you are worth
 *   B  what it means       the month's pace, what is coming, what stands out
 *   C  one last line       a nudge, a question, a notice or a win
 *
 * - and always something to say. Each beat collects every sentence the facts
 * support, keeps the most important of each family (a note says one thing
 * about the pace, not three), trims to what fits one screen, and the last
 * line is the one the day and the standing call for most. Given the same
 * facts and the same date, it writes the same note; tomorrow it words things
 * differently.
 *
 * It never throws and never prints a figure it was not given: facts are
 * normalised first, and a sentence whose figures are missing is not written.
 *
 * @typedef {import('./facts').StandingFacts} StandingFacts
 * @typedef {import('./tokens').Token} Token
 * @typedef {import('./level').Level} Level
 * @typedef {import('./sentences').Candidate} Candidate
 *
 * @typedef {object} NoteParagraph
 * @property {'a'|'b'|'c'} id
 * @property {Token[]} tokens
 * @property {'nudge'|'question'|'notice'|'win'} [kind]   what the last line is
 *
 * @typedef {object} Note
 * @property {string} title
 * @property {{date: string, day: string}} eyebrow
 * @property {Level} level
 * @property {'payday'|'monthStart'|'monthEnd'|null} occasion
 * @property {NoteParagraph[]} paragraphs
 * @property {string[]} ids       which sentences were written, for tests and the gallery
 */

/** What has to fit on one screen. */
export const LIMITS = { sentencesA: 3, sentencesB: 2, objects: 6, words: 64 }

/**
 * What a last line says for itself, so the paragraph above it need not say it
 * as well: "Pay BPI Credit tomorrow" is the bill's sentence, as advice.
 *
 * @type {Record<string, string[]>}
 */
const SUPERSEDES = { 'n-due': ['due-soon', 'overdue'], 'w-last': ['lastMonth'] }

/** A last line that would only say again what the paragraph above already does. @type {Record<string, string>} */
const REPEATS = { 'n-full': 'cat-full', 'n-watch': 'cat-close' }

/**
 * What each kind of last line is worth in each standing, on top of how much
 * the facts call for it. Questions are never asked of a month that is short:
 * nobody wants "was it worth it?" when the money is running out.
 *
 * @type {Record<import('./level').LevelId, Record<'nudge'|'question'|'notice'|'win', number>>}
 */
const FAVOUR = {
  fresh: { nudge: 3, question: 0, notice: 0, win: 0 },
  short: { nudge: 3, question: -5, notice: -1, win: -1 },
  tight: { nudge: 2, question: -3, notice: 0.5, win: 1 },
  hot: { nudge: 1.5, question: 1.2, notice: 0.8, win: 0.5 },
  steady: { nudge: 0.8, question: 1.2, notice: 1, win: 1.2 },
  ahead: { nudge: 0.8, question: 1.5, notice: 0.8, win: 1.6 },
}

/**
 * Facts with every part present, so nothing downstream asks "is it there?"
 * twice. What is missing stays missing (null, empty) rather than becoming a
 * zero that reads as a fact.
 *
 * @param {Partial<StandingFacts>} facts
 * @returns {StandingFacts}
 */
export function normalise(facts) {
  const now = facts.now instanceof Date && !Number.isNaN(facts.now.getTime()) ? facts.now : new Date()
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return {
    now,
    name: typeof facts.name === 'string' ? facts.name.trim() : '',
    currency: typeof facts.currency === 'string' ? facts.currency : '',
    txCount: Math.max(0, Math.round(num(facts.txCount))),
    loggedToday: Math.max(0, Math.round(num(facts.loggedToday))),
    /* The day and the month's length are the date's, whatever else the month
       says: a note written for the 11th cannot be a note for day 7. */
    month: {
      spent: 0, earned: 0, spentToday: 0, spentYesterday: null, prevSpent: null,
      quietRun: 0, biggestDay: null, byCategory: [], biggestBuy: null, last7: [], weekday: null,
      ...(facts.month ?? {}),
      day: now.getDate(), days,
    },
    budget: facts.budget ?? null,
    plan: facts.plan ?? null,
    worth: facts.worth ?? null,
    cards: facts.cards ?? [],
    goal: facts.goal ?? null,
    last: facts.last ?? { spent: null, earned: null, label: null },
  }
}

/**
 * The best of each family, most important first.
 *
 * @param {Candidate[]} cands
 */
function bestOfFamilies(cands) {
  /** @type {Map<string, Candidate>} */
  const best = new Map()
  for (const c of cands) {
    if (!c.tokens.length) continue
    const have = best.get(c.family)
    if (!have || c.prio > have.prio) best.set(c.family, c)
  }
  return [...best.values()].sort((a, b) => b.prio - a.prio || a.id.localeCompare(b.id))
}

/**
 * @param {Partial<StandingFacts>} facts
 * @param {{salt?: string|number, hour?: number}} [opts]  salt changes the day's wording (the gallery shows several days); hour overrides the clock
 * @returns {Note}
 */
export function composeNote(facts, opts = {}) {
  const f = normalise(facts)
  const m = metricsOf(f)
  const level = standingOf(f, m)
  const now = f.now
  const seed = `${isoOf(now)}${opts.salt ?? ''}`

  /** @type {import('./sentences').Ctx} */
  const ctx = {
    f, m, level, now,
    month: monthName(now),
    hour: opts.hour ?? now.getHours(),
    pick: (id, choices) => choose(`${seed}|${id}`, choices),
    $: (n) => money(n, f.currency),
  }

  /** @type {Candidate[]} */
  let a
  /** @type {Candidate[]} */
  let b
  if (level.id === 'fresh') {
    const fresh = candidatesFresh(ctx)
    a = bestOfFamilies(fresh.a).slice(0, LIMITS.sentencesA)
    b = bestOfFamilies(fresh.b).slice(0, LIMITS.sentencesB)
  } else {
    a = bestOfFamilies(candidatesA(ctx)).slice(0, LIMITS.sentencesA)
    b = bestOfFamilies(candidatesB(ctx)).slice(0, LIMITS.sentencesB)
  }

  // The last line: what the facts call for most, and what this standing leans to, with the day's mood to break ties.
  const above = new Set(b.map(c => c.id))
  const closers = candidatesC(ctx).filter(c => !(REPEATS[c.id] && above.has(REPEATS[c.id]))).map(c => ({
    c,
    score: (c.strength ?? 0) + FAVOUR[level.id][c.kind ?? 'nudge'] + rand01(`${seed}|c|${c.id}`) * 3,
  })).sort((x, y) => y.score - x.score || x.c.id.localeCompare(y.c.id))
  const closing = closers[0]?.c ?? null
  if (closing && SUPERSEDES[closing.id]) b = b.filter(c => !SUPERSEDES[closing.id].includes(c.id))

  // Everything has to fit one screen: let go of the least important sentence until it does.
  const size = () => {
    const all = [...a, ...b, ...(closing ? [closing] : [])].flatMap(c => c.tokens)
    return { objects: countObjects(all), words: countWords(all) }
  }
  for (;;) {
    const { objects, words } = size()
    if (objects <= LIMITS.objects && words <= LIMITS.words) break
    /** @type {Array<{c: Candidate, beat: 'a'|'b'}>} */
    const pool = [...a.slice(1).map(c => ({ c, beat: /** @type {'a'} */ ('a') })), ...b.slice(1).map(c => ({ c, beat: /** @type {'b'} */ ('b') }))]
    if (!pool.length) break
    const drop = pool.sort((x, y) => x.c.prio - y.c.prio)[0]
    if (drop.beat === 'a') a = a.filter(c => c !== drop.c)
    else b = b.filter(c => c !== drop.c)
  }

  const inOrder = [...a].sort((x, y) => x.order - y.order || y.prio - x.prio)
  /** @type {import('./compose').NoteParagraph[]} */
  const paragraphs = []
  if (inOrder.length) paragraphs.push({ id: 'a', tokens: paragraph(inOrder.map(c => c.tokens)) })
  if (b.length) paragraphs.push({ id: 'b', tokens: paragraph(b.map(c => c.tokens)) })
  if (closing) paragraphs.push({ id: 'c', kind: closing.kind, tokens: closing.tokens })

  return {
    title: f.name ? `Hi, ${f.name}.` : 'Hi there.',
    eyebrow: { date: `${weekdayName(now)}, ${shortDate(now)}`, day: `Day ${m.day} of ${m.days}` },
    level: LEVELS[level.id],
    occasion: m.payToday ? 'payday' : m.monthEnd && m.hasBudget ? 'monthEnd' : m.monthStart ? 'monthStart' : null,
    paragraphs,
    ids: [...inOrder, ...b, ...(closing ? [closing] : [])].map(c => c.id),
  }
}

/**
 * The note as plain words: for a screen reader, a test, a message.
 *
 * @param {Note} note
 */
export function noteText(note) {
  return [note.title, ...note.paragraphs.map(p => textOf(p.tokens))].join('\n\n')
}
