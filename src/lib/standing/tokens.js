/**
 * The pieces a note's sentences are made of.
 *
 * A sentence is not a string: it has figures that must read first, a
 * category's tile where its name would be, a date as a chip, a bar for how
 * much of the budget is gone. So the composer (compose.js) builds lists of
 * tokens and says nothing about how they look - the overlay draws them in the
 * page, and the picture of the note (components/standing/noteImage.js) draws
 * the same tokens on a canvas. Plain data, so a note can be tested, compared
 * and kept without a browser.
 *
 * Grey is the context and black is what matters: text is the grey, and
 * everything else is a thing to look at.
 *
 * @typedef {'good'|'bad'|'warn'|null} Tone
 *
 * @typedef {{k: 't', v: string}} TextTok      context, in the quiet tone
 * @typedef {{k: 'fig', v: string, tone: Tone}} FigTok   a figure, or a few words, that matter
 * @typedef {{k: 'cat', name: string}} CatTok  a category: its tile, then its name
 * @typedef {{k: 'acct', name: string}} AcctTok  an account: its card, then its name
 * @typedef {{k: 'date', iso: string, label: string}} DateTok  a date, as a chip
 * @typedef {{k: 'pace', used: number, elapsed: number, tone: Tone}} PaceTok  how much of a budget is used, against how much of the month has gone; the tone is how that is going
 * @typedef {{k: 'split', parts: Array<{v: number, color: string}>}} SplitTok  a thin bar of what a total is made of
 * @typedef {{k: 'dotfig', v: string, color: string}} DotFigTok  a figure with its colour in front, for reading a split
 * @typedef {{k: 'arrow', dir: 'up'|'down', tone: Tone}} ArrowTok
 * @typedef {{k: 'spark', values: number[]}} SparkTok  a few days of spending, as a line
 *
 * @typedef {TextTok|FigTok|CatTok|AcctTok|DateTok|PaceTok|SplitTok|DotFigTok|ArrowTok|SparkTok} Token
 */

/** @param {string} v @returns {TextTok} */
export const text = (v) => ({ k: 't', v })
/** @param {string} v @param {Tone} [tone] @returns {FigTok} */
export const fig = (v, tone = null) => ({ k: 'fig', v, tone })
/** @param {string} name @returns {CatTok} */
export const cat = (name) => ({ k: 'cat', name })
/** @param {string} name @returns {AcctTok} */
export const acct = (name) => ({ k: 'acct', name })
/** @param {string} iso @param {string} label @returns {DateTok} */
export const date = (iso, label) => ({ k: 'date', iso, label })
/** @param {number} used @param {number} elapsed @param {Tone} [tone] @returns {PaceTok} */
export const pace = (used, elapsed, tone = null) => ({ k: 'pace', used, elapsed, tone })
/** @param {Array<{v: number, color: string}>} parts @returns {SplitTok} */
export const split = (parts) => ({ k: 'split', parts })
/** @param {string} v @param {string} color @returns {DotFigTok} */
export const dotfig = (v, color) => ({ k: 'dotfig', v, color })
/** @param {'up'|'down'} dir @param {Tone} [tone] @returns {ArrowTok} */
export const arrow = (dir, tone = null) => ({ k: 'arrow', dir, tone })
/** @param {number[]} values @returns {SparkTok} */
export const spark = (values) => ({ k: 'spark', values })

/**
 * A sentence from a template: the strings are the grey text, the values are
 * tokens (or lists of them, or nothing - a missing part simply leaves a gap
 * that is closed up).
 *
 * A plain string or number among the values is more grey text: a month's
 * name, a word chosen by the situation.
 *
 * @param {TemplateStringsArray} strings
 * @param {...(Token|Token[]|string|number|null|undefined|false)} vals
 * @returns {Token[]}
 */
export function s(strings, ...vals) {
  /** @type {Token[]} */
  const out = []
  strings.forEach((str, i) => {
    if (str) out.push(text(str))
    const v = vals[i]
    if (v === null || v === undefined || v === false) return
    if (typeof v === 'string' || typeof v === 'number') out.push(text(String(v)))
    else if (Array.isArray(v)) out.push(...v)
    else out.push(v)
  })
  return tidy(out)
}

/**
 * Neighbouring text joined and the spaces around nothing closed up, so a
 * dropped part cannot leave a double space or a space before a full stop.
 *
 * @param {Token[]} tokens
 * @returns {Token[]}
 */
export function tidy(tokens) {
  /** @type {Token[]} */
  const out = []
  for (const t of tokens) {
    const last = out[out.length - 1]
    if (t.k === 't') {
      if (!t.v) continue
      if (last && last.k === 't') { out[out.length - 1] = text(last.v + t.v); continue }
    }
    out.push(t)
  }
  return out.map(t => (t.k === 't' ? text(t.v.replace(/ {2,}/g, ' ').replace(/ ([.,;:!?])/g, '$1')) : t))
}

/**
 * Sentences in a row, one space between.
 *
 * @param {Token[][]} sentences
 * @returns {Token[]}
 */
export function paragraph(sentences) {
  /** @type {Token[]} */
  const out = []
  sentences.forEach((sen, i) => {
    if (i > 0) out.push(text(' '))
    out.push(...sen)
  })
  return tidy(out)
}

/**
 * "a, b and c" from parts that are themselves tokens.
 *
 * @param {Token[][]} items
 * @returns {Token[]}
 */
export function list(items) {
  /** @type {Token[]} */
  const out = []
  items.forEach((it, i) => {
    if (i > 0) out.push(text(i === items.length - 1 ? ' and ' : ', '))
    out.push(...it)
  })
  return out
}

/** Tokens that are a thing to look at, rather than a word - the ones a note rations. */
const OBJECTS = new Set(['cat', 'acct', 'date', 'pace', 'split', 'spark'])

/** @param {Token[]} tokens */
export const countObjects = (tokens) => tokens.filter(t => OBJECTS.has(t.k)).length

/** @param {Token[]} tokens */
export function countWords(tokens) {
  return textOf(tokens).split(/\s+/).filter(Boolean).length
}

/**
 * The tokens as plain words: what a screen reader says, what a test reads,
 * what a note is when it is sent as a message. A bar or a line says nothing
 * here; its figures are in the words around it.
 *
 * @param {Token[]} tokens
 */
export function textOf(tokens) {
  return tokens.map(t => {
    switch (t.k) {
      case 't': return t.v
      case 'fig': case 'dotfig': return t.v
      case 'cat': case 'acct': return t.name
      case 'date': return t.label
      case 'arrow': return t.dir === 'up' ? '↑' : '↓'
      default: return ''
    }
  }).join('').replace(/ {2,}/g, ' ').replace(/ ([.,;:!?])/g, '$1').trim()
}
