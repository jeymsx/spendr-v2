/**
 * How notes are filed: in a folder, and under tags (lib/notes.js writes
 * them, pages/Notes.jsx reads them).
 *
 * A folder is a name, and a note is in at most one - it holds the folder's
 * syncId (`folder`). A tag is a word, a note holds any number of them
 * (`tags`), and a word is the same word however it was typed: "Pay Day",
 * "#pay-day" and "pay day" are one tag, `pay-day`. Nothing here touches the
 * database or the clock.
 */

/** Most tags one note holds, and longest one, in characters. */
export const MAX_TAGS = 8
export const TAG_MAX = 24
/** Longest a folder's name is kept, in characters. */
export const FOLDER_MAX = 40

/**
 * A tag as it is kept: lower case, no leading #, words joined by a dash,
 * letters and digits and nothing else. Empty if nothing is left of it.
 *
 * @param {unknown} raw
 */
export function normalizeTag(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TAG_MAX)
    .replace(/-+$/g, '')
}

/** A folder's name as it is kept: trimmed, one space between words. @param {unknown} raw */
export function normalizeFolderName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, FOLDER_MAX)
}

/**
 * A list of tags as it is kept: each normalised, none twice, none empty, no
 * more than a note may hold - the first ones win.
 *
 * @param {unknown} list
 * @returns {string[]}
 */
export function cleanTags(list) {
  const out = /** @type {string[]} */ ([])
  for (const raw of Array.isArray(list) ? list : []) {
    const tag = normalizeTag(raw)
    if (tag && !out.includes(tag) && out.length < MAX_TAGS) out.push(tag)
  }
  return out
}

/**
 * Every tag in use and how many notes carry it, the most used first and
 * then by name.
 *
 * @param {Array<{tags?: string[]}>} notes
 * @returns {Array<{tag: string, count: number}>}
 */
export function tagCounts(notes) {
  /** @type {Map<string, number>} */
  const n = new Map()
  for (const note of notes) for (const tag of new Set(note.tags ?? [])) n.set(tag, (n.get(tag) ?? 0) + 1)
  return [...n.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/**
 * How many notes each folder holds, by the folder's syncId. A note whose
 * folder is gone counts for none.
 *
 * @param {Array<{folder?: string|null}>} notes
 * @returns {Map<string, number>}
 */
export function folderCounts(notes) {
  /** @type {Map<string, number>} */
  const n = new Map()
  for (const note of notes) if (note.folder) n.set(note.folder, (n.get(note.folder) ?? 0) + 1)
  return n
}

/**
 * The notes a view of the list shows: all of them, or those in one folder,
 * and - narrowing either - those under one tag.
 *
 * @template {{folder?: string|null, tags?: string[]}} T
 * @param {T[]} notes
 * @param {{folder?: string, tag?: string|null}} view  `folder` is 'all' or a folder's syncId
 * @returns {T[]}
 */
export function inView(notes, { folder = 'all', tag = null } = {}) {
  return notes.filter(n => (folder === 'all' || n.folder === folder) && (!tag || (n.tags ?? []).includes(tag)))
}
