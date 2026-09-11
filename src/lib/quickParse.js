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
 * ledger. `learnLedger` reads what you have historically done with a merchant,
 * so "jollibee" maps to whatever YOU call it - Food, or Dining Out, or Vices -
 * rather than to a model's guess about a Filipino fast-food chain. That gets
 * more accurate the longer you use the app, which is the opposite of how a
 * fixed prompt behaves.
 *
 * Where a model would genuinely help is the long tail - "split the 900 dinner
 * three ways", "gas 1200 charge to maya credit next friday". The intended shape
 * for that is: parse locally, and when confidence is low, OFFER to ask a model
 * rather than doing it silently. That is a v2, and it stays opt-in.
 */

// ── Cold-start merchant map ─────────────────────────────────────────────────
//
// Only needed before there is any history to learn from - learnLedger wins
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

/**
 * Words that can never identify a merchant, so they must never become a rule.
 *
 * Kept deliberately SHORT. The first version of the learner had no list at
 * all and indexed every word of every description, which against a real
 * 25-row ledger produced "with" -> Food (from "Lunch with team") and fired on
 * "800 with mom". The instinct is then to grow this list until the noise
 * stops - but most of the noise was never stopwords. It was ordinary words
 * like "run" and "team" that happened to appear once.
 *
 * So the evidence bar below does the heavy lifting, and this list only holds
 * words that carry no signal even when they appear a hundred times.
 */
const STOPWORDS = new Set([
  // English function words
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'at', 'in', 'on', 'to', 'from',
  'with', 'by', 'per', 'via', 'into', 'onto', 'off', 'out', 'up', 'as',
  'is', 'was', 'be', 'my', 'me', 'mine', 'our', 'we', 'us', 'his', 'her',
  'their', 'them', 'it', 'its', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'they',
  // Tagalog and Taglish function words
  'sa', 'ng', 'nga', 'na', 'po', 'ko', 'ka', 'ako', 'siya', 'kami', 'tayo',
  'yung', 'ung', 'mga', 'kay', 'para', 'yan', 'ito', 'din', 'rin', 'lang',
  'naman', 'daw', 'raw',
  // the verbs quick log strips from a description anyway, so they carry none
  'paid', 'pay', 'payment', 'spent', 'spend', 'bought', 'buy', 'purchase',
  'purchased', 'transfer', 'transferred', 'sent', 'send', 'received',
  'receive', 'charge', 'charged',
  // dates, consumed by the date reader before this ever sees them
  'today', 'yesterday', 'kahapon', 'ngayon',
])

// ── Learning parameters ─────────────────────────────────────────────────────
//
// These were SWEPT, not chosen. Against a real 1,019-row nine-month ledger,
// trained on the oldest 80% and scored on the 179 unseen transactions after
// it, with "today" set to each test row's own date so decay is honest.
//
// Headline, at the values below:
//
//     category    offered 75%   correct 80%   (86% excluding "Others")
//     account     offered 17%   correct 67%
//     direction   always        correct 93%
//
// Every knob is overridable via learnLedger's opts so the sweep can be re-run
// on a different ledger. See the notes on each.

/**
 * A category you used six months ago should not outvote last week's.
 *
 * MEASURED: no effect. 30, 60, 90, 180 days and no decay at all scored
 * identically (75%/80%) on the real ledger. That is not a bug in the decay -
 * it is that decay only changes an answer when a merchant genuinely SWITCHED
 * category, and this user has almost none of those. Kept because the failure
 * it guards against is real and the cost is one Math.pow, but it is unproven
 * on real data and should not be defended as if it were earning its keep.
 */
const HALF_LIFE_DAYS = 90
/** A single word needs corroboration; a whole phrase does not. See phrasesOf. */
const MIN_ROWS_FOR_WORD = 2
/** A winner must be this many times the runner-up, or there is no winner. */
const CLEAR_FAVOURITE = 2
/** Below this many samples, "your usual amount" is not a thing yet. */
const MIN_ROWS_FOR_AMOUNT = 3
/** How far from the median before an amount is worth mentioning. */
const AMOUNT_OUTLIER_FACTOR = 8

/**
 * Accounts are held to a much higher bar than categories, and this is the
 * single most important thing the real-ledger sweep changed.
 *
 * WHICH account paid for something is far less predictable than WHAT it was.
 * This user moves money between MariBank, GCash and Maya constantly - 123
 * transfers in nine months - so the account is a fact about that week's cash
 * position, not a property of the merchant. Measured at the old category-level
 * thresholds, the account guess was offered on 51% of transactions and was
 * right 42% of the time: it was wrong more often than right, and a wrong
 * prefill on a money field is worse than an empty one.
 *
 * Sweeping lead x minimum rows, precision plateaus around 67% and never gets
 * better however strict it is. So the choice is how much WRONG to accept for
 * how much coverage, and 3/3 is where that trade stops improving:
 *
 *     lead 2, rows 1   offered 51%   correct 42%    53 wrong per 179
 *     lead 3, rows 3   offered 17%   correct 67%    10 wrong per 179
 *
 * Five times fewer wrong prefills for a third of the coverage. Worth it: the
 * ones it now offers are the habits that really are habits, and the preview
 * marks every inferred field as a guess rather than a fact.
 */
const ACCOUNT_LEAD = 3
const ACCOUNT_MIN_ROWS = 3

/**
 * Direction is the costliest field to get wrong - every other mistake is a
 * mis-filing you can see, this one moves the balance the wrong way by twice
 * the amount - so it needs a clearer lead than a category does.
 *
 * MEASURED: 92.2% at lead 2, 92.7% at lead 3, and flat above that.
 */
const TYPE_LEAD = 3

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

/**
 * A transfer fee, tacked onto the end the way people actually write one:
 * "500 from gcash to maya, 18 tf" - or "18 fee", or "18 transfer fee".
 *
 * Two guards, because "fee" is also an ordinary English word that shows up in
 * real merchant names. This ledger has "PPark Entrance Fee", "VLiner
 * Reservation Fee", "Withdraw Service Fee" and "Clearance Fee to Gelo", and
 * reading a fee out of any of those would silently eat the amount.
 *
 *   1. The string must contain at least TWO numbers. "200 entrance fee" has
 *      one, so there is nothing to be a fee ALONGSIDE, and it is left alone.
 *   2. The number must be ADJACENT to the fee word. In "1500 entrance fee"
 *      the word before "fee" is "entrance", not a number.
 *
 * Both orders are accepted - "18 tf" and "tf 18" - because the abbreviation
 * invites either.
 */
/* Regex LITERALS, not new RegExp with a template string: inside a template
   literal `\s` is just `s`, so building these by interpolation silently
   produced `[s,]` and matched nothing. The duplication is the safer trade. */
const FEE_AFTER  = /(?:^|[\s,])(?:₱\s*)?(\d[\d,]*(?:\.\d+)?)\s*(?:tf|transfer\s+fee|fee)\b/i
const FEE_BEFORE = /(?:^|[\s,])(?:tf|transfer\s+fee|fee)\s*(?:₱\s*)?(\d[\d,]*(?:\.\d+)?)\b/i

function readFee(text) {
  const numbers = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []
  if (numbers.length < 2) return null
  const m = FEE_AFTER.exec(text) ?? FEE_BEFORE.exec(text)
  if (!m) return null
  const amount = parseFloat(m[1].replace(/,/g, ''))
  if (!Number.isFinite(amount)) return null
  return { amount, at: m.index, len: m[0].length }
}

/** Normalise for matching: lowercase, collapse whitespace, drop punctuation. */
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

const isNumeric = (w) => /^\d+$/.test(w)
const isNoise = (w) => !w || isNumeric(w) || STOPWORDS.has(w)

/**
 * Every key one description contributes, and how much each one is trusted.
 *
 * Three kinds, and the distinction is the whole fix for the noise problem:
 *
 *   the FULL description   "sm supermarket"   strong
 *   each adjacent PAIR     "milk tea"         strong
 *   each single WORD       "jollibee"         weak
 *
 * Strong keys are believed on a single transaction, because you wrote the
 * whole thing and it means what it says. Weak keys need corroboration, because
 * a description is mostly connective tissue: "Lunch with team" contributes
 * three words of which two are meaningless on their own.
 *
 * Pairs are how a multi-word merchant survives. Before this, "SM Supermarket"
 * was learned as "sm" and "supermarket" separately, and "sm" was then thrown
 * away for being under the length floor - so the one thing you would actually
 * type was the one thing it could not learn.
 */
function phrasesOf(desc) {
  const words = norm(desc).split(' ').filter(Boolean)
  if (!words.length) return []

  const out = []
  // The full description, as long as it is not made entirely of noise.
  if (words.some(w => !isNoise(w))) out.push({ key: words.join(' '), strong: true })

  for (let i = 0; i + 1 < words.length; i++) {
    if (isNoise(words[i]) || isNoise(words[i + 1])) continue
    out.push({ key: `${words[i]} ${words[i + 1]}`, strong: true })
  }
  for (const w of words) {
    // Two characters, not three: "SM" and "7E" are real merchants here. The
    // length floor used to be the reason "sm" could never be learned; the
    // evidence bar is a better guard than a character count.
    if (w.length < 2 || isNoise(w)) continue
    out.push({ key: w, strong: false })
  }

  // One entry per key, preferring the strong reading. "Grab" is both a full
  // description and a word; it should be believed on one transaction.
  const best = new Map()
  for (const p of out) {
    const cur = best.get(p.key)
    if (!cur || (p.strong && !cur.strong)) best.set(p.key, p)
  }
  return [...best.values()]
}

/** How much a transaction from `dateStr` still counts, today. */
function ageWeight(dateStr, nowMs, halfLife = HALF_LIFE_DAYS) {
  if (!dateStr) return 1
  const t = Date.parse(dateStr)
  if (!Number.isFinite(t)) return 1
  const days = (nowMs - t) / 86_400_000
  if (!(days > 0)) return 1          // today, or dated forward
  return Math.pow(0.5, days / halfLife)
}

/**
 * The most-weighted entry, or null when nothing clearly leads.
 *
 * Ties and near-ties return null on purpose. "load" filed half under Bills and
 * half under Transpo has no right answer, and a coin flip that fills in a
 * field is worse than an empty field you can see is empty.
 */
function winner(counts, lead = CLEAR_FAVOURITE) {
  if (!counts.size) return null
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const [top, n] = ranked[0]
  const runnerUp = ranked[1]?.[1] ?? 0
  if (runnerUp && n < runnerUp * lead) return null
  return top
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Everything this user's own ledger can teach the parser.
 *
 * Returns four indexes keyed by the same phrases:
 *
 *   category  what you file this under
 *   account   which account you pay it from - the field a model could never
 *             know, and the one that saves the most taps
 *   type      expense or inflow, so money coming IN is not booked as going
 *             out just because nobody hardcoded the word for it
 *   amount    { median, n }, so an order-of-magnitude typo can be questioned
 *   keys      every phrase worth matching against, longest-first at lookup
 *
 * Recency-weighted with a 90-day half-life, so a category you have moved on
 * from fades rather than competing forever. Evidence, though, is counted RAW:
 * how many transactions back a rule is a question about corroboration, not
 * about how recent they were, and decaying it would let a well-established
 * old habit fall below the bar and vanish.
 *
 * @param {Array} transactions rows from db.transactions - all of them, every
 *                account and every type. Nothing here is account-scoped.
 * @param {object} opts  { now } - injectable so tests are not time-dependent.
 */
export function learnLedger(transactions = [], opts = {}) {
  const nowMs = opts.now != null ? new Date(opts.now).getTime() : Date.now()
  // Overridable so the thresholds can be swept against a real ledger rather
  // than argued about. The defaults above are what shipped; every override
  // here exists because holdout measurement moved it.
  const halfLife    = opts.halfLifeDays   ?? HALF_LIFE_DAYS
  const minRows     = opts.minRowsForWord ?? MIN_ROWS_FOR_WORD
  const catLead     = opts.categoryLead   ?? CLEAR_FAVOURITE
  const acctLead    = opts.accountLead    ?? ACCOUNT_LEAD
  const acctMinRows = opts.accountMinRows ?? ACCOUNT_MIN_ROWS
  const typeLead    = opts.typeLead       ?? TYPE_LEAD

  const stats = new Map()
  for (const tx of transactions) {
    if (!tx?.description) continue
    const w = ageWeight(tx.date, nowMs)
    for (const { key, strong } of phrasesOf(tx.description)) {
      let s = stats.get(key)
      if (!s) {
        s = { rows: 0, strong: false, cat: new Map(), acct: new Map(), kind: new Map(), amounts: [] }
        stats.set(key, s)
      }
      s.rows++
      if (strong) s.strong = true
      if (tx.category) s.cat.set(tx.category, (s.cat.get(tx.category) ?? 0) + w)
      if (tx.account) s.acct.set(tx.account, (s.acct.get(tx.account) ?? 0) + w)
      if (tx.type) s.kind.set(tx.type, (s.kind.get(tx.type) ?? 0) + w)
      if (Number.isFinite(tx.amount) && tx.amount > 0) s.amounts.push(Math.abs(tx.amount))
    }
  }

  const category = {}, account = {}, type = {}, amount = {}
  for (const [key, s] of stats) {
    if (!s.strong && s.rows < minRows) continue
    const c = winner(s.cat, catLead)
    if (c) category[key] = c
    // Accounts are held to a HIGHER bar than categories - see ACCOUNT_LEAD.
    const a = s.rows >= acctMinRows ? winner(s.acct, acctLead) : null
    if (a) account[key] = a
    const k = winner(s.kind, typeLead)
    if (k) type[key] = k
    if (s.amounts.length >= MIN_ROWS_FOR_AMOUNT) {
      amount[key] = { median: median(s.amounts), n: s.amounts.length }
    }
  }

  const keys = [...new Set([
    ...Object.keys(category), ...Object.keys(account), ...Object.keys(type),
  ])]

  /*
    What a typo is allowed to reach, as [token, the key it stands for].

    Built once here rather than on each keystroke, because fuzzy matching is
    the only part of parsing that is not O(small) - a nine-month ledger can
    carry a few thousand keys and this runs on every character typed.

    Multi-word keys contribute their individual words, so "supermrket" can
    still find "sm supermarket". Without that, the phrase index - which is the
    thing that made multi-word merchants work at all - would be exactly the
    part typo tolerance could not see.
  */
  const fuzzyTerms = []
  const claimed = new Set()
  // Fewest words first, so the token "grab" is claimed by the key "grab"
  // rather than by "grab airport" - a token should stand for the narrowest
  // key that contains it, not the first one encountered.
  const byWordCount = [...keys].sort(
    (a, b) => a.split(' ').length - b.split(' ').length || a.length - b.length,
  )
  for (const key of byWordCount) {
    for (const token of key.split(' ')) {
      if (isNoise(token) || token.length < 5) continue
      if (claimed.has(token)) continue
      claimed.add(token)
      fuzzyTerms.push([token, key])
    }
  }

  return { category, account, type, amount, keys, fuzzyTerms }
}

/**
 * The category half of learnLedger.
 *
 * Kept as its own export because "what does my ledger say this word means" is
 * a question worth being able to ask on its own, and because it is what the
 * parser's `merchantMap` option takes.
 */
export function learnMerchants(transactions = [], opts = {}) {
  return learnLedger(transactions, opts).category
}

/** Longest-first, so "sm supermarket" wins over "sm store" on the same text. */
function matchName(text, names) {
  const hay = norm(text)
  if (!hay) return null
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

/**
 * Levenshtein distance, abandoned as soon as it cannot come in under `max`.
 *
 * The early exit is not premature optimisation: this runs against every
 * learned key on every keystroke, and a nine-month ledger can carry a few
 * thousand of them.
 */
function withinEdits(a, b, max) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > max) return false
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      if (row[j] < best) best = row[j]
    }
    if (best > max) return false
    prev = row
  }
  return prev[b.length] <= max
}

/**
 * How many edits a word of this length may be off by.
 *
 * Zero under five characters, deliberately. At four characters one edit
 * reaches half the vocabulary - "cash"/"gash", "food"/"ford" - and a wrong
 * confident answer is worse than no answer. Long words earn a second edit
 * because "supermrket" and "jollibbee" are the shape real typing takes.
 */
function editBudget(word) {
  if (word.length >= 8) return 2
  if (word.length >= 5) return 1
  return 0
}

/**
 * The nearest miss between a word you typed and something known.
 *
 * `pairs` is [token, key]: the token is what gets compared, the key is what
 * the answer is looked up under. For a single-word key the two are the same;
 * for "sm supermarket" the token "supermarket" stands for the whole phrase.
 *
 * Only ever compares single tokens. Fuzzy-matching a whole phrase against one
 * word would let a big enough edit budget connect almost anything.
 *
 * Distance 0 is a legitimate result, not a bug: "supermarket" typed exactly is
 * the same claim as "supermrket" typed badly, and both stand for the phrase
 * "sm supermarket". An earlier version started at distance 1, which let an
 * exact hit through anyway - withinEdits returns early on equality - but
 * reported it as a typo, so the preview told the user they had misspelled a
 * word they had spelled correctly. The caller reads `distance` to say which
 * happened.
 *
 * The token length floor in editBudget is what keeps this safe. It is why the
 * measured junk - "with", "run", "team" - cannot be reached here at all.
 */
function nearestMiss(text, pairs) {
  const words = norm(text).split(' ').filter(w => !isNoise(w))
  let best = null
  for (const w of words) {
    const budget = editBudget(w)
    if (!budget) continue
    for (const [token, key] of pairs) {
      if (token.includes(' ')) continue
      if (Math.abs(token.length - w.length) > budget) continue
      for (let d = 0; d <= budget; d++) {
        if (!withinEdits(w, token, d)) continue
        if (!best || d < best.distance) best = { key, token, word: w, distance: d }
        break
      }
    }
  }
  return best
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
 * @param {object} ctx
 *   accounts, categories  - to resolve names against, and to refuse to
 *                           suggest anything the user no longer has
 *   knowledge             - from learnLedger. `merchantMap` is still accepted
 *                           as the category-only shorthand
 *   recurring, templates  - matched by name, so an existing bill is offered
 *                           rather than silently duplicated
 *   today
 */
export function quickParse(input, ctx = {}) {
  const {
    accounts = [],
    categories = [],
    recurring = [],
    templates = [],
    merchantMap,
    knowledge,
    today = new Date(),
  } = ctx

  // merchantMap is the category-only shorthand, and the only thing the parser
  // took before it learned accounts and amounts.
  const know = knowledge ?? {
    category: merchantMap ?? {},
    account: {},
    type: {},
    amount: {},
    keys: Object.keys(merchantMap ?? {}),
  }

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
    fee: null,            // a transfer fee typed alongside, "… 18 tf"
    confident: false,
    amountFlag: null,     // { median, n, phrase } when it is wildly off your usual
    recurringMatch: null, // an existing bill this probably IS
    templateMatch: null,
    matched: {},          // what each field came from, for the preview
  }
  if (!text) return result

  const acctNames = accounts.map(a => a?.name).filter(Boolean)
  const catNames = categories.map(c => c?.name).filter(Boolean)
  const hasCategory = (name) => catNames.some(c => c === name)
  const hasAccount = (name) => acctNames.some(a => a === name)

  // ── Fee, before anything else ──
  // Removed from the string first so the fee's number cannot be read as THE
  // amount, and so "18 tf" cannot end up inside the "to <account>" capture.
  let working = text
  const feeHit = readFee(text)
  if (feeHit) {
    result.fee = feeHit.amount
    result.matched.fee = true
    working = (text.slice(0, feeHit.at) + ' ' + text.slice(feeHit.at + feeHit.len))
      .replace(/\s*,\s*$/, '').trim()
  }

  // ── Amount ──
  const amt = readAmount(working)
  let rest = working
  if (amt) {
    result.amount = amt.amount
    result.matched.amount = amt.raw.trim()
    rest = (working.slice(0, amt.at) + ' ' + working.slice(amt.at + amt.len)).trim()
  }
  // Kept before anything is stripped out, for matching bills and templates -
  // both of which are named after things that also look like accounts.
  const afterAmount = rest

  // ── Direction ──
  //
  // A transfer is recognised by shape - "X to Y" - before the inflow words are
  // consulted, because "transfer 500 from maya to bpi" contains neither an
  // inflow word nor an expense one.
  //
  // The gate is that BOTH sides resolve to real accounts, and to different
  // ones. That is a far stronger signal than any keyword, and relying on it
  // alone is what lets "1000 gcash to cash" work - an earlier version also
  // required the literal word "from" or "transfer", so the most natural way to
  // phrase a transfer was the one way it did not understand.
  //
  // Nothing is lost by dropping the keyword. "150 lunch to go", "500 gift to
  // mom" and "200 back to school" all fail on the same guard, because neither
  // side of them is an account you hold.
  const xfer = /\bfrom\s+(.+?)\s+to\s+(.+?)$/i.exec(rest) || /\b(.+?)\s+to\s+(.+?)$/i.exec(rest)
  if (xfer) {
    const a = matchName(xfer[1], acctNames)
    const b = matchName(xfer[2], acctNames)

    /*
      When it ALMOST parsed as a transfer, say so.

      Falling through to an expense in silence is the worst of the options.
      "200 from maya savings to maya" on a device with no Maya Savings account
      matches "Maya" on both sides, refuses the transfer, and quietly produces
      an expense on Maya described "Savings Maya" - which looks filled in and
      is wrong in the one way that costs money.

      Only raised when at least one side IS a real account, which is what
      separates a near-miss transfer from ordinary English: "150 lunch to go"
      and "500 gift to mom" resolve on neither side and say nothing.
    */
    if (!(a && b && a !== b) && (a || b)) {
      result.transferIssue = a && b
        ? { reason: 'same-account', account: a }
        : { reason: 'unknown-account', typed: (a ? xfer[2] : xfer[1]).trim() }
    }

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

  const inflowWord = INFLOW_WORDS.find(w => norm(rest).includes(w))
  if (inflowWord) {
    result.type = 'inflow'
    result.matched.type = { via: 'word', value: inflowWord }
  }

  // ── Account, as typed ──
  // Longest-first matching means "maya savings" beats "maya".
  const acct = matchName(rest, acctNames)
  if (acct) {
    result.account = acct
    result.matched.account = { via: 'name', value: acct }
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
  //
  // Four sources, most trustworthy first: what you literally typed, the
  // longest phrase your own ledger recognises, the seed list, and only then a
  // near-miss on a word you probably mistyped.
  //
  // `phrase` is remembered because the account and amount indexes are keyed by
  // the same string: having worked out that "grab" is the merchant, the parser
  // already knows which account you pay it from.
  let phrase = null
  let phraseVia = null

  const typed = matchName(rest, catNames)
  if (typed) {
    result.category = typed
    result.matched.category = { via: 'name', value: typed }
    // Strip it, exactly as a named account is stripped a few lines up.
    //
    // "150 jollibee food gcash" was landing in the ledger described as
    // "Jollibee Food". The category name there is an INSTRUCTION, not part of
    // what you bought - you were telling the parser where to file it, and it
    // has now done that. Leaving the word in means every such row carries a
    // category name forever, and worse, the learner reads those rows back:
    // "food" gets reinforced as a merchant word by descriptions that only
    // contain it because the parser failed to remove it.
    //
    // Only for a TYPED category. One inferred from history came from words
    // like "lrt fare" that genuinely are the description.
    rest = norm(rest).replace(norm(typed), ' ').replace(/\s+/g, ' ').trim()
  } else {
    const learned = matchName(rest, know.keys)
    if (learned) {
      phrase = learned
      phraseVia = 'history'
      const c = know.category[learned]
      // Guard on hasCategory for the same reason the seed path does: a
      // suggestion pointing at a category you have since deleted or renamed
      // is worse than no suggestion at all.
      if (c && hasCategory(c)) {
        result.category = c
        result.matched.category = { via: 'history', value: learned }
      }
    }

    if (!result.category) {
      const hay = norm(rest)
      for (const [key, list] of Object.entries(SEED_MERCHANTS)) {
        const hit = list.find(m => hay === m || new RegExp(`(^|\\s)${m}(\\s|$)`).test(hay))
        if (!hit) continue
        const real = catNames.find(c => norm(c) === key) ?? catNames.find(c => norm(c).startsWith(key))
        if (real) {
          result.category = real
          result.matched.category = { via: 'merchant', value: hit }
          if (!phrase) { phrase = hit; phraseVia = 'merchant' }
          break
        }
      }
    }

    // Last resort. Only reached when nothing matched exactly, so a near miss
    // is the best remaining explanation for what you typed.
    if (!result.category) {
      // Your own ledger first, the seed list second - the same order the exact
      // passes use, for the same reason.
      const learnedPairs = know.fuzzyTerms ?? know.keys.map(k => [k, k])
      const learnedHit = nearestMiss(rest, learnedPairs)
      const learnedCat = learnedHit ? know.category[learnedHit.key] : null

      if (learnedCat && hasCategory(learnedCat)) {
        phrase = learnedHit.key
        phraseVia = learnedHit.distance === 0 ? 'history' : 'typo'
        result.category = learnedCat
        result.matched.category = learnedHit.distance === 0
          ? { via: 'history', value: learnedHit.key }
          : { via: 'typo', value: learnedHit.key, typed: learnedHit.word }
      } else {
        // Seed terms carry their category key rather than a phrase key, so the
        // pair's second slot is the SEED_MERCHANTS bucket name.
        const seedPairs = Object.entries(SEED_MERCHANTS)
          .flatMap(([bucket, list]) => list.map(term => [term, bucket]))
        const seedHit = nearestMiss(rest, seedPairs)
        if (seedHit) {
          const real = catNames.find(c => norm(c) === seedHit.key)
            ?? catNames.find(c => norm(c).startsWith(seedHit.key))
          if (real) {
            result.category = real
            result.matched.category = seedHit.distance === 0
              ? { via: 'merchant', value: seedHit.token }
              : { via: 'typo', value: seedHit.token, typed: seedHit.word }
          }
        }
      }
    }
  }

  // ── Account, inferred ──
  // Only when you did not name one. The phrase that identified the merchant is
  // the same key the account index is under, so this costs one lookup.
  if (!result.account && phrase) {
    const a = know.account[phrase]
    if (a && hasAccount(a)) {
      result.account = a
      result.matched.account = { via: 'history', value: phrase }
    }
  }

  // ── Direction, corrected against what you have actually done ──
  //
  // INFLOW_WORDS above is a fixed English-and-Tagalog list, and a fixed list
  // cannot know your words. "Sideline", "Padala", "Rental", the name of the
  // person who pays you - all money coming IN, all booked as going OUT,
  // because nobody hardcoded them. Getting the SIGN wrong is the worst
  // mistake this parser can make: every other field is a mis-filing you can
  // see, and this one moves the balance the wrong way, twice over.
  //
  // So the ledger overrides the list, in both directions, for the same reason
  // it overrides SEED_MERCHANTS: nine rows of your own behaviour is better
  // evidence than a word someone guessed at. "Interest" is in the list as an
  // inflow, but if you have only ever paid interest on a card, it is yours.
  //
  // Transfers never reach here - that branch returns early - so this only
  // ever chooses between expense and inflow.
  if (phrase && phraseVia !== 'typo') {
    const learnedType = know.type?.[phrase]
    if ((learnedType === 'inflow' || learnedType === 'expense') && learnedType !== result.type) {
      result.type = learnedType
      result.matched.type = { via: 'history', value: phrase }
    }
  }

  // ── Is this amount like your others? ──
  // A hint, never a block. The common case it catches is a dropped or extra
  // zero, which is the one typo that costs real money to discover late.
  if (result.amount != null && phrase) {
    const stat = know.amount[phrase]
    if (stat && stat.n >= MIN_ROWS_FOR_AMOUNT) {
      const high = result.amount > stat.median * AMOUNT_OUTLIER_FACTOR
      const low = result.amount * AMOUNT_OUTLIER_FACTOR < stat.median
      if (high || low) {
        result.amountFlag = { median: stat.median, n: stat.n, phrase, direction: high ? 'high' : 'low' }
      }
    }
  }

  // ── Is this a bill you already have? ──
  // Matched against the text before accounts were stripped, because bills are
  // named after the things people also name accounts after.
  const liveBills = recurring.filter(r => r?.name && r.active !== false)
  const billHit = matchName(afterAmount, liveBills.map(r => r.name))
  if (billHit) result.recurringMatch = liveBills.find(r => r.name === billHit) ?? null

  const namedTemplates = templates.filter(t => t?.name)
  const tplHit = matchName(afterAmount, namedTemplates.map(t => t.name))
  if (tplHit) {
    const tpl = namedTemplates.find(t => t.name === tplHit) ?? null
    result.templateMatch = tpl
    // A template you named is a stronger statement than anything inferred, so
    // it FILLS GAPS rather than being reported and ignored. It does not
    // overwrite: if the ledger or the text already answered a field, that
    // answer came from this sentence and the template's is generic.
    if (tpl) {
      if (!result.category && tpl.category && hasCategory(tpl.category)) {
        result.category = tpl.category
        result.matched.category = { via: 'template', value: tpl.name }
      }
      if (!result.account && tpl.account && hasAccount(tpl.account)) {
        result.account = tpl.account
        result.matched.account = { via: 'template', value: tpl.name }
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
