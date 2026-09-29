/**
 * System Back, answered by what is on top of the page.
 *
 * Android's Back button (and a browser's) leaves the page. With a sheet
 * open that threw the page away - the transaction you were reading, the
 * list scrolled halfway - where every Android app closes the sheet. And a
 * form with something typed into it was left without a word.
 *
 * So whatever should answer Back - an open sheet, a form with unsaved input -
 * holds one history entry of its own while it is there: the same address
 * and the router's own state, plus a marker saying how deep it is. Back
 * spends that entry instead of the page's, the router sees the same page
 * (the same key), and the guard on top is told: the sheet closes, the form
 * asks. When the sheet closes some other way, its entry is taken back off.
 *
 * An entry can be left behind - a sheet whose button went to another page
 * has no way to remove an entry that is no longer on top. Landing on one
 * later steps straight past it, so it costs nothing.
 *
 * Nothing here is React: the hooks in hooks/useBackGuard.js drive it.
 */

const MARK = 'spendrGuard'

/**
 * @typedef {object} Guard
 * @property {() => void} onBack   what system Back does while this is on top
 * @property {boolean} form        a form with unsaved input, rather than a sheet
 * @property {boolean} entry       whether it holds an entry right now
 * @property {boolean} wanted      whether its owner wants one - it is on screen, or unsaved
 * @property {number} depth        which one, counting from 1
 */

/** @type {Guard[]} */
const guards = []
/** Traversals this module started, whose popstate is not a Back to answer. */
let ours = 0
/** Waiting for our own traversal: arms wait for it, so entries never cross. */
/** @type {Array<() => void>} */
let queue = []
let flushing = false
let listening = false

const hasWindow = () => typeof window !== 'undefined' && !!window.history
const depthNow = () => (hasWindow() ? Number(window.history.state?.[MARK] ?? 0) : 0)

function listen() {
  if (listening || !hasWindow()) return
  listening = true
  window.addEventListener('popstate', onPop)
}

function onPop() {
  if (ours > 0) {
    ours--
    const next = queue
    queue = []
    for (const run of next) run()
    return
  }
  const d = depthNow()
  // Every guard deeper than where Back landed has lost its entry.
  const lost = guards.filter(g => g.entry && g.depth > d)
  if (lost.length) {
    for (const g of lost) g.entry = false
    lost[lost.length - 1].onBack()
    return
  }
  // An entry left behind by a guard that has gone: step past it.
  if (d > 0 && !guards.some(g => g.entry && g.depth === d)) go(-1)
}

/** @param {number} n */
function go(n) {
  ours++
  window.history.go(n)
}

/** Run now, or once a traversal we started has landed. @param {() => void} fn */
function whenSettled(fn) {
  if (ours > 0) queue.push(fn)
  else fn()
}

/** @param {Guard} g */
function arm(g) {
  if (!hasWindow() || g.entry || !g.wanted) return
  listen()
  // Mid-leave, it waits: a sheet opened on the page just arrived at still gets its entry.
  if (leaving) { waiting.add(g); return }
  whenSettled(() => {
    if (g.entry || !g.wanted || !guards.includes(g)) return
    if (leaving) { waiting.add(g); return }
    g.depth = guards.filter(x => x.entry).length + 1
    window.history.pushState({ ...(window.history.state ?? {}), [MARK]: g.depth }, '')
    g.entry = true
  })
}

/* Entries given up in one render - a picker and the sheet under it closing
   together - come off in one traversal, in a microtask, so the second is not
   judged while the first is still on its way. */
function flush() {
  flushing = false
  whenSettled(() => {
    let d = depthNow()
    let n = 0
    while (d - n > 0 && !guards.some(g => g.entry && g.depth === d - n)) n++
    if (n) go(-n)
  })
}

/** @param {Guard} g */
function release(g) {
  if (!g.entry) return
  g.entry = false
  if (flushing || !hasWindow()) return
  flushing = true
  queueMicrotask(flush)
}

/**
 * Register something that answers Back. Returns its controls; `set(active)`
 * arms or releases it, `drop()` forgets it for good.
 *
 * @param {{onBack: () => void, form?: boolean}} opts
 */
export function createGuard({ onBack, form = false }) {
  /** @type {Guard} */
  const g = { onBack, form, entry: false, wanted: false, depth: 0 }
  guards.push(g)
  return {
    /** @param {boolean} active */
    set(active) {
      g.wanted = active
      if (active) arm(g)
      else { waiting.delete(g); release(g) }
    },
    /** @param {() => void} fn */
    setOnBack(fn) { g.onBack = fn },
    drop() {
      g.wanted = false
      waiting.delete(g)
      release(g)
      const i = guards.indexOf(g)
      if (i !== -1) guards.splice(i, 1)
    },
  }
}

/* Leaving on purpose - Discard, or a save that navigates. Until the page has
   gone, nothing may arm, or the navigation would spend the new entry instead
   of leaving; what asked meanwhile arms once it has. */
let leaving = false
/** @type {Set<Guard>} */
const waiting = new Set()

function doneLeaving() {
  leaving = false
  const next = [...waiting]
  waiting.clear()
  for (const g of next) arm(g)
}

/**
 * Take every guard's entry off, then run `fn` - the navigation that leaves.
 * A form that navigated with its entry still on top replaced or spent that
 * entry, and Back then reopened the form.
 *
 * @param {() => void} fn
 */
export function leaveThen(fn) {
  if (!hasWindow()) { fn(); return }
  leaving = true
  for (const g of guards) g.entry = false
  // The navigation's own traversal lands a moment after it is asked for.
  const run = () => { fn(); setTimeout(doneLeaving, 300) }
  whenSettled(() => {
    const d = depthNow()
    if (d > 0) {
      queue.push(run)
      go(-d)
    } else run()
  })
}

/** Whether a form with unsaved input is on the page - the edge swipe asks it before leaving. */
export function formGuarded() {
  return guards.some(g => g.form && g.entry)
}

/** For tests: forget everything. */
export function resetGuards() {
  guards.length = 0
  ours = 0
  queue = []
  flushing = false
  leaving = false
  waiting.clear()
}
