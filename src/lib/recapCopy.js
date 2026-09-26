import { formatAmount, formatWhole } from './currency'
import { monthName } from './recap'

export { WRAPPED_HOME_DAYS, wrappedOnHome } from './recap'

/**
 * What the recap says, chosen from the figures in lib/recap.js.
 *
 * Kept apart from both the arithmetic and the screen so every sentence can
 * be tested against the month it is meant for. Short on purpose: each slide
 * is a label, one figure, and at most one line under it. Friendly, never
 * scolding - a month you overspent gets a fresh start, not a lecture.
 */

/** @typedef {import('./recap').Recap} Recap */

/** "August Wrapped". @param {string} month "2026-08" */
export function wrappedTitle(month) {
  return `${monthName(month)} Wrapped`
}

/**
 * The slides this month has something to say on, in order. The intro and the
 * summary always; everything else only when there is data behind it.
 *
 * @param {Recap} r
 * @returns {string[]}
 */
export function recapSlides(r) {
  const ids = ['intro']
  const bought = r.purchaseCount > 0
  if (bought || r.refunded > 0) ids.push('spent')
  if (r.income > 0) ids.push('kept')
  if (r.categories.length > 0) ids.push('categories')
  if (r.busiestDay) ids.push('days')
  if (r.biggest) ids.push('biggest')
  if (r.goTo) ids.push('goto')
  // A month with nothing bought stayed inside every limit by default.
  if (r.budgets && bought) ids.push('budgets')
  if (r.netWorth && Math.abs(r.netWorth.change) >= 0.005) ids.push('networth')
  if (r.badges.length > 0) ids.push('badges')
  // Every month has a personality, even a quiet one: the story's last word
  // before the summary.
  ids.push('personality')
  ids.push('summary')
  return ids
}

/** Whole units once the centavos stop mattering. @param {number} v */
const isLarge = (v) => Math.abs(v) >= 10000

/** A headline figure: whole units once the centavos stop mattering. */
export function heroAmount(/** @type {number} */ v, /** @type {string} */ code) {
  return isLarge(v) ? formatWhole(v, code) : formatAmount(v, code)
}

/**
 * The formatter for a figure that counts up to `target`: every step of the
 * count in the style of where it ends. heroAmount on each step would show
 * centavos until the count passed 10,000 and then drop them - a figure that
 * changes width, and the size it was fitted to, halfway up.
 *
 * @param {number} target
 * @param {string} code
 * @returns {(v: number) => string}
 */
export function heroFormatFor(target, code) {
  return isLarge(target) ? v => formatWhole(v, code) : v => formatAmount(v, code)
}

/** "−₱1,200" / "+₱1,200": a change always says which way. */
export function signedAmount(/** @type {number} */ v, /** @type {string} */ code) {
  const s = heroAmount(Math.abs(v), code)
  return v < 0 ? `−${s}` : `+${s}`
}

/**
 * A share, as people read one: never "0%" for something that is there, and
 * never "100%" for something that was not all of it.
 *
 * @param {number} share 0..1
 */
export function percent(share) {
  if (!(share > 0)) return '0%'
  if (share >= 1) return '100%'
  const n = Math.round(share * 100)
  return n < 1 ? '<1%' : n > 99 ? '99%' : `${n}%`
}

/**
 * The line under what was spent: against last month, or why there is
 * nothing to compare with.
 *
 * @param {Recap} r
 */
export function spentComparison(r) {
  if (r.firstMonth) return 'Your first month with Spendr'
  if (r.prev.partial) return 'Your first full month with Spendr'
  const c = r.spentChange
  if (!c) return null
  if (c.direction === 'same') return `About the same as ${r.prev.label}`
  /* Past three times as much, a percentage stops meaning anything -
     "999900% more" is a number nobody can picture, and "12×" is. */
  if (c.direction === 'more' && c.ratio >= 3) {
    return `${Math.round(c.ratio).toLocaleString('en-US')}× what you spent in ${r.prev.label}`
  }
  return `${c.pct}% ${c.direction} than ${r.prev.label}`
}

/**
 * The "spent" slide. Almost always what it says - but a month whose refunds
 * outweighed its spending did not spend a negative amount; money came back,
 * and that is the headline.
 *
 * @param {Recap} r
 * @param {string} code
 * @returns {{label: string, value: number, tone: 'ink'|'good', line: string|null, refunds: boolean}}
 */
export function spentCopy(r, code) {
  if (r.spent > 0 || !(r.refunded > 0)) {
    return { label: 'You spent', value: Math.max(0, r.spent), tone: 'ink', line: spentComparison(r), refunds: false }
  }
  const bought = r.purchases > 0 ? heroAmount(r.purchases, code) : null
  return {
    label: 'Came back in refunds',
    value: r.refunded,
    tone: 'good',
    line: !bought
      ? 'From purchases in earlier months'
      : r.refunded > r.purchases ? `More than the ${bought} you spent` : `All of the ${bought} you spent`,
    refunds: true,
  }
}

/**
 * The "kept" slide: what was left of what came in - or, gently, that there
 * was not anything left.
 *
 * @param {Recap} r
 * @param {string} code
 * @returns {{label: string, value: number, tone: 'good'|'soft', line: string|null}}
 */
export function keptCopy(r, code) {
  if (r.net > 0) {
    const share = r.savingsRate ?? 0
    return {
      label: 'You kept',
      value: r.net,
      tone: 'good',
      // Kept more than came in: refunds brought back money spent before.
      line: share > 1
        ? 'More than came in, thanks to refunds'
        : share > 0 ? `${percent(share)} of the ${heroAmount(r.income, code)} that came in` : null,
    }
  }
  if (r.net < 0) {
    return {
      label: 'You spent more than came in',
      value: Math.abs(r.net),
      tone: 'soft',
      line: 'It happens. Next month is a fresh start.',
    }
  }
  return { label: 'You broke even', value: 0, tone: 'soft', line: 'Everything that came in, went out.' }
}

/**
 * The month a week at a time - "Aug 1–7", "Aug 8–14" ... "Aug 29–31" - each
 * with what it came to, for the receipt on the spending slide. Refunds are
 * inside the weeks they came back in, so the weeks add up to the month's
 * total exactly. In a first month, the weeks before the first purchase are
 * weeks before the app, and are left off rather than printed as nothing.
 *
 * @param {Recap} r
 * @returns {Array<{label: string, amount: number}>}
 */
export function weeksOf(r) {
  /** @type {Array<{label: string, amount: number}>} */
  const weeks = []
  for (let start = 1; start <= r.days; start += 7) {
    const end = Math.min(start + 6, r.days)
    const amount = r.daily.slice(start - 1, end).reduce((sum, d) => sum + d.amount, 0)
    const first = dayLabel(r.month, start)
    weeks.push({ label: end === start ? first : `${first}–${end}`, amount: Math.round(amount * 100) / 100 })
  }
  if (!r.firstMonth) return weeks
  const lead = weeks.findIndex(w => w.amount !== 0)
  return lead < 0 ? weeks : weeks.slice(lead)
}

/**
 * @param {Recap} r
 */
export function daysCopy(r) {
  const n = r.noSpendDays
  return {
    noSpend: n === 0 ? 'Something every day' : n === 1 ? '1 no-spend day' : `${n} no-spend days`,
  }
}

/**
 * @param {Recap} r
 */
export function budgetsCopy(r) {
  const b = r.budgets
  if (!b) return null
  if (b.under === b.tracked) {
    if (b.tracked === 1) return { value: 'On budget', line: 'You stayed within it.' }
    return { value: b.tracked === 2 ? 'Both' : `All ${b.tracked}`, line: 'budgets stayed on track.' }
  }
  if (b.under === 0) {
    return { value: `${b.tracked} over`, line: 'A tight month. Worth a look at the limits.' }
  }
  return { value: `${b.under} of ${b.tracked}`, line: 'budgets stayed on track.' }
}

/**
 * The net-worth slide: where you ended the month, and which way it moved.
 *
 * The level, not the change, is the headline. Over a month the change is
 * what came in less what went out - the "kept" figure again - and two slides
 * with the same number on them read as a bug.
 *
 * @param {Recap} r
 * @param {string} code
 */
export function netWorthCopy(r, code) {
  const n = r.netWorth
  if (!n) return null
  const up = n.change > 0
  return {
    label: `Net worth on ${dayLabel(r.month, r.days)}`,
    line: `${up ? 'Up' : 'Down'} ${heroAmount(Math.abs(n.change), code)} since ${dayLabel(r.month, 1)}`,
    tone: /** @type {'good'|'soft'} */ (up ? 'good' : 'soft'),
  }
}

/** "Sep 14". @param {string} month "2026-09" @param {number} day */
export function dayLabel(month, day) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * The closing summary's headline - the spent figure, or what came back when
 * refunds outweighed it. Shared by the slide and the saved picture.
 *
 * `hideAmounts` is for a picture about to be posted somewhere public: the
 * headline becomes a share rather than a sum - how much of what came in was
 * kept - or, with nothing coming in, how many things were bought. The line
 * under it stays; it is already a comparison, not a figure.
 *
 * @param {Recap} r
 * @param {string} code
 * @param {{hideAmounts?: boolean}} [options]
 */
export function summaryHero(r, code, { hideAmounts = false } = {}) {
  const s = spentCopy(r, code)
  if (hideAmounts) {
    if (r.income > 0 && r.net > 0) return { label: 'Kept', value: percent(r.savingsRate ?? 0), line: 'of what came in' }
    if (r.income > 0) return { label: 'Spent', value: `${Math.round((Math.max(0, r.spent) / r.income) * 100)}%`, line: 'of what came in' }
    return { label: 'Bought', value: `${r.purchaseCount.toLocaleString('en-US')} ${r.purchaseCount === 1 ? 'thing' : 'things'}`, line: s.refunds ? null : spentComparison(r) }
  }
  return {
    label: s.refunds ? 'Came back in refunds' : 'Spent',
    value: heroAmount(s.value, code),
    line: s.refunds ? null : spentComparison(r),
  }
}

/** The most tiles the closing card holds: two columns of three. */
export const SUMMARY_TILES = 6

/**
 * The tiles of the closing card - the same tiles on screen and in the saved
 * picture, which is why they are decided here and not in either. Most telling
 * first, so a card with room for fewer keeps the ones that matter.
 *
 * With `hideAmounts`, no tile holds a sum of money: what came in is left out,
 * and kept or overspent is said as a share of it. Everything else on the
 * card - a category, a count, a day - was never an amount.
 *
 * Emoji that every phone in use can draw: nothing newer than Emoji 11, or an
 * older Android shows a box where the pig should be.
 *
 * @param {Recap} r
 * @param {string} code
 * @param {{hideAmounts?: boolean}} [options]
 * @returns {Array<{emoji: string, label: string, value: string, tone?: 'good'|'soft'}>}
 */
export function summaryTiles(r, code, { hideAmounts = false } = {}) {
  /** @type {Array<{emoji: string, label: string, value: string, tone?: 'good'|'soft'}>} */
  const tiles = []
  if (r.income > 0 && hideAmounts) {
    tiles.push(r.net >= 0
      ? { emoji: '🐷', label: 'Kept', value: percent(r.savingsRate ?? 0), tone: 'good' }
      : { emoji: '📉', label: 'Overspent', value: `${Math.round((-r.net / r.income) * 100)}% over`, tone: 'soft' })
  } else if (r.income > 0) {
    tiles.push({ emoji: '💰', label: 'Came in', value: heroAmount(r.income, code) })
    tiles.push(r.net >= 0
      ? { emoji: '🐷', label: 'Kept', value: heroAmount(r.net, code), tone: 'good' }
      : { emoji: '📉', label: 'Overspent', value: heroAmount(-r.net, code), tone: 'soft' })
  }
  if (r.categories.length) tiles.push({ emoji: r.categories[0].icon || '🏷️', label: 'Top category', value: r.categories[0].name })
  if (r.purchaseCount > 0) {
    tiles.push({ emoji: '🛍️', label: 'Purchases', value: r.purchaseCount.toLocaleString('en-US') })
    tiles.push({ emoji: '🌿', label: 'No-spend days', value: String(r.noSpendDays) })
  }
  if (r.busiestDay) tiles.push({ emoji: '🔥', label: 'Busiest day', value: dayLabel(r.month, r.busiestDay.day) })
  if (r.badges.length) {
    tiles.push({ emoji: '🏅', label: r.badges.length === 1 ? 'New badge' : 'New badges', value: String(r.badges.length) })
  }
  return tiles.slice(0, SUMMARY_TILES)
}

/**
 * @typedef {object} Personality
 * @property {string} key     which one, for tests and for the picture
 * @property {string} name    "The Regular"
 * @property {string} emoji
 * @property {string} art     the 3D illustration drawn for it (src/assets/recap)
 * @property {string} line    why - one sentence from the month's own figures
 * @property {Array<{emoji: string, text: string}>} traits  up to three facts to back it
 */

/** Categories that are eating and drinking, by the words people name them with. */
const FOOD = /food|dining|restaurant|eat|meal|grocer|coffee|caf[eé]|snack|lunch|dinner|breakfast/i
/** Places that are cafés, by the words their names use. */
const CAFE = /coffee|caf[eé]|kape|starbucks|tim hortons|tea|brew|espresso/i

/**
 * The month's money personality: a name for how it went, the way a
 * streaming service names your taste. Chosen by rules, not at random, so the
 * same month always gets the same one, and every one of them is backed by a
 * figure the slide shows as well.
 *
 * Each rule says when it applies and how strongly; the strongest wins.
 * Kind even at its bluntest - a month that ran over is a Fresh Start, and a
 * first month is a New Arrival, not a verdict on four days.
 *
 * @param {Recap} r
 * @returns {Personality}
 */
export function personalityOf(r) {
  const top = r.categories[0] ?? null
  const bigShare = r.biggest && r.purchases > 0 ? r.biggest.amount / r.purchases : 0
  const b = r.budgets
  /** @type {Array<{when: boolean, score: number, p: Omit<Personality, 'traits'>}>} */
  const rules = [
    {
      when: r.income > 0 && (r.savingsRate ?? 0) >= 0.3,
      score: 40 + (r.savingsRate ?? 0) * 100,
      p: { key: 'saver', name: 'The Saver', emoji: '🐷', art: 'pig-face', line: `You kept ${percent(r.savingsRate ?? 0)} of what came in.` },
    },
    {
      when: !!r.goTo && r.goTo.count >= 8,
      score: 50 + (r.goTo?.count ?? 0) * 2,
      p: {
        key: 'regular', name: 'The Regular', emoji: r.goTo?.icon || '📍',
        // A café regular gets a cup; anywhere else, the pin on the map.
        art: r.goTo && (r.goTo.icon === '☕' || CAFE.test(r.goTo.label)) ? 'hot-beverage' : 'round-pushpin',
        line: `${r.goTo?.count} visits to ${r.goTo?.label}.`,
      },
    },
    {
      when: !!b && b.tracked >= 2 && b.under === b.tracked,
      score: 62 + (b?.tracked ?? 0) * 3,
      p: { key: 'planner', name: 'The Planner', emoji: '🎯', art: 'bullseye', line: `All ${b?.tracked} budgets stayed on track.` },
    },
    {
      when: r.purchaseCount > 0 && r.noSpendDays >= 8,
      // Capped: a month with two purchases has 28 quiet days, which is a fact, not a flair.
      score: 40 + Math.min(r.noSpendDays, 12) * 2,
      p: { key: 'minimalist', name: 'The Minimalist', emoji: '🌿', art: 'herb', line: `${r.noSpendDays} days without spending a thing.` },
    },
    {
      // Four purchases at least: with two, one of them is half the month by arithmetic alone.
      when: r.purchaseCount >= 4 && bigShare >= 0.25,
      score: 40 + Math.min(bigShare, 0.5) * 60,
      p: { key: 'treat', name: 'The Treat Yourself', emoji: '🛍️', art: 'shopping-bags', line: `${percent(bigShare)} of the month went on one buy.` },
    },
    {
      when: !!top && FOOD.test(top.name) && top.share >= 0.35,
      score: 35 + Math.min(top?.share ?? 0, 0.6) * 50,
      p: { key: 'foodie', name: 'The Foodie', emoji: '🍔', art: 'hamburger', line: `${percent(top?.share ?? 0)} of your spending was ${top?.name}.` },
    },
    {
      when: !!r.netWorth && r.netWorth.change > 0 && r.spentChange?.direction === 'less',
      score: 38,
      p: { key: 'climber', name: 'The Steady Climber', emoji: '📈', art: 'rocket', line: `You spent less than ${r.prev.label}, and your net worth went up.` },
    },
    {
      when: r.income > 0 && r.net < 0,
      score: 66,
      p: { key: 'fresh', name: 'The Fresh Start', emoji: '🌱', art: 'seedling', line: 'A big month. The next one is a clean slate.' },
    },
    {
      when: r.firstMonth,
      // Above the quiet-days rule: a first month is mostly days before the app.
      score: 66,
      p: { key: 'new', name: 'The New Arrival', emoji: '✨', art: 'sparkles', line: 'Your first month with Spendr. Here is to the next.' },
    },
    {
      when: true,
      score: 10,
      p: { key: 'allrounder', name: 'The All-Rounder', emoji: '⚖️', art: 'glowing-star', line: 'A bit of everything, and nothing out of hand.' },
    },
  ]
  const best = rules.filter(x => x.when).sort((a, z) => z.score - a.score)[0].p

  /* Three facts to back it, never the one its own line already says. */
  /** @type {Array<{key: string, emoji: string, text: string}>} */
  const facts = []
  if (r.income > 0 && r.net > 0) facts.push({ key: 'saver', emoji: '🐷', text: `Kept ${percent(r.savingsRate ?? 0)}` })
  if (r.goTo) facts.push({ key: 'regular', emoji: r.goTo.icon || '📍', text: `${r.goTo.count}× ${r.goTo.label}` })
  if (b) facts.push({ key: 'planner', emoji: '🎯', text: `${b.under} of ${b.tracked} budgets on track` })
  if (r.purchaseCount > 0) facts.push({ key: 'minimalist', emoji: '🌿', text: `${r.noSpendDays} no-spend ${r.noSpendDays === 1 ? 'day' : 'days'}` })
  if (top) facts.push({ key: 'foodie', emoji: top.icon || '🏷️', text: `Most on ${top.name}` })
  if (r.purchaseCount > 0) facts.push({ key: 'count', emoji: '🛍️', text: `${r.purchaseCount.toLocaleString('en-US')} ${r.purchaseCount === 1 ? 'purchase' : 'purchases'}` })
  const traits = facts.filter(f => f.key !== best.key).slice(0, 3).map(({ emoji, text }) => ({ emoji, text }))
  return { ...best, traits }
}
