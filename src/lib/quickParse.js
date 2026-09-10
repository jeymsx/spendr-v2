/**
 * Turn "150 jollibee" into a transaction.
 *
 * ── Why a parser and not a language model ──
 *
 * The obvious modern answer is to post the string to a free model and read back
 * JSON. It is the wrong answer here, for four reasons that are specific to this
 * app rather than general squeamishness:
 *
 *   1. Spendr is offline-first. That is not a feature, it is the premise - the
 *      whole database is local and sync is optional. A quick-log that needs a
 *      network fails exactly when you most want it: on the MRT, in a mall
 *      basement, on a dead prepaid load.
 *
 *   2. It has to feel instant. This parser runs in well under a millisecond,
 *      so the preview updates as you type. A hosted call is 0.5-3s, and the
 *      FREE tiers are the slowest and the most rate-limited of all. "Quick"
 *      log that takes three seconds is not quick.
 *
 *   3. The grammar is tiny and closed. Amount, merchant, maybe an account,
 *      maybe a date. That is a regex and a lookup, not a reasoning problem.
 *
 *   4. It would send your spending to a third party. The privacy policy in
 *      Settings currently says nothing leaves the device unless you enable
 *      cloud sync, and that sentence is worth more than this feature.
 *
 * And one reason a parser is actually BETTER: it can learn from your own
 * ledger. `learnMerchants` reads the categories you have historically filed a
 * merchant under, so "jollibee" maps to whatever YOU call it - Food, or Dining
 * Out, or Vices - rather than to a model's guess about a Filipino fast-food
 * chain. That gets more accurate the longer you use the app, which is the
 * opposite of how a fixed prompt behaves.
 *
 * Where a model would genuinely help is the long tail - "split the 900 dinner
 * three ways", "gas 1200 charge to maya credit next friday". The intended shape
 * for that is: parse locally, and when confidence is low, OFFER to ask a model
 * rather than doing it silently. That is a v2, and it stays opt-in.
 */

// ── Cold-start merchant map ─────────────────────────────────────────────────
//
// Only needed before there is any history to learn from - learnMerchants wins
// over this the moment you have filed the same merchant once. Deliberately
// short, and Philippines-first, because a long list of American chains would
// be dead weight.
const SEED_MERCHANTS = {
  food: ['jollibee', 'mcdo', 'mcdonalds', 'kfc', 'chowking', 'greenwich',
         'mang inasal', 'bonchon', 'starbucks', 'dunkin', 'tapsi', 'carinderia',
         'lunch', 'dinner', 'breakfast', 'merienda', 'ulam', 'kain', 'coffee'],
  groceries: ['sm supermarket', 'puregold', 'landers', 'smarket', 'savemore',
              'robinsons supermarket', 'waltermart', 'grocery', 'palengke',
              'sari sari', 'sari-sari'],
  transpo: ['grab', 'angkas', 'joyride', 'jeep', 'jeepney', 'mrt', 'lrt', 'bus',
            'tricycle', 'trike', 'taxi', 'toll', 'parking', 'gas', 'gasoline',
            'shell', 'petron', 'caltex'],
  shopping: ['shopee', 'lazada', 'tiktok shop', 'uniqlo', 'sm store', 'zalora',
             'divisoria', 'temu'],
  bills: ['meralco', 'maynilad', 'manila water', 'globe', 'smart', 'pldt',
          'converge', 'sky', 'dito', 'rent', 'kuryente', 'tubig', 'internet',
          'load', 'electricity', 'water'],
  entertainment: ['netflix', 'spotify', 'youtube', 'disney', 'viu', 'cinema',
                  'steam', 'hbo', 'prime video'],
  health: ['mercury drug', 'watsons', 'generika', 'rose pharmacy', 'pharmacy',
           'clinic', 'hospital', 'gamot', 'medicine', 'dentist'],
}

const INFLOW_WORDS = [
  'salary', 'sahod', 'payday', 'paid me', 'received', 'refund', 'rebate',
  'bonus', 'commission', 'allowance', 'dividend', 'interest', 'cashback',
  'reimbursed', 'sold', 'income',
]

/** "1.5k" -> 1500, "1,200" -> 1200, "150.75" -> 150.75 */
function readAmount(text) {
  // The k/m suffix has to be tried first: a bare \d+ would match the 1 of 1.5k
  // and leave ".5k" behind as description.
  const suffixed = /(?:^|[\s₱phpPHP])(\d[\d,]*(?:\.\d+)?)\s*([km])\b/i.exec(text)
  if (suffixed) {
    const n = parseFloat(suffixed[1].replace(/,/g, ''))
    const mult = suffixed[2].toLowerCase() === 'k' ? 1e3 : 1e6
    return { amount: n * mult, at: suffixed.index, len: suffixed[0].length, raw: suffixed[0] }
  }
  const plain = /(\d[\d,]*(?:\.\d{1,2})?)/.exec(text)
  if (!plain) return null
  return {
    amount: parseFloat(plain[1].replace(/,/g, '')),
    at: plain.index,
    len: plain[0].length,
    raw: plain[0],
  }
}

/** Normalise for matching: lowercase, collapse whitespace, drop punctuation. */
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * What categories has this user actually filed each merchant word under?
 *
 * Built from their own transactions, so it reflects their habits rather than
 * a guess. Returns { merchantWord: categoryName }, keeping the most frequent
 * category per word and ignoring words that appear under several roughly
 * equally - an ambiguous word is worse than no answer.
 */
export function learnMerchants(transactions = []) {
  const counts = new Map()          // word -> Map(category -> n)
  for (const tx of transactions) {
    const cat = tx?.category
    const desc = norm(tx?.description)
    if (!cat || !desc) continue
    for (const word of desc.split(' ')) {
      if (word.length < 3 || /^\d+$/.test(word)) continue
      if (!counts.has(word)) counts.set(word, new Map())
      const m = counts.get(word)
      m.set(cat, (m.get(cat) ?? 0) + 1)
    }
  }
  const out = {}
  for (const [word, m] of counts) {
    const ranked = [...m.entries()].sort((a, b) => b[1] - a[1])
    const [top, n] = ranked[0]
    const runnerUp = ranked[1]?.[1] ?? 0
    // A clear favourite only: at least twice as common as the next, or the
    // only one. Otherwise "load" filed under both Bills and Transpo would
    // pick whichever happened to be first.
    if (!runnerUp || n >= runnerUp * 2) out[word] = top
  }
  return out
}

/** Longest-first, so "sm supermarket" wins over "sm store" on the same text. */
function matchName(text, names) {
  const hay = norm(text)
  const sorted = [...names].sort((a, b) => norm(b).length - norm(a).length)
  for (const name of sorted) {
    const n = norm(name)
    if (!n) continue
    if (hay === n || new RegExp(`(^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(hay)) {
      return name
    }
  }
  return null
}

/** "yesterday", "today", or nothing. Deliberately small - see the note. */
function readDate(text, today) {
  const hay = norm(text)
  const base = new Date(today)
  base.setHours(0, 0, 0, 0)
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  if (/\byesterday\b|\bkahapon\b/.test(hay)) {
    const d = new Date(base); d.setDate(d.getDate() - 1)
    return { date: iso(d), word: /kahapon/.test(hay) ? 'kahapon' : 'yesterday' }
  }
  if (/\btoday\b|\bngayon\b/.test(hay)) {
    return { date: iso(base), word: /ngayon/.test(hay) ? 'ngayon' : 'today' }
  }
  // Weekday names are deliberately NOT handled. "last friday" and "friday"
  // mean different things, the ambiguity is genuine, and getting it wrong puts
  // a transaction on a date you did not choose - which is worse than making
  // you tap the date field.
  return { date: iso(base), word: null }
}

/**
 * Parse a quick-log string.
 *
 * Everything is best-effort and nothing is required: the result always names a
 * `type` and carries whatever else it could work out, so the overlay can show
 * a live preview and the destination page can pre-fill what it has.
 *
 * @param {string} input
 * @param {object} ctx  { accounts, categories, merchantMap, today }
 */
export function quickParse(input, ctx = {}) {
  const {
    accounts = [],
    categories = [],
    merchantMap = {},
    today = new Date(),
  } = ctx

  const text = String(input ?? '').trim()
  const result = {
    type: 'expense',
    amount: null,
    category: null,
    account: null,
    fromAccount: null,
    toAccount: null,
    description: '',
    date: null,
    confident: false,
    matched: {},          // what each field came from, for the preview
  }
  if (!text) return result

  const acctNames = accounts.map(a => a?.name).filter(Boolean)
  const catNames = categories.map(c => c?.name).filter(Boolean)

  // ── Amount ──
  const amt = readAmount(text)
  let rest = text
  if (amt) {
    result.amount = amt.amount
    result.matched.amount = amt.raw.trim()
    rest = (text.slice(0, amt.at) + ' ' + text.slice(amt.at + amt.len)).trim()
  }

  // ── Direction ──
  // A transfer is recognised by shape - "from X to Y" - before the inflow
  // words are consulted, because "transfer 500 from maya to bpi" contains
  // neither an inflow word nor an expense one.
  const xfer = /\bfrom\s+(.+?)\s+to\s+(.+?)$/i.exec(rest) || /\b(.+?)\s+to\s+(.+?)$/i.exec(rest)
  const looksTransfer = /\btransfer\b|\bfrom\b.*\bto\b/i.test(rest)
  if (looksTransfer && xfer) {
    const a = matchName(xfer[1], acctNames)
    const b = matchName(xfer[2], acctNames)
    if (a && b && a !== b) {
      result.type = 'transfer'
      result.fromAccount = a
      result.toAccount = b
      result.matched.fromAccount = a
      result.matched.toAccount = b
      result.date = readDate(rest, today).date
      result.description = ''
      result.confident = result.amount != null
      return result
    }
  }

  if (INFLOW_WORDS.some(w => norm(rest).includes(w))) {
    result.type = 'inflow'
    result.matched.type = INFLOW_WORDS.find(w => norm(rest).includes(w))
  }

  // ── Account ──
  // Longest-first matching means "maya savings" beats "maya".
  const acct = matchName(rest, acctNames)
  if (acct) {
    result.account = acct
    result.matched.account = acct
    rest = norm(rest).replace(norm(acct), ' ').replace(/\s+/g, ' ').trim()
  }

  // ── Date ──
  const d = readDate(rest, today)
  result.date = d.date
  if (d.word) {
    result.matched.date = d.word
    rest = norm(rest).replace(d.word, ' ').replace(/\s+/g, ' ').trim()
  }

  // ── Category ──
  // Three sources, most trustworthy first: what the user literally typed, what
  // they have historically filed this merchant under, then the seed list.
  const typed = matchName(rest, catNames)
  if (typed) {
    result.category = typed
    result.matched.category = { via: 'name', value: typed }
  } else {
    const words = norm(rest).split(' ').filter(Boolean)
    // Longest word first, so "supermarket" is consulted before "sm".
    for (const w of [...words].sort((a, b) => b.length - a.length)) {
      if (merchantMap[w]) {
        result.category = merchantMap[w]
        result.matched.category = { via: 'history', value: w }
        break
      }
    }
    if (!result.category) {
      const hay = norm(rest)
      for (const [key, list] of Object.entries(SEED_MERCHANTS)) {
        const hit = list.find(m => hay === m || new RegExp(`(^|\\s)${m}(\\s|$)`).test(hay))
        if (!hit) continue
        // Only if the user actually has a category by that name; a suggestion
        // pointing at a category they deleted is worse than none.
        const real = catNames.find(c => norm(c) === key) ?? catNames.find(c => norm(c).startsWith(key))
        if (real) {
          result.category = real
          result.matched.category = { via: 'merchant', value: hit }
          break
        }
      }
    }
  }

  // ── Description: whatever is left, tidied ──
  const leftover = rest
    .replace(/\b(transfer|from|to|for|at|paid|pay|spent|bought)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  result.description = leftover
    ? leftover.replace(/\b\w/g, c => c.toUpperCase())
    : ''

  // Confident enough to skip the review step: an amount, and a category or a
  // description worth keeping.
  result.confident = result.amount != null && (!!result.category || !!result.description)
  return result
}
