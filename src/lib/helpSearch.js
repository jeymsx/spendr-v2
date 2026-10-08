import { HELP_ARTICLES } from './help.js'

/**
 * Searching the help centre: the app's search box and the website's read the
 * same articles (lib/help.js) through this, so the same words find the same
 * answers in both. Pure, and it imports only help.js, so the site can use it.
 *
 * ── How a match is scored ──
 *
 * Every word of the query has to be found somewhere in the article - its
 * title, its keywords, its summary or its body - or the article is out. Then
 * where each word was found decides the order: in the title most, the
 * keywords next (they are the words people search with), then the summary,
 * then the body. A whole word counts for more than the start of a longer one,
 * and that for more than a word found inside another, and the whole query
 * found as written in the title counts for most of all.
 *
 * People search with their own words, not the app's, so a few are taken to
 * mean the app's: "income" finds Inflow, "delete" finds remove, and so on.
 * Those are guesses, so they count for a third as much as the word itself, and
 * only as whole words (a synonym of "spend" is not a reason to match Spendr).
 *
 * Last, what is far behind the best answer is left out. Every word being
 * somewhere in the article is a low bar for a short query - "bill" is on
 * thirty pages - so an article scoring under a third of the best one's is
 * a mention, not an answer.
 */

/** Their words, and the app's. Each group is one meaning. */
const SAME = [
  ['income', 'inflow', 'salary', 'pay', 'payday', 'earn', 'earnings'],
  ['expense', 'spend', 'spending', 'spent', 'purchase', 'buy', 'bought', 'cost'],
  ['delete', 'remove', 'erase', 'trash', 'bin'],
  ['restore', 'undo', 'recover', 'bring back', 'undelete'],
  ['transfer', 'move', 'send'],
  ['bill', 'bills', 'recurring', 'subscription', 'subscriptions', 'repeat', 'repeating'],
  ['budget', 'budgets', 'limit', 'limits'],
  ['card', 'cards', 'credit'],
  ['sync', 'cloud', 'devices', 'device', 'laptop', 'computer'],
  ['backup', 'back up', 'export', 'save'],
  ['lock', 'pin', 'face id', 'passcode', 'password'],
  ['notification', 'notifications', 'reminder', 'reminders', 'alert', 'alerts'],
  ['wrapped', 'recap', 'review'],
  ['goal', 'goals', 'saving', 'savings'],
  ['debt', 'debts', 'owe', 'owes', 'lent', 'borrowed'],
  ['category', 'categories'],
  ['currency', 'currencies', 'dollar', 'usd', 'exchange'],
  ['account', 'accounts', 'wallet', 'bank', 'e-wallet', 'ewallet', 'gcash', 'maya'],
]

/** @param {string} s */
export function fold(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '')
}

/**
 * One word of the query: what was typed (and its plural or singular, which is
 * the same word), and the words that mean the same.
 *
 * @typedef {{word: string[], same: RegExp[]}} Term
 */

/** Escapes a word for a pattern. @param {string} s */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A synonym as a whole word, with the endings a word takes: bill, bills, billed. @type {Map<string, RegExp>} */
const synonymRes = new Map()

/** @param {string} form */
function synonymRe(form) {
  let re = synonymRes.get(form)
  if (!re) {
    re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(form)}(?:s|es|ed|d|ing)?(?:$|[^a-z0-9])`)
    synonymRes.set(form, re)
  }
  return re
}

/** The query's words, each with the words that mean the same. @param {string} query @returns {Term[]} */
function wordsOf(query) {
  const words = fold(query).split(/[^a-z0-9₱%-]+/).filter(w => w.length > 1 || /\d/.test(w))
  return words.map(w => {
    const group = SAME.find(g => g.includes(w))
    // "bills" and "bill" are the same word, not a guess about what was meant.
    const word = [...new Set([w, w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : `${w}s`])]
    return { word, same: group ? group.filter(g => !word.includes(g)).map(synonymRe) : [] }
  })
}

/**
 * Whether the match of `w` at `at` is the app's name: "spend" is the start of
 * "Spendr", which every page says, and nobody searching for spending means it.
 *
 * @param {string} text  already folded
 * @param {number} at
 * @param {string} w
 */
const isBrand = (text, at, w) => w.length < 6 && text.startsWith('spendr', at)

/** What a word found as written is worth, by how much of a word it is. */
const WHOLE = 20
const START = 12
const INSIDE = 4
/** What a synonym is worth, found as a whole word: a third of the real thing. */
const SYNONYM = 7

/**
 * How well `text` holds one word of the query: what was typed counts as a
 * whole word, the start of one or the inside of one, and a word that means the
 * same counts only as a whole word. 0 for not at all.
 *
 * @param {string} text  already folded
 * @param {Term} term
 */
function holds(text, term) {
  let best = 0
  for (const w of term.word) {
    for (let at = text.indexOf(w); at >= 0; at = text.indexOf(w, at + 1)) {
      if (isBrand(text, at, w)) continue
      if (at > 0 && !/[^a-z0-9]/.test(text[at - 1])) { best = Math.max(best, INSIDE); continue }
      const next = text[at + w.length]
      if (next === undefined || /[^a-z0-9]/.test(next)) return WHOLE
      best = Math.max(best, START)
    }
  }
  if (best < SYNONYM && term.same.some(re => re.test(text))) best = SYNONYM
  return best
}

/** Whether the whole query is in `text` as written, and not just the app's name. @param {string} text @param {string} phrase */
function holdsPhrase(text, phrase) {
  for (let at = text.indexOf(phrase); at >= 0; at = text.indexOf(phrase, at + 1)) {
    if (!isBrand(text, at, phrase)) return true
  }
  return false
}

/** An article scoring under this much of the best one's is left out. */
const FAR_BEHIND = 0.3

/** The searchable text of an article, folded once. @type {Map<string, {title: string, keys: string, summary: string, body: string}>} */
const indexCache = new Map()

/** @param {import('./help.js').HelpArticle} a */
function fieldsOf(a) {
  let f = indexCache.get(a.id)
  if (f) return f
  const body = a.body.map(b => ('p' in b ? b.p : 'tip' in b ? b.tip : 'steps' in b ? b.steps.join(' ') : 'label' in b ? b.label : 'caption' in b ? (b.caption ?? '') : '')).join(' ')
  f = { title: fold(a.title), keys: fold((a.keywords ?? []).join(' · ')), summary: fold(a.summary), body: fold(body) }
  indexCache.set(a.id, f)
  return f
}

/**
 * The articles that answer a query, best first.
 *
 * @param {string} query
 * @param {{limit?: number, articles?: import('./help.js').HelpArticle[]}} [opts]
 * @returns {import('./help.js').HelpArticle[]}
 */
export function searchHelp(query, { limit = 20, articles = HELP_ARTICLES } = {}) {
  const words = wordsOf(query)
  if (!words.length) return []
  const phrase = fold(query).trim()

  /** @type {Array<{a: import('./help.js').HelpArticle, score: number}>} */
  const scored = []
  for (const a of articles) {
    const f = fieldsOf(a)
    let score = 0
    let all = true
    for (const term of words) {
      const t = holds(f.title, term)
      const k = holds(f.keys, term)
      const s = holds(f.summary, term)
      const b = holds(f.body, term)
      if (!t && !k && !s && !b) { all = false; break }
      score += t * 6 + k * 4 + s * 2 + b
    }
    if (!all) continue
    if (words.length > 1 && holdsPhrase(f.title, phrase)) score += 150
    scored.push({ a, score })
  }
  scored.sort((x, y) => y.score - x.score)
  const floor = (scored[0]?.score ?? 0) * FAR_BEHIND
  return scored.filter(x => x.score >= floor).slice(0, limit).map(x => x.a)
}
