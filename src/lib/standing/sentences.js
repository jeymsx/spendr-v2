import {
  acct, arrow, cat, date, dotfig, fig, list, pace, s, spark, split, text,
} from './tokens'
import {
  count, daysBetween, isoOf, moneyK, num, onDay, pct, shortDate, soft,
} from './format'

/**
 * Everything the note can say, as candidates: a sentence, what it is about
 * (its family - a note says one thing about the pace, not three), how much it
 * matters, and the figures it is made of. The composer (compose.js) picks
 * among them; nothing here picks, and nothing here prints a figure it was not
 * given or one that would read wrong - a builder that has not got what it
 * needs returns nothing.
 *
 * The voice: plain, warm, and short. A note is glanced at, so every sentence
 * is as few words as will do, with the figure doing the talking - "₱0 spent
 * today, with ₱937 a day left", not a paragraph about it. Never a scolding and
 * never a cheer: a sentence about money going well is as plain as one about it
 * going badly. No dashes in the middle of a thought, sentence case throughout,
 * like the rest of the app.
 *
 * Wherever there is more than one way to say it, ctx.pick chooses by the day,
 * so a note reads one way all day and another tomorrow.
 *
 * @typedef {import('./facts').StandingFacts} StandingFacts
 * @typedef {import('./metrics').Metrics} Metrics
 * @typedef {import('./level').Level} Level
 * @typedef {import('./tokens').Token} Token
 *
 * @typedef {object} Ctx
 * @property {StandingFacts} f
 * @property {Metrics} m
 * @property {Level} level
 * @property {Date} now
 * @property {string} month      "October"
 * @property {number} hour
 * @property {<T>(id: string, choices: T[]) => T} pick
 * @property {(n: number) => string} $   a whole amount
 *
 * @typedef {object} Candidate
 * @property {string} id
 * @property {'A'|'B'|'C'} beat
 * @property {string} family
 * @property {number} prio
 * @property {number} order
 * @property {Token[]} tokens
 * @property {'nudge'|'question'|'notice'|'win'} [kind]   what a closing line is
 * @property {number} [strength]                            how much a closing line is called for
 */

/** The colour of each pile of a net worth, shared by the bar and its legend. */
export const PILE = { spend: '#3b82f6', save: '#14b8a6', invest: '#8b5cf6', owed: '#f87171' }

/** A date as a chip: "today", "tomorrow", or "Oct 15". @param {Date} d @param {Date} now */
export function dateTok(d, now) {
  const n = daysBetween(now, d)
  return date(isoOf(d), n === 0 ? 'today' : n === 1 ? 'tomorrow' : shortDate(d))
}

/**
 * "today", "tomorrow" - or "on" and the date as a chip - for a day that is a point in a sentence.
 * @param {Date} d @param {Date} now
 * @returns {Token[]}
 */
function atDay(d, now) {
  return daysBetween(now, d) <= 1 ? [text(onDay(d, now))] : [text('on '), dateTok(d, now)]
}

/** A bill or card as its sentence wants it: the card's own face, a bill's name. @param {import('./facts').BillFact} b */
const whoOf = (b) => (b.kind === 'card' && b.account?.trim() ? acct(b.account.trim()) : fig(b.name?.trim() || 'A bill'))

/** Round down to the nearest 500, for a figure to move: "₱3,500", not "₱3,487". @param {number} n */
const round500 = (n) => Math.floor(n / 500) * 500

/** @param {Candidate[]} out @param {Partial<Candidate> & {id: string, beat: 'A'|'B'|'C', tokens: Token[]}} c */
function add(out, c) {
  out.push({ family: c.id, prio: 50, order: 0, ...c })
}

// ── A: where you stand ─────────────────────────────────────────────────────────

/** @param {Ctx} c @returns {Candidate[]} */
export function candidatesA(c) {
  const { f, m, $, pick, now } = c
  /** @type {Candidate[]} */
  const out = []
  const plan = f.plan
  const t = m.spentToday

  // Today and what is left to spend: one line, the one that is different every day.
  if (m.hasBudget && m.remaining > 0) {
    const a = m.allowance ?? 0
    /** @type {Token[]} */
    let tokens
    if (m.daysLeft === 1) {
      tokens = s`Last day of ${c.month}, with ${fig($(m.remaining))} left.`
    } else if (t < 0.5) {
      tokens = c.hour >= 20
        ? pick('daily0', [
          s`Nothing spent today, with ${fig($(a))} a day left.`,
          s`${fig($(0))} today, with ${fig($(a))} a day left to spend.`,
          s`${fig($(a))} a day left, and nothing spent today.`,
        ])
        : pick('daily0', [
          s`${fig($(0))} spent today, with ${fig($(a))} a day left to spend.`,
          s`Nothing spent today so far, and ${fig($(a))} a day left.`,
          s`${fig($(a))} a day left to spend, and nothing yet today.`,
        ])
    } else if (t <= a) {
      tokens = s`${fig($(t))} spent today, with ${fig($(a))} a day left to spend.`
    } else {
      tokens = s`${fig($(t), 'warn')} spent today, more than your ${fig($(a))} a day.`
    }
    add(out, { id: 'daily', beat: 'A', prio: 90, order: 1, tokens })
  } else if (m.hasBudget) {
    add(out, {
      id: 'over', beat: 'A', family: 'daily', prio: 95, order: 1,
      tokens: Math.round(-m.remaining) <= 0 ? s`This month's budget is used up.` : s`You're ${fig($(-m.remaining), 'bad')} past this month's budget.`,
    })
  } else {
    add(out, {
      id: 'daily', beat: 'A', prio: 70, order: 1,
      tokens: t < 0.5 ? s`Nothing spent today so far.` : s`${fig($(t))} spent today.`,
    })
  }

  if (!m.hasBudget && m.spent > 0 && m.day >= 3) {
    add(out, { id: 'sofar', beat: 'A', prio: 60, order: 1.5, tokens: s`${fig($(m.spent))} this month, about ${fig($(m.spent / m.day))} a day.` })
  }

  // What the cash allows until the next pay - when it is the tighter limit, or the only one.
  if (plan && plan.safe != null && plan.safe > 0) {
    const tighter = m.hasBudget && m.remaining > 0 && plan.safe < m.remaining * 0.9
    if (!m.hasBudget || tighter) {
      const until = plan.payDate ? s` until payday ${dateTok(plan.payDate, now)}` : s` over the next two weeks`
      add(out, {
        id: 'safe', beat: 'A', family: 'cash', prio: tighter ? 92 : 75, order: 2,
        tokens: tighter
          ? s`Only ${fig($(plan.safe), 'warn')} is safe to spend${until}.`
          : s`${fig($(plan.safe))} is safe to spend${until}.`,
      })
    }
  }

  // Net worth, and what it is made of.
  const w = f.worth
  if (w && Number.isFinite(w.total)) {
    const piles = [
      { v: num(w.spending), color: PILE.spend, label: 'spend' },
      { v: num(w.savings), color: PILE.save, label: 'saved' },
      { v: num(w.invested), color: PILE.invest, label: 'invested' },
    ].filter(p => p.v > 0.5)
    const owed = Math.max(0, num(w.owed))
    // What is owed is shown when it is a real part of the picture, not a rounding error beside it.
    const showOwed = owed > Math.max(0.5, Math.abs(w.total) * 0.04)
    /** @type {Token[]} */
    let tokens
    if (w.total < -0.5) {
      tokens = s`You owe ${fig($(-w.total), 'bad')} more than you have.`
    } else if (Math.abs(w.total) <= 0.5) {
      tokens = s`Your net worth is at zero.`
    } else if (piles.length >= 2 || (piles.length === 1 && showOwed)) {
      const legend = list([
        ...piles.map(p => [dotfig(moneyK(p.v, f.currency), p.color), text(` ${p.label}`)]),
        ...(showOwed ? [[dotfig(moneyK(owed, f.currency), PILE.owed), text(' owed')]] : []),
      ])
      const bar = split([...piles.map(p => ({ v: p.v, color: p.color })), ...(showOwed ? [{ v: owed, color: PILE.owed }] : [])])
      tokens = s`Net worth ${fig($(w.total))} ${bar}: ${legend}.`
    } else {
      tokens = s`Net worth ${fig($(w.total))}.`
    }
    add(out, { id: 'worth', beat: 'A', prio: 80, order: 3, tokens })
  }

  return out
}

// ── B: what it means ───────────────────────────────────────────────────────────

/** @param {Ctx} c @returns {Candidate[]} */
export function candidatesB(c) {
  const { f, m, $, pick, now } = c
  /** @type {Candidate[]} */
  const out = []
  const plan = f.plan
  const mo = f.month

  // ── Calendar: the turn of the month ──
  if (m.monthStart && f.last?.spent != null && f.last.label && m.hasBudget) {
    const under = m.budgetTotal - f.last.spent
    add(out, {
      id: 'lastMonth', beat: 'B', family: 'calendar', prio: 86,
      tokens: Math.abs(under) < 1
        ? s`${f.last.label} ended right on budget.`
        : under > 0
          ? s`${f.last.label} ended ${fig($(under), 'good')} under budget.`
          : s`${f.last.label} ended ${fig($(-under), 'warn')} over budget.`,
    })
  }
  if (m.monthStart && m.hasBudget && m.spent < m.budgetTotal * 0.1) {
    add(out, {
      id: 'fresh-month', beat: 'B', family: 'calendar2', prio: 84,
      tokens: s`${fig($(m.budgetTotal))} to spend this month, about ${fig($(m.budgetTotal / m.days))} a day.`,
    })
  }
  if (m.monthEnd && m.hasBudget) {
    add(out, {
      id: 'month-end', beat: 'B', family: 'calendar', prio: 86,
      tokens: m.remaining > 0
        ? s`${count(m.daysLeft, 'day')} left, with ${fig($(m.remaining), 'good')} still in the budget.`
        : s`${count(m.daysLeft, 'day')} left, and the budget is ${fig($(-m.remaining), 'bad')} over.`,
    })
  }

  // ── Urgent: money that is about to be short, or a bill that will not wait ──
  if (plan?.shortOn) {
    add(out, { id: 'short', beat: 'B', family: 'urgent', prio: 100, tokens: s`Cash runs out ${atDay(plan.shortOn, now)} if nothing changes.` })
  }
  const late = m.bills.find(b => b.overdue)
  if (late) {
    add(out, { id: 'overdue', beat: 'B', family: 'urgent2', prio: 96, tokens: s`${whoOf(late)} ${fig($(late.amount))} was due ${dateTok(late.date, now)}.` })
  } else if (m.dueSoon) {
    const b = m.dueSoon
    add(out, { id: 'due-soon', beat: 'B', family: 'urgent2', prio: 94, tokens: s`${whoOf(b)} ${fig($(b.amount))} is due ${onDay(b.date, now)}.` })
  }
  if (plan?.belowFloorOn && !plan.shortOn) {
    add(out, { id: 'floor', beat: 'B', family: 'urgent', prio: 88, tokens: s`You'd dip under your ${fig($(plan.floor))} floor ${atDay(plan.belowFloorOn, now)}.` })
  }

  // ── Pace: the month against the budget ──
  if (m.paceGap != null && m.hasBudget && m.budgetSpent > 0) {
    const gap = m.paceGap
    // The bar says what the sentence says: judged without the bill that is already paid, when there is one.
    const tone = gap >= 20 ? 'bad' : gap >= 10 ? 'warn' : gap <= -10 ? 'good' : null
    const bar = pace(m.usedPct, m.elapsedPct, tone)
    const used = pct(m.usedPct)
    const el = pct(m.elapsedPct)
    /** @type {Token[]} */
    let tokens
    if (m.anchor && m.flexUsedPct != null) {
      const flex = m.flexUsedPct
      tokens = flex - m.elapsedPct <= 3
        ? s`${fig(used)} ${bar} of the budget is gone, but only ${fig(pct(flex))} without ${cat(m.anchor.name)}.`
        : s`${fig(used)} ${bar} of the budget is gone, and ${fig(pct(flex), tone)} without ${cat(m.anchor.name)}.`
    } else if (gap <= -10) {
      tokens = s`Only ${fig(used, 'good')} ${bar} of the budget is gone, with ${fig(el)} of the month.`
    } else {
      tokens = s`${fig(used, gap >= 12 ? tone : null)} ${bar} of the budget is gone, ${fig(el)} of the month.`
    }
    add(out, { id: 'pace', beat: 'B', family: 'pace', prio: 82, tokens })
  }

  // ── Against last month ──
  if (m.vsPrev != null && m.spent > 0) {
    const v = m.vsPrev
    if (v >= 10) {
      add(out, { id: 'vs-prev', beat: 'B', family: 'prev', prio: 66, tokens: s`Spending is ${arrow('up', 'bad')}${fig(pct(v), 'bad')} vs this time last month.` })
    } else if (v <= -10) {
      add(out, { id: 'vs-prev', beat: 'B', family: 'prev', prio: 66, tokens: s`Spending is ${arrow('down', 'good')}${fig(pct(-v), 'good')} vs this time last month.` })
    } else {
      add(out, { id: 'vs-prev', beat: 'B', family: 'prev', prio: 30, tokens: s`Spending is about the same as this time last month.` })
    }
  }

  // ── Categories ──
  {
    const full = m.fullCats
    if (full.length >= 2) {
      add(out, { id: 'cat-full', beat: 'B', family: 'cat', prio: 76, tokens: s`${cat(full[0].name)} and ${cat(full[1].name)} are over their limits.` })
    } else if (full.length === 1) {
      const r = full[0]
      add(out, { id: 'cat-full', beat: 'B', family: 'cat', prio: 76, tokens: s`${cat(r.name)} is ${fig($(r.spent - r.budget), 'bad')} over its limit.` })
    } else if (m.closeCat && m.closeCat.ratio * 100 >= m.elapsedPct + 15) {
      const r = m.closeCat
      add(out, {
        id: 'cat-close', beat: 'B', family: 'cat', prio: 62,
        tokens: pick('cat-close', [
          s`${cat(r.name)} stands out: ${fig(pct(r.ratio * 100), 'warn')} of its budget.`,
          s`${cat(r.name)} is at ${fig(pct(r.ratio * 100), 'warn')} of its budget.`,
        ]),
      })
    } else if (!m.hasBudget && mo?.byCategory?.[0] && m.spent > 0 && m.day >= 3) {
      const top = mo.byCategory[0]
      const share = (top.value / m.spent) * 100
      if (share >= 30) {
        add(out, { id: 'cat-top', beat: 'B', family: 'cat', prio: 48, tokens: s`Most went to ${cat(top.name)}: ${fig(pct(share))}.` })
      }
    }
  }

  // ── What is coming: the bills, and the pay that follows them ──
  const payDate = plan?.payDate && daysBetween(now, plan.payDate) >= 0 ? plan.payDate : null
  const payName = soft(plan?.payName ?? 'pay')
  const payAmount = plan?.payAmount != null && plan.payAmount > 0 ? plan.payAmount : null
  if (payDate) {
    const n = daysBetween(now, payDate)
    /** @param {string} lead "Your" at the start of a sentence, "your" inside one */
    const lands = (lead) => (payAmount != null
      ? s`${lead} ${fig($(payAmount))} ${payName} lands ${dateTok(payDate, now)}`
      : s`${lead} next pay is ${dateTok(payDate, now)}`)
    if (n === 0) {
      add(out, { id: 'ahead', beat: 'B', family: 'ahead', prio: 90, tokens: payAmount != null ? s`Your ${fig($(payAmount))} ${payName} lands today.` : s`Your next pay is today.` })
    } else if (m.bills.length >= 1 && !m.dueSoon) {
      add(out, { id: 'ahead', beat: 'B', family: 'ahead', prio: 70, tokens: s`${fig($(m.billsTotal))} in bills coming, then ${lands('your')}.` })
    } else {
      add(out, { id: 'ahead', beat: 'B', family: 'ahead', prio: 64, tokens: s`${lands('Your')}.` })
    }
  } else if (m.bills.length >= 2) {
    const first = m.bills[0]
    add(out, { id: 'ahead', beat: 'B', family: 'ahead', prio: 70, tokens: s`${fig($(m.billsTotal))} in bills coming up, ${whoOf(first)} first.` })
  } else if (m.bills.length === 1 && !m.dueSoon) {
    const b = m.bills[0]
    add(out, { id: 'ahead', beat: 'B', family: 'ahead', prio: 68, tokens: s`${whoOf(b)} ${fig($(b.amount))} is due ${onDay(b.date, now)}.` })
  } else if (m.earned > 0) {
    add(out, { id: 'income', beat: 'B', family: 'ahead', prio: 40, tokens: s`${fig($(m.earned))} came in this month.` })
  } else if (m.bills.length === 0 && plan && c.level.id !== 'fresh') {
    add(out, { id: 'ahead', beat: 'B', family: 'ahead', prio: 20, tokens: s`Nothing is due in the next two weeks.` })
  }

  // ── In against out ──
  if (m.day >= 3 && (m.spent > 0 || m.earned > 0)) {
    if (m.net < -0.5 && m.earned > 0) {
      add(out, { id: 'net', beat: 'B', family: 'net', prio: 55, tokens: s`${fig($(-m.net), 'warn')} more out than in this month.` })
    } else if (m.net < -0.5 && m.earned === 0) {
      add(out, { id: 'net', beat: 'B', family: 'net', prio: 52, tokens: s`Nothing has come in yet this month.` })
    } else if (m.net > 0.5 && m.spent > 0) {
      add(out, { id: 'net', beat: 'B', family: 'net', prio: 54, tokens: s`${fig($(m.net), 'good')} more in than out this month.` })
    }
  }

  // ── Cards, goals, people ──
  const hot = (f.cards ?? [])
    .filter(k => k.limit != null && k.limit > 0 && k.owed / k.limit >= 0.5)
    .sort((a, b) => b.owed / (b.limit ?? 1) - a.owed / (a.limit ?? 1))[0]
  if (hot && hot.limit) {
    add(out, { id: 'card', beat: 'B', family: 'card', prio: 50, tokens: s`${acct(hot.name)} is ${fig(pct((hot.owed / hot.limit) * 100), 'warn')} used.` })
  }
  if (f.goal && f.goal.target > 0 && f.goal.pct < 100) {
    add(out, { id: 'goal', beat: 'B', family: 'goal', prio: 45, tokens: s`${fig(f.goal.name?.trim() || 'Your goal')} is ${fig(pct(f.goal.pct), 'good')} funded.` })
  }
  if (f.worth && f.worth.owedToYou >= 1) {
    add(out, { id: 'people', beat: 'B', family: 'people', prio: 28, tokens: s`People owe you ${fig($(f.worth.owedToYou))}.` })
  }

  // ── Net worth's move ──
  if (f.worth && f.worth.changeMonth != null && Math.abs(f.worth.changeMonth) >= 1) {
    const ch = f.worth.changeMonth
    add(out, {
      id: 'worth-move', beat: 'B', family: 'worthmove', prio: 50,
      tokens: ch > 0
        ? s`Net worth is ${arrow('up', 'good')}${fig($(ch), 'good')} since the 1st.`
        : s`Net worth is ${arrow('down', 'warn')}${fig($(-ch), 'warn')} since the 1st.`,
    })
  }

  // ── A quiet month, and the last seven days ──
  if (m.spent === 0 && m.day >= 2) {
    add(out, { id: 'quiet', beat: 'B', family: 'quiet', prio: 58, tokens: s`Nothing spent this month yet.` })
  }
  const week = mo?.last7 ?? []
  if (week.length >= 5 && week.some(v => v > 0)) {
    const sum = week.reduce((t, v) => t + num(v), 0)
    add(out, { id: 'week', beat: 'B', family: 'week', prio: 38, tokens: s`${fig($(sum))} over the last ${week.length} days ${spark(week.map(v => num(v)))}.` })
  }

  return out
}

// ── C: the last line ───────────────────────────────────────────────────────────

const GENERIC_QUESTIONS = [
  'What do you want this month to pay for?',
  'Any bill worth a second look this week?',
  'What would make this a good money week?',
  "Anything you'd rather not be spending on?",
]

/** @param {Ctx} c @returns {Candidate[]} */
export function candidatesC(c) {
  const { f, m, level, $, pick, now } = c
  /** @type {Candidate[]} */
  const out = []
  /** @param {string} id @param {'nudge'|'question'|'notice'|'win'} kind @param {number} strength @param {Token[]} tokens */
  const put = (id, kind, strength, tokens) => add(out, { id, beat: 'C', family: id, kind, strength, tokens })

  // ── Nudges: something to do ──
  if (m.dueSoon) {
    const b = m.dueSoon
    const days = daysBetween(now, b.date)
    const strength = b.overdue ? 8 : days <= 1 ? 7 : 5
    put('n-due', 'nudge', strength, b.overdue
      ? s`Pay ${whoOf(b)} today if you can.`
      : b.kind === 'card'
        ? s`Pay ${whoOf(b)} ${onDay(b.date, now)} and that ${fig($(b.amount))} is done.`
        : s`Set ${fig($(b.amount))} aside for ${whoOf(b)} ${onDay(b.date, now)}.`)
  }
  if (level.id === 'short') {
    put('n-hold', 'nudge', 9, s`Hold off on anything big until payday.`)
  } else if (level.id === 'tight') {
    put('n-hold', 'nudge', 6, pick('n-hold', [s`Keep it to the essentials for now.`, s`Go easy until payday.`]))
  }
  if (m.hasBudget && m.remaining < 0 && m.daysLeft > 1) {
    put('n-over', 'nudge', 6, s`Hold the extras, or move some budget across.`)
  }
  const watch = m.fullCats.find(r => r.name !== m.anchor?.name)
  if (watch) {
    put('n-full', 'nudge', 4.5, s`More on ${cat(watch.name)} has to come out of something else.`)
  } else if (m.closeCat && m.closeCat.ratio * 100 >= m.elapsedPct + 15) {
    const r = m.closeCat
    put('n-watch', 'nudge', 4, s`${cat(r.name)} has ${fig($(r.budget - r.spent))} left. Watch that one.`)
  }
  if (level.id === 'ahead' && m.cushion != null && m.cushion >= 500) {
    const room = round500(m.cushion)
    if (room >= 500) {
      put('n-move', 'nudge', 4, f.goal && f.goal.pct < 100
        ? s`Room to put ${fig($(room))} toward ${fig(f.goal.name?.trim() || 'your goal')}.`
        : s`Room to move ${fig($(room))} to savings.`)
    }
  }
  if (m.payToday) {
    put('n-payday', 'nudge', 8, m.billsTotal > 0
      ? s`Payday. Set aside ${fig($(m.billsTotal))} for bills, and the rest is yours.`
      : s`Payday. Pay yourself first.`)
  }
  if (c.hour >= 19 && f.loggedToday === 0 && (f.txCount ?? 0) >= 5) {
    put('n-log', 'nudge', 2, s`Anything unlogged today?`)
  }
  if (level.id === 'fresh') {
    put('n-fresh', 'nudge', 10, (f.txCount ?? 0) === 0
      ? s`Hold the + and log your first one.`
      : s`Log a few more days and this starts reading your month.`)
  }
  put('n-steady', 'nudge', 0.5, pick('n-steady', [
    s`Small, steady choices move this number.`,
    s`Check back tomorrow for a fresh read.`,
  ]))

  // ── Questions: something to think about ──
  const buy = f.month?.biggestBuy
  const flexBudget = m.anchor ? m.budgetTotal - m.anchor.budget : m.budgetTotal
  if (buy && buy.name?.trim() && buy.amount > 0 && ((m.allowance != null && buy.amount >= m.allowance * 2.5) || (flexBudget > 0 && buy.amount >= flexBudget * 0.08))) {
    put('q-worth', 'question', 3.5, s`Was ${fig($(buy.amount))} on ${fig(buy.name.trim())} worth it?`)
  }
  if (f.goal && f.goal.pct < 100) {
    put('q-goal', 'question', 2.5, s`What would reaching ${fig(f.goal.name?.trim() || 'your goal')} change?`)
  }
  put('q-generic', 'question', 2, s`${pick('q-generic', GENERIC_QUESTIONS)}`)

  // ── Notices: something true about you ──
  const wd = f.month?.weekday
  if (wd?.name?.trim() && wd.rank === 'quiet') put('o-weekday', 'notice', 3, s`${fig(wd.name)} are usually your quietest day.`)
  else if (wd?.name?.trim() && wd.rank === 'busy') put('o-weekday', 'notice', 3, s`${fig(wd.name)} tend to be your biggest spending day.`)
  const big = f.month?.biggestDay
  if (big && big.label?.trim() && big.amount > 0 && m.day >= 4) {
    put('o-biggest', 'notice', 2, s`Biggest day so far: ${fig(big.label)}, ${fig($(big.amount))}.`)
  }

  // ── Wins: something that went well ──
  const run = f.month?.quietRun ?? 0
  if (run >= 3 || (run >= 2 && c.hour >= 18)) {
    put('w-streak', 'win', run >= 3 ? 5 : 4, s`${fig(count(run, 'day'), 'good')} in a row with nothing spent.`)
  }
  if (level.id === 'ahead' && m.cushion != null && m.cushion >= 300) {
    put('w-under', 'win', 5, s`You're ${fig($(m.cushion), 'good')} under pace. Nice.`)
  }
  if (m.monthStart && f.last?.spent != null && f.last.label && m.hasBudget && m.budgetTotal - f.last.spent > 0) {
    put('w-last', 'win', 4.5, s`${f.last.label} finished ${fig($(m.budgetTotal - f.last.spent), 'good')} under budget. Nice.`)
  }
  if (f.worth && f.worth.changeMonth != null && f.worth.total > 0 && f.worth.changeMonth >= f.worth.total * 0.01 && m.day >= 5) {
    put('w-worth', 'win', 3.5, s`Net worth is up ${fig($(f.worth.changeMonth), 'good')} this month.`)
  }
  if (m.hasBudget && m.fullCats.length === 0 && m.day >= 12) {
    put('w-clean', 'win', 3, s`Every category is inside its limit.`)
  }
  if (f.goal && f.goal.pct >= 100) {
    put('w-goal', 'win', 5, s`${fig(f.goal.name?.trim() || 'Your goal')} is fully funded.`)
  }

  return out
}

// ── A new ledger ───────────────────────────────────────────────────────────────

/**
 * Not enough logged to read anything: say so kindly, and say what to do.
 *
 * @param {Ctx} c
 * @returns {{a: Candidate[], b: Candidate[]}}
 */
export function candidatesFresh(c) {
  const { f, $ } = c
  /** @type {Candidate[]} */
  const a = []
  /** @type {Candidate[]} */
  const b = []
  add(a, {
    id: 'fresh-hello', beat: 'A', prio: 100, order: 1,
    tokens: (f.txCount ?? 0) === 0 ? s`Nothing to read yet, and that's fine.` : s`Not quite enough to read yet.`,
  })
  const w = f.worth
  if (w && w.total > 0.5) {
    add(a, { id: 'worth', beat: 'A', prio: 80, order: 3, tokens: s`Your accounts add up to ${fig($(w.total))}.` })
  }
  add(b, { id: 'fresh-how', beat: 'B', prio: 60, tokens: s`Every expense you log fills in your month.` })
  return { a, b }
}
