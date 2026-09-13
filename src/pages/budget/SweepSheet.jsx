import { useEffect, useMemo, useState } from 'react'
import Sheet from '../../components/ui/Sheet'
import Button from '../../components/ui/Button'
import Divider from '../../components/ui/Divider'
import CategoryGlyph from '../../components/CategoryGlyph'
import AccountPickerSheet, { AccountChip } from '../../components/AccountPickerSheet'
import { IconChevronRight } from '../../components/icons'
import { fmt } from '../../lib/money'

/**
 * Last month's leftovers, moved somewhere they count.
 *
 * ── Why this exists beside rollover, rather than instead of it ──
 *
 * Rollover keeps an underspend inside the budget: next month's Groceries
 * limit is bigger. That suits someone running envelopes. It does not suit
 * someone who wants a fresh limit every month and would rather the leftover
 * became savings, which is a different thing entirely - and the one people
 * usually mean when they say "if I did not spend it, I want to keep it".
 *
 * So the two are exclusive by construction: lib/rollover.js leaves a rolling
 * category out of `sweepable`, because its leftover has already been kept and
 * moving it again would move the same money twice.
 *
 * ── It moves real money ──
 *
 * A sweep is a transfer, not a number written into a budget. The leftover was
 * never a pot - it was money that stayed in your spending account - so the
 * only way to turn it into savings is to put it there. That also means it
 * shows up in the ledger, funds the goal through the same balances every
 * other goal reads, and can be undone by deleting one transaction.
 */
export default function SweepSheet({
  open, onClose, rows = [], total = 0, monthLabel, goals = [], accounts = [],
  onSweep, saving = false,
}) {
  const [goal, setGoal] = useState(/** @type {any} */ (null))
  const [from, setFrom] = useState(/** @type {any} */ (null))
  const [pickerOpen, setPickerOpen] = useState(false)

  /* A goal that names no funding account cannot receive anything, so it is
     not offered - picking it would be a dead end with no way to say why. */
  const fundable = useMemo(
    () => goals.filter(g => !g.archivedAt && (g.accounts ?? []).length > 0), [goals])

  const target = useMemo(() => {
    const name = (goal?.accounts ?? [])[0]
    return accounts.find(a => a.name === name) ?? null
  }, [goal, accounts])

  const spendable = useMemo(
    () => accounts.filter(a => a.type !== 'credit' && a.name !== target?.name), [accounts, target])

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGoal(fundable[0] ?? null)
    setFrom([...spendable].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))[0] ?? null)
    setPickerOpen(false)
  }, [open, fundable, spendable])

  const ready = !!goal && !!target && !!from && total > 0 && !saving && from.name !== target.name

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        z={130}
        scrim={55}
        dismissible={!saving}
        title="Keep what you did not spend"
        footer={(
          <div className="flex gap-2.5">
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
              Not this time
            </Button>
            <Button
              className="flex-[1.6]"
              onClick={() => onSweep({ amount: total, from, to: target, goal })}
              disabled={!ready}
            >
              {saving ? 'Moving…' : `Move ${fmt(total)}`}
            </Button>
          </div>
        )}
      >
        <div className="pb-1">
          <p className="text-13 leading-snug text-slate-500 dark:text-slate-400">
            You came in under on {rows.length} categor{rows.length === 1 ? 'y' : 'ies'} in
            {' '}{monthLabel}. Moving it puts the money somewhere it counts, instead of
            quietly becoming next month&apos;s spending.
          </p>

          <div className="mt-4 mb-5">
            {rows.map((r, i) => (
              <div key={r.name}>
                {i > 0 && <Divider />}
                <div className="flex items-center gap-3 py-2.5">
                  <span
                    className="cat-tile w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ '--cat-color': r.color ?? '#64748b' }}
                  >
                    <CategoryGlyph cat={r} size={15} />
                  </span>
                  <span className="flex-1 min-w-0 text-13 font-medium text-slate-700 dark:text-slate-200 truncate">
                    {r.name}
                  </span>
                  <span className="text-13 font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {fmt(r.left)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {fundable.length === 0 ? (
            <p className="text-12 text-amber-600 dark:text-amber-400">
              You need a goal with a funding account before this can go anywhere.
            </p>
          ) : (
            <>
              {/* One row per goal rather than a picker sheet: there are rarely
                  more than a handful, and a sheet over a sheet has no clear
                  way back. */}
              {fundable.map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGoal(g)}
                  className={[
                    'w-full flex items-center gap-3 py-2.5 px-3 -mx-1 mb-1 rounded-2xl text-left',
                    'transition-colors',
                    goal?.id === g.id
                      ? 'bg-primary/[0.08] dark:bg-primary/[0.14]'
                      : 'active:bg-slate-50 dark:active:bg-white/[0.04]',
                  ].join(' ')}
                >
                  <span className="text-18 shrink-0" aria-hidden="true">{g.icon ?? '🎯'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-14 font-semibold text-slate-800 dark:text-white truncate">
                      {g.name}
                    </span>
                    <span className="block text-11 text-slate-400 dark:text-slate-500 truncate">
                      Funded by {(g.accounts ?? []).join(', ')}
                    </span>
                  </span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="w-full flex items-center gap-3 mt-2 py-2 -mx-1 px-1 rounded-2xl
                  active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
              >
                {from ? <AccountChip acct={from} size="sm" /> : null}
                <span className="flex-1 min-w-0 text-left">
                  <span className="block text-11 text-slate-400 dark:text-slate-500">
                    Moving from
                  </span>
                  <span className="block text-14 font-semibold text-slate-800 dark:text-white truncate">
                    {from?.name ?? 'Choose an account'}
                  </span>
                </span>
                <span className="text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true">
                  <IconChevronRight />
                </span>
              </button>
            </>
          )}
        </div>
      </Sheet>

      <AccountPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        accounts={spendable}
        selected={from}
        onSelect={setFrom}
      />
    </>
  )
}
