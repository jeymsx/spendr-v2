import { getBaseCurrency, fmt } from './money'
import { convert } from './fx'
import { getFxContext } from './fxContext'

/**
 * The wishlist: something you want, parked for a while before you buy it.
 *
 * ── Why a wait ──
 *
 * Most of what gets bought on a whim would not be bought a week later. So a
 * wish is not a plan to save (that is a goal) and not a purchase (that is an
 * expense): it is a question put off. You park it with its price, Spendr asks
 * "Still want it?" when the wait is over, and you answer:
 *
 *   Buy      - log it as an expense, from Add expense with the price filled in
 *   Skip     - you did not want it after all; its price counts as kept
 *
 * (A status of 'saving' - it became a goal - is still read, from the first
 * days of the wishlist, but nothing makes one now.)
 *
 * Nothing here moves money. A skipped wish's price is not put anywhere - the
 * balances already show it is still there - it is only counted, as "kept by
 * waiting", which is the figure the whole page is for.
 *
 * ── How long ──
 *
 * Until a day: set by the price unless you pick one (coolDaysFor) - a day
 * for something small, a week for most things, a month for something big.
 * The day is stored, not the number of days, so changing your mind is one
 * date, and the question is asked at 9 that morning, with the other reminders.
 */

/** The hour the question is asked, with every other reminder (lib/reminders.js REMINDER_HOUR). */
export const ASK_HOUR = 9

/* What counts as small and big, in pesos. A ledger in another currency has
   its price converted to compare; with no rate to hand, the figure is
   compared as it is. */
const SMALL_PHP = 1000
const BIG_PHP = 10000

/**
 * How long a wish at this price waits, unless you pick a day yourself.
 *
 * @param {number} price
 * @param {string} [code]  the price's currency, the ledger's by default
 * @param {any} [rates]
 * @returns {number}  days: 1, 7 or 30
 */
export function coolDaysFor(price, code = getBaseCurrency(), rates = getFxContext().rates) {
  const n = Number(price) || 0
  const php = String(code || 'PHP').toUpperCase() === 'PHP' ? n : (convert(n, code, 'PHP', rates) ?? n)
  if (php < SMALL_PHP) return 1
  if (php < BIG_PHP) return 7
  return 30
}

/** 'YYYY-MM-DD' of a date, in the person's own time. @param {Date} d */
export function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A 'YYYY-MM-DD' as midnight local time, or null. @param {string|null|undefined} key */
function fromDayKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? '').slice(0, 10))
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/**
 * The day a wait of this many days ends.
 *
 * @param {number} days
 * @param {Date} [now]
 */
export function coolUntilFrom(days, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Math.max(0, Math.round(days)))
  return dayKey(d)
}

/**
 * When "Still want it?" is asked: 9 in the morning of the day the wait ends,
 * like every other reminder.
 *
 * @param {Pick<WishRow, 'coolUntil'|'createdAt'>} wish
 * @returns {Date}
 */
export function readyAt(wish) {
  const day = fromDayKey(wish?.coolUntil)
  if (day) { day.setHours(ASK_HOUR, 0, 0, 0); return day }
  const made = wish?.createdAt ? new Date(wish.createdAt) : null
  return made && !Number.isNaN(made.getTime()) ? made : new Date(0)
}

/** @param {WishRow} wish */
const waiting = (wish) => (wish?.status ?? 'waiting') === 'waiting'

/**
 * Whether its wait is over and it is still to be decided.
 *
 * @param {WishRow} wish
 * @param {Date} [now]
 */
export function isReady(wish, now = new Date()) {
  return waiting(wish) && readyAt(wish).getTime() <= now.getTime()
}

/**
 * Whole days until the day the wait ends: 0 on the day itself.
 *
 * @param {WishRow} wish
 * @param {Date} [now]
 */
export function daysToGo(wish, now = new Date()) {
  const end = fromDayKey(wish?.coolUntil)
  if (!end) return 0
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((end.getTime() - today.getTime()) / 864e5))
}

/**
 * How long it has waited: from the day it was parked to the day it was
 * decided, or to now.
 *
 * @param {WishRow} wish
 * @param {Date} [now]
 */
export function daysWaited(wish, now = new Date()) {
  const from = wish?.createdAt ? new Date(wish.createdAt) : null
  if (!from || Number.isNaN(from.getTime())) return 0
  const to = wish?.decidedAt ? new Date(wish.decidedAt) : now
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 864e5))
}

/**
 * The list as the page shows it: ready to decide (the longest-waiting first),
 * still cooling off (the soonest first), and decided (the latest first).
 *
 * @param {WishRow[]} wishes
 * @param {Date} [now]
 */
export function sortWishes(wishes, now = new Date()) {
  const list = (wishes ?? []).filter(Boolean)
  const at = (/** @type {WishRow} */ w) => readyAt(w).getTime()
  const ready = list.filter(w => isReady(w, now)).sort((a, b) => at(a) - at(b))
  const cooling = list.filter(w => waiting(w) && !isReady(w, now)).sort((a, b) => at(a) - at(b))
  const decided = list.filter(w => !waiting(w))
    .sort((a, b) => String(b.decidedAt ?? '').localeCompare(String(a.decidedAt ?? '')))
  return { ready, cooling, decided }
}

/**
 * How many are waiting for an answer - the Home badge, and the sidebar's.
 *
 * @param {WishRow[]} wishes
 * @param {Date} [now]
 */
export function readyCount(wishes, now = new Date()) {
  return (wishes ?? []).filter(w => w && isReady(w, now)).length
}

/**
 * What waiting kept: every skipped wish's price, in the ledger's currency.
 *
 * @param {WishRow[]} wishes
 * @param {string} [base]
 * @param {any} [rates]
 */
export function keptTotal(wishes, base = getBaseCurrency(), rates = getFxContext().rates) {
  let total = 0
  for (const w of wishes ?? []) {
    if (w?.status !== 'skipped') continue
    const price = Number(w.price) || 0
    const code = w.currency || base
    total += convert(price, code, base, rates) ?? price
  }
  return total
}

/**
 * The line under "Still want it?": its price and how long it has waited. One
 * wording for the bell and the push.
 *
 * @param {WishRow} wish
 * @param {Date} at  when the question is asked
 */
export function wishBody(wish, at) {
  const days = daysWaited({ ...wish, decidedAt: null }, at)
  const price = fmt(Number(wish.price) || 0, wish.currency || undefined)
  return days > 0 ? `${price}, parked ${days} day${days === 1 ? '' : 's'} ago` : price
}

/** "1 day", "7 days". @param {number} days */
export const daysLabel = (days) => `${days} day${days === 1 ? '' : 's'}`

/**
 * A link as it should be kept: the first web address in what was pasted
 * (a shop's share text has words around it), with a scheme when it had none.
 * Anything that is not http or https is not a link here.
 *
 * @param {unknown} raw
 * @returns {string|null}
 */
export function cleanLink(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const found = /https?:\/\/[^\s<>"'`]+/i.exec(s)
  if (found) return found[0].replace(/[).,!?]+$/, '')
  // "shopee.ph/..." pasted without its https:// still opens.
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) return `https://${s}`
  return null
}

/**
 * What a pasted link - or a shop app's whole share text - says about the
 * thing: a name and a price, when it carries them.
 *
 *   "Check out Apple AirPods Pro for ₱8,990. Get it on Shopee now!
 *    https://shp.ee/x"                        name and price from the words
 *   "https://shopee.ph/Apple-AirPods-Pro-i.123.456"
 *   "https://www.lazada.com.ph/products/apple-airpods-pro-i123-s456.html"
 *                                            a name from the address itself
 *
 * Nothing is fetched: a shop's page is not this app's to read (the CSP keeps
 * it to its own servers), so a short link alone gives no name - you type it.
 *
 * @param {unknown} raw
 * @returns {{link: string|null, name: string, price: number|null}}
 */
export function readShared(raw) {
  const text = String(raw ?? '')
  const link = cleanLink(text)

  // ₱ or PHP only: a bare P is too often a model name ("Buds P2").
  const priced = /(?:₱|PHP)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/i.exec(text)
  const price = priced ? Number(`${priced[1].replace(/,/g, '')}${priced[2] ? `.${priced[2]}` : ''}`) : null

  // "Check out NAME for ₱..." - the shop apps' share line.
  const said = /check (?:this )?out\s+(.+?)\s+for\s+(?:₱|PHP)/i.exec(text)
  let name = said ? said[1].trim() : ''
  // Otherwise the words ahead of the address, less the price and the shop's own phrases.
  if (!name) name = wordsBefore(text)
  if (!name && link) name = nameFromPath(link)
  return { link, name: name.slice(0, 60), price: price && price > 0 ? price : null }
}

/**
 * A share line's words ahead of its link: "I found this on Lazada: Redmi Buds
 * 5 ₱1,299 https://..." is "Redmi Buds 5". Two words at least, or it is not a
 * name; nothing when the paste was only an address.
 *
 * @param {string} text
 */
function wordsBefore(text) {
  const at = text.search(/https?:\/\//i)
  if (at <= 0) return ''
  const words = text.slice(0, at)
    .replace(/(?:₱|PHP)\s?[\d,]+(?:\.\d{1,2})?/gi, ' ')
    .replace(/\b(?:i found (?:this|it) on \w+|check (?:this|it) out|get it on \w+(?: now)?|buy (?:it )?now|shop now|on (?:shopee|lazada|tiktok shop))\b/gi, ' ')
    .replace(/[!:|"“”]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,\-–]+$/, '')
    .trim()
  return words.split(' ').length >= 2 && words.length <= 80 ? words : ''
}

/** The most word-like part of a shop address, as words. @param {string} url */
function nameFromPath(url) {
  let path
  try { path = new URL(url).pathname } catch { return '' }
  let best = ''
  for (const part of path.split('/').filter(Boolean)) {
    let s = part
    try { s = decodeURIComponent(part) } catch { /* left as it is */ }
    s = s.replace(/\.(html?|php|aspx?)$/i, '')
      .replace(/-i\.\d+\.\d+$/i, '')        // Shopee: name-i.<shop>.<item>
      .replace(/-i\d+(-s\d+)?$/i, '')       // Lazada: name-i<item>-s<sku>
      .replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim()
    const words = s.split(' ').filter(w => /\p{L}/u.test(w))
    if (words.length >= 2 && s.length > best.length) best = s
  }
  // An address written all in small letters reads better with capitals.
  return best && best === best.toLowerCase() ? best.replace(/\b\p{L}/gu, c => c.toUpperCase()) : best
}
