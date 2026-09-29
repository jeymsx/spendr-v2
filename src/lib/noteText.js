/**
 * What a note says, read off its document - and when it said it.
 *
 * A note is stored as the editor's own document (ProseMirror JSON: blocks of
 * headings, paragraphs and lists, each holding runs of text). The list, search
 * and the synced copy's title only ever want its words, so they are worked out
 * here, from the JSON, without an editor: lib/sync.js does it for a note that
 * arrives from another device, and it must not load the editor to do so.
 *
 * Pure: no database, no clock beyond the `now` a caller passes.
 */

/** The document a new note starts as: one empty title line, as iOS Notes starts one. */
export const NEW_NOTE_DOC = Object.freeze({
  type: 'doc',
  content: [{ type: 'heading', attrs: { level: 1 } }],
})

/* The blocks that hold a line of text. Everything else - the document, a
   list, a list item, a quote - only holds blocks. */
const TEXTBLOCKS = new Set(['paragraph', 'heading', 'codeBlock'])

/** @param {Record<string, any>} node */
function inlineText(node) {
  let out = ''
  for (const child of node?.content ?? []) {
    if (child?.type === 'text') out += child.text ?? ''
    else if (child?.type === 'hardBreak') out += '\n'
    else out += inlineText(child)
  }
  return out
}

/**
 * Every line of a note, in order.
 *
 * @param {Record<string, any>|null|undefined} doc
 * @returns {string[]}
 */
export function docLines(doc) {
  /** @type {string[]} */
  const out = []
  /** @param {Record<string, any>} node */
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (TEXTBLOCKS.has(node.type)) { out.push(...inlineText(node).split('\n')); return }
    for (const child of node.content ?? []) walk(child)
  }
  walk(/** @type {any} */ (doc))
  return out
}

/** A note as plain text, a line per line. @param {Record<string, any>|null|undefined} doc */
export const docText = (doc) => docLines(doc).join('\n')

/** Nothing written in it at all. @param {Record<string, any>|null|undefined} doc */
export const isBlankDoc = (doc) => !docText(doc).trim()

/** Longest a title or a preview is kept, in characters. */
const TITLE_MAX = 120
const PREVIEW_MAX = 160

/**
 * A note's title: its first line with something on it.
 *
 * @param {Record<string, any>|null|undefined} doc
 */
export function noteTitle(doc) {
  const first = docLines(doc).find(l => l.trim())
  return first ? first.trim().replace(/\s+/g, ' ').slice(0, TITLE_MAX) : ''
}

/**
 * What the list shows under a title: the words after it, run together.
 *
 * @param {string} text  a note's plain text (docText)
 */
export function notePreview(text) {
  const lines = String(text ?? '').split('\n')
  const at = lines.findIndex(l => l.trim())
  if (at < 0) return ''
  return lines.slice(at + 1).map(l => l.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, PREVIEW_MAX)
}

/** @param {Date} d */
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
/** @param {Date} a @param {Date} b */
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86_400_000)

/**
 * When a note was last written in, as the list says it: the time today,
 * "Yesterday", the weekday within the week, and a date past that.
 *
 * @param {string|null|undefined} iso
 * @param {Date} [now]
 */
export function noteWhen(iso, now = new Date()) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const days = daysBetween(d, now)
  if (days <= 0) return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString('en-PH', { weekday: 'long' })
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * The line at the top of an open note: "September 30, 2026 at 9:41 AM".
 *
 * @param {string|null|undefined} iso
 */
export function noteStamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${day} at ${time}`
}

/**
 * The list's sections, as iOS Notes has them: pinned first, then Today,
 * Yesterday, the week, the month, each earlier month of this year by name,
 * and each year before that.
 *
 * @template {{editedAt?: string|null, pinned?: boolean}} T
 * @param {T[]} notes  newest first
 * @param {Date} [now]
 * @returns {Array<{key: string, label: string, notes: T[]}>}
 */
export function noteGroups(notes, now = new Date()) {
  /** @type {Array<{key: string, label: string, notes: T[]}>} */
  const out = []
  /** @param {string} key @param {string} label @param {T} note */
  const put = (key, label, note) => {
    let g = out.find(x => x.key === key)
    if (!g) { g = { key, label, notes: [] }; out.push(g) }
    g.notes.push(note)
  }
  for (const n of notes) {
    if (n.pinned) { put('pinned', 'Pinned', n); continue }
    const d = new Date(n.editedAt ?? 0)
    const days = daysBetween(d, now)
    if (days <= 0) put('today', 'Today', n)
    else if (days === 1) put('yesterday', 'Yesterday', n)
    else if (days <= 7) put('week', 'Previous 7 days', n)
    else if (days <= 30) put('month', 'Previous 30 days', n)
    else if (d.getFullYear() === now.getFullYear()) {
      put(`m${d.getMonth()}`, d.toLocaleDateString('en-PH', { month: 'long' }), n)
    } else put(`y${d.getFullYear()}`, String(d.getFullYear()), n)
  }
  // Pinned leads whenever it is there; the rest are already newest first.
  return out.sort((a, b) => (a.key === 'pinned' ? -1 : b.key === 'pinned' ? 1 : 0))
}

/**
 * Whether a note has `query` in it, ignoring case and accents: "cafe" finds
 * "Café".
 *
 * @param {{title?: string, text?: string}} note
 * @param {string} query
 */
export function noteMatches(note, query) {
  const fold = (/** @type {string} */ s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = fold(String(query ?? '').trim())
  if (!q) return true
  return fold(`${note.title ?? ''}\n${note.text ?? ''}`).includes(q)
}
