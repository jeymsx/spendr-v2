/**
 * The five ways a bill gets divided between people.
 *
 * ── Why five ──
 *
 * They are not variations on one idea, they are five different things people
 * already say out loud at a table:
 *
 *   equal    "split it"
 *   exact    "mine was 340"
 *   percent  "you cover 70"
 *   shares   "two of us ate, you had one" - proportional without doing sums
 *   adjust   "same each, except I had the dessert"
 *
 * `adjust` is the one that looks redundant and is not. Everyone splitting
 * evenly EXCEPT for named extras is the commonest real bill there is, and
 * expressing it in exact amounts means recomputing every share by hand the
 * moment one number changes.
 *
 * ── Rounding is the whole difficulty ──
 *
 * 100 pesos between three people is 33.333 each, and three times 33.33 is
 * 99.99. A cent has to go somewhere, and if it goes nowhere the shares do not
 * add up to the money that actually left the account - which is the same
 * failure the category split exists to avoid, one decimal place down.
 *
 * So every mode routes through `distribute`, which floors each share and
 * hands the leftover cents out one at a time from the top. The result always
 * sums to the total, exactly, in every mode.
 */

/** @param {number} n */
const round2 = (n) => Math.round(n * 100) / 100
/** @param {number} n */
const cents = (n) => Math.round(n * 100)

/** The modes, in the order they are offered. */
export const SPLIT_MODES = [
  { value: 'equal',   label: 'Evenly',  hint: 'Same share each' },
  { value: 'exact',   label: 'Exact',   hint: 'Type each amount' },
  { value: 'percent', label: '%',       hint: 'Percent each' },
  { value: 'shares',  label: 'Shares',  hint: 'Proportional, by portions' },
  { value: 'adjust',  label: '+/−',     hint: 'Even, plus extras' },
]

/**
 * Split `totalCents` across `weights`, losing nothing.
 *
 * Floors every share, then gives the remaining cents out one each from the
 * start. That bias is deliberate and documented rather than random: a
 * predictable extra centavo on the first row is auditable, where scattering
 * them makes the same bill produce different numbers on different days.
 *
 * @param {number} totalCents
 * @param {number[]} weights  any non-negative scale; only ratios matter
 * @returns {number[]} cents, summing exactly to totalCents
 */
export function distribute(totalCents, weights) {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (!(sum > 0)) return weights.map(() => 0)
  const raw = weights.map(w => (totalCents * w) / sum)
  const out = raw.map(Math.floor)
  let left = totalCents - out.reduce((s, n) => s + n, 0)
  for (let i = 0; left > 0 && i < out.length; i++, left--) out[i] += 1
  return out
}

/**
 * Resolve one division into exact pesos per participant.
 *
 * `participants` are everyone sharing the bill INCLUDING you, because every
 * mode needs to know how many heads there are. You are `{ id: 'you' }`, and
 * your share is simply your row - it is not the remainder any more, because
 * in exact and percent mode you are one of the figures being typed.
 *
 * `value` means whatever the mode says it means: pesos, a percent, a count of
 * shares, or a plus-or-minus adjustment.
 *
 * @param {object} input
 * @param {string} input.mode
 * @param {number} input.total
 * @param {Array<{id: string, included?: boolean, value?: number}>} input.participants
 * @returns {{shares: Record<string, number>, valid: boolean, message: string|null,
 *            allocated: number, remaining: number}}
 */
export function resolveSplit({ mode, total, participants }) {
  const live = participants.filter(p => p.included !== false)
  const T = cents(total)

  /** @param {number[]} weights */
  const byWeight = (weights) => {
    const got = distribute(T, weights)
    /** @type {Record<string, number>} */
    const shares = {}
    live.forEach((p, i) => { shares[p.id] = got[i] / 100 })
    return shares
  }

  const nobody = { shares: {}, valid: false, allocated: 0, remaining: total }

  if (!(total > 0)) return { ...nobody, message: 'Add an amount first' }
  if (live.length === 0) return { ...nobody, message: 'Nobody is sharing this' }

  if (mode === 'equal') {
    return {
      shares: byWeight(live.map(() => 1)),
      valid: true, message: null, allocated: total, remaining: 0,
    }
  }

  if (mode === 'shares') {
    const w = live.map(p => Math.max(0, p.value ?? 0))
    if (w.reduce((s, n) => s + n, 0) <= 0) {
      return { ...nobody, message: 'Give at least one person a share' }
    }
    return { shares: byWeight(w), valid: true, message: null, allocated: total, remaining: 0 }
  }

  if (mode === 'exact') {
    /** @type {Record<string, number>} */
    const shares = {}
    let sum = 0
    for (const p of live) {
      const v = round2(p.value ?? 0)
      shares[p.id] = v
      sum = round2(sum + v)
    }
    const remaining = round2(total - sum)
    return {
      shares,
      valid: Math.abs(remaining) < 0.005,
      message: remaining > 0 ? `${remaining.toFixed(2)} left to assign`
             : remaining < 0 ? `${Math.abs(remaining).toFixed(2)} over`
             : null,
      allocated: sum, remaining,
    }
  }

  if (mode === 'percent') {
    const pct = live.map(p => Math.max(0, p.value ?? 0))
    const sum = round2(pct.reduce((s, n) => s + n, 0))
    if (Math.abs(sum - 100) >= 0.005) {
      return {
        shares: {}, valid: false,
        message: sum < 100 ? `${round2(100 - sum)}% left` : `${round2(sum - 100)}% over`,
        allocated: round2((total * sum) / 100), remaining: round2(total - (total * sum) / 100),
      }
    }
    /* Weighted rather than multiplied out: 33.33% of 100 three times is
       99.99, and distribute is what makes the cents land. */
    return { shares: byWeight(pct), valid: true, message: null, allocated: total, remaining: 0 }
  }

  if (mode === 'adjust') {
    /* Extras come off the top, the rest is split evenly, then the extras go
       back on. That is what "same each, except I had the dessert" means. */
    const extra = live.map(p => round2(p.value ?? 0))
    const extraTotal = round2(extra.reduce((s, n) => s + n, 0))
    const base = round2(total - extraTotal)
    if (base < -0.005) {
      return {
        shares: {}, valid: false,
        message: `Extras come to more than ${total.toFixed(2)}`,
        allocated: extraTotal, remaining: base,
      }
    }
    const baseCents = distribute(cents(base), live.map(() => 1))
    /** @type {Record<string, number>} */
    const shares = {}
    live.forEach((p, i) => { shares[p.id] = round2(baseCents[i] / 100 + extra[i]) })
    return { shares, valid: true, message: null, allocated: total, remaining: 0 }
  }

  return { ...nobody, message: 'Unknown split' }
}

/**
 * What each mode's per-row input is called and shaped like.
 *
 * Here rather than in the component so the labels and the arithmetic cannot
 * drift apart - a field labelled "%" that feeds the shares branch is the kind
 * of bug nobody spots by reading either file on its own.
 */
export const MODE_FIELD = {
  equal:   { kind: 'none' },
  exact:   { kind: 'money',   prefix: '₱', placeholder: '0.00' },
  percent: { kind: 'number',  suffix: '%', placeholder: '0' },
  shares:  { kind: 'integer', suffix: '×', placeholder: '1' },
  adjust:  { kind: 'money',   prefix: '+₱', placeholder: '0.00' },
}
