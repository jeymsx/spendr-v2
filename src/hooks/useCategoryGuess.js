import { useDeferredValue, useMemo } from 'react'
import db from '../db/db'
import { useLiveQuery } from './useLiveQuery'
import { learnLedger, quickParse } from '../lib/quickParse'

/**
 * A category guess, and how it was reached.
 *
 * `via` is quickParse's own word for the evidence:
 *   history   what this description has been filed under before
 *   name      the category's name, typed in the description
 *   merchant  the built-in merchant list ("Jollibee" is Food, for anyone)
 *   typo      a near miss on a word it knows
 *
 * `fromHistory` is the one the forms care about: only that can say "From your
 * history". The others are a suggestion, and saying your history chose Food
 * for a brand-new user who has no history is a claim the app cannot back.
 *
 * @typedef {'history'|'name'|'merchant'|'typo'} GuessVia
 * @typedef {{category: Record<string, any>, via: GuessVia, fromHistory: boolean}} CategoryGuess
 */

/**
 * What the form should call a guess, under the Category heading.
 *
 * @param {CategoryGuess|null|undefined} guess
 * @returns {'From your history'|'Suggested'}
 */
export function guessLabel(guess) {
  return guess?.fromHistory ? 'From your history' : 'Suggested'
}

/**
 * The guess itself, with no React in it.
 *
 * @param {string} text  the description, already trimmed
 * @param {{type: 'expense'|'inflow', categories: Array<Record<string, any>>,
 *          knowledge: ReturnType<typeof learnLedger>}} ctx
 * @returns {CategoryGuess|null}
 */
export function guessCategory(text, { type, categories, knowledge }) {
  if (text.length < 3 || !categories?.length) return null
  const r = quickParse(text, { categories, knowledge })
  if (!r?.category) return null
  const category = categories.find(c => c.name === r.category && (!c.type || c.type === type))
  if (!category) return null
  const via = /** @type {GuessVia} */ (r.matched?.category?.via)
  return { category, via, fromHistory: via === 'history' }
}

/**
 * The category a description has meant before.
 *
 * Type "Jollibee" in the expense form and Food is picked, because that is
 * what Jollibee has been every time you logged it - or, the first time, what
 * the quick log's merchant list already knows it is. The same reading quick
 * log does (lib/quickParse.js learnLedger), so the two cannot disagree about
 * what a word means.
 *
 * Returns a suggestion only. The form decides whether to take it: a category
 * you picked yourself is never replaced by a guess. And it says how the guess
 * was reached (CategoryGuess), because only one of those ways is "your
 * history".
 *
 * @param {string} description
 * @param {'expense'|'inflow'} type
 * @param {Array<Record<string, any>>} categories  the form's own, of that type
 * @returns {CategoryGuess|null}
 */
export function useCategoryGuess(description, type, categories) {
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], null)
  const knowledge = useMemo(() => (transactions ? learnLedger(transactions) : null), [transactions])
  // Deferred: typing stays instant, and the guess follows a moment behind.
  const text = useDeferredValue(String(description ?? '').trim())
  return useMemo(() => {
    if (!knowledge) return null
    return guessCategory(text, { type, categories, knowledge })
  }, [knowledge, text, categories, type])
}
