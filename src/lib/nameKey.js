/**
 * Names that look the same are the same name.
 *
 * Accounts and categories are found BY NAME - every transaction, bill and
 * balance names the account it sits in, and the cloud matches a category on
 * its name - so two that merely LOOK alike are as bad as two that are alike.
 * "Ca" + a zero-width space + "sh" prints as Cash, sorts beside it, and is a
 * different key: both rows were accepted, and which one a transaction landed
 * in depended on which of the two it had been typed into.
 *
 * What counts as invisible: the zero-width space, non-joiner and joiner
 * (U+200B to U+200D), the byte-order mark (U+FEFF), the word joiner (U+2060),
 * and the bidirectional embedding and isolate controls (U+202A to U+202E,
 * U+2066 to U+2069), which a paste from a right-to-left page can carry.
 */

export const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g

/**
 * A name as it should be stored: without invisible characters, and trimmed.
 * Inner spacing is left as typed.
 *
 * @param {unknown} name
 * @returns {string}
 */
export function stripInvisible(name) {
  return String(name ?? '').replace(INVISIBLE, '').trim()
}

/**
 * What two names are compared by: case, surrounding and repeated spaces and
 * invisible characters do not make a name different.
 *
 * @param {unknown} name
 * @returns {string}
 */
export function nameKey(name) {
  return stripInvisible(name).replace(/\s+/g, ' ').toLowerCase()
}
