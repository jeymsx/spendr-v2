import { useDeferredValue, useMemo } from 'react'
import db from '../db/db'
import { useLiveQuery } from './useLiveQuery'
import { learnLedger, quickParse } from '../lib/quickParse'

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
 * you picked yourself is never replaced by a guess.
 *
 * @param {string} description
 * @param {'expense'|'inflow'} type
 * @param {Array<Record<string, any>>} categories  the form's own, of that type
 * @returns {Record<string, any>|null}
 */
export function useCategoryGuess(description, type, categories) {
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], null)
  const knowledge = useMemo(() => (transactions ? learnLedger(transactions) : null), [transactions])
  // Deferred: typing stays instant, and the guess follows a moment behind.
  const text = useDeferredValue(String(description ?? '').trim())
  return useMemo(() => {
    if (!knowledge || text.length < 3 || !categories?.length) return null
    const r = quickParse(text, { categories, knowledge })
    if (!r?.category) return null
    return categories.find(c => c.name === r.category && (!c.type || c.type === type)) ?? null
  }, [knowledge, text, categories, type])
}
