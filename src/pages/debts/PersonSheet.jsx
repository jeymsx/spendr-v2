import { useEffect, useMemo, useState } from 'react'
import db from '../../db/db'
import { settleWithPerson } from '../../db/txHelpers'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useToast } from '../../context/ToastContext'
import Sheet from '../../components/ui/Sheet'
import Button from '../../components/ui/Button'
import Divider from '../../components/ui/Divider'
import AmountHero from '../../components/ui/AmountHero'
import AmountInput from '../../components/ui/AmountInput'
import AccountPickerSheet, { AccountChip } from '../../components/AccountPickerSheet'
import { IconChevronRight } from '../../components/icons'
import { parseMoney, numToMoneyStr, moneyChangeHandler } from '../../utils/moneyInput'
import { getInitials, getAvatarColor } from './shared'
import { outstanding, isSettled } from '../../lib/people'
import { fmt } from '../../lib/money'

/**
 * One person: what they come to, what it is made of, and settling up.
 *
 * ── Why paying is not "pick a debt" ──
 *
 * Handing somebody money is one gesture, and the row it belongs to is a
 * question the money does not have an answer to. Gelo gives you 500 that
 * covers two old loans with a bit left over; Gelo gives you 175 for a bill
 * that has not posted yet and it covers nothing at all. Both are just money
 * arriving.
 *
 * So the amount goes against the PERSON. db/txHelpers.settleWithPerson spreads
 * it oldest-first and turns whatever is left into credit, which the next
 * charge nets against on its own - which is what makes paying early stop being
 * a special case.
 *
 * ── The direction is theirs, not a setting ──
 *
 * A positive balance means they owe you, so the button collects. A negative
 * one means you owe them, so it pays. Nobody has to choose, and there is no
 * way to record it backwards.
 */
export default function PersonSheet({ person, onClose, onEditRow }) {
  const open = !!person
  const { showToast } = useToast()
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])

  const [amountStr, setAmountStr] = useState('')
  const [account, setAccount] = useState(/** @type {any} */ (null))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const net = person?.net ?? 0
  const theyOwe = net > 0.005
  const youOwe = net < -0.005
  const square = !theyOwe && !youOwe

  /* Anything that can hold money. A card cannot: settling up with a friend
     moves cash, and a credit account would record it as borrowing. */
  const usable = useMemo(
    () => accounts.filter(a => a.type !== 'credit'), [accounts])

  /* Opened at the full balance - and reset on OPEN, not whenever a dependency
     moves. This used to depend on `usable`, which is derived from a live
     query, so it changed identity every time anything touched the accounts
     table. Harmless while the figure was rendered text; the moment it became
     a field, a sync landing mid-edit put the full balance back under the
     cursor and the part payment you were typing was gone. */
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAmountStr(Math.abs(net) > 0.005 ? numToMoneyStr(Math.abs(net)) : '')
    setPickerOpen(false)
    // Deliberately not [net]: reopening for the same person should not
    // rewrite a figure they are part-way through changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person?.key])

  /* The account is chosen separately, because it arrives asynchronously and
     may well be an empty list at the moment the sheet opens. */
  useEffect(() => {
    if (!open || account) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccount([...usable].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))[0] ?? null)
  }, [open, account, usable])

  const amount = parseMoney(amountStr)
  const ready = amount > 0 && !!account && !saving && !square

  const rows = useMemo(() => [...(person?.rows ?? [])].sort(
    (a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))), [person])

  async function handleSettle() {
    setSaving(true)
    try {
      const { credit } = await settleWithPerson({
        person: person.label,
        rows: person.rows,
        amount,
        account: account.name,
        direction: theyOwe ? 'owed_to_me' : 'i_owe',
        /* Refund the category the money left from when every open row agrees
           on one. Mixed sources have no single category to credit, so it
           falls back to an ordinary inflow. */
        category: onlyCategory(person.rows),
        sourceTxId: onlySource(person.rows),
      })
      showToast(credit > 0.005
        ? `${fmt(amount)} recorded · ${fmt(credit)} ahead`
        : `${fmt(amount)} recorded`)
      onClose()
    } catch (e) {
      console.error('[PersonSheet] settle failed:', e)
      showToast(/** @type {any} */ (e)?.message ?? 'Could not record that', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        z={120}
        scrim={55}
        dismissible={!saving}
        ariaLabel={person ? `${person.label}, ${fmt(Math.abs(net))}` : 'Person'}
      >
        <div className="pb-1">
          <div className="flex flex-col items-center">
            <span
              className="w-14 h-14 rounded-full flex items-center justify-center
                text-15 font-bold text-white"
              style={{ background: getAvatarColor(person?.label ?? '') }}
              aria-hidden="true"
            >
              {getInitials(person?.label ?? '')}
            </span>
            <h3 className="mt-2 text-17 font-semibold text-slate-900 dark:text-white">
              {person?.label}
            </h3>
            <p className="text-12 text-slate-400 dark:text-slate-500">
              {square ? 'All square' : theyOwe ? 'Owes you' : 'You owe them'}
            </p>
          </div>

          {/* ── How much, and it is a field ──
              Opened at the whole balance, because settling in full is what
              most of these are. But part payments are the reason a balance
              exists at all - 100 off a 250 - and for a while this was a
              rendered figure rather than an input, which quietly made every
              settlement all-or-nothing. */}
          {!square && (
            <AmountHero
              color={theyOwe ? '#10b981' : '#f59e0b'}
              className="mt-4 mb-5"
            >
              <AmountInput
                value={amountStr}
                onChange={moneyChangeHandler(setAmountStr)}
                label={theyOwe ? 'Amount received' : 'Amount paid'}
                color={theyOwe ? '#10b981' : '#f59e0b'}
              />
            </AmountHero>
          )}

          {/* The balance is no longer on screen once the figure above became
              editable, so it is said here - and said as what is LEFT, which
              is the number you actually want after typing a part payment. */}
          {!square && amount > 0.005 && amount < Math.abs(net) - 0.005 && (
            <p className="-mt-3 mb-4 text-center text-12 text-slate-400 dark:text-slate-500">
              {fmt(Math.abs(net) - amount)} of {fmt(Math.abs(net))} still
              {' '}{theyOwe ? 'owed to you' : 'owed by you'} after this.
            </p>
          )}

          {/* What the number is made of. A balance you cannot see the parts
              of is a number you have to trust rather than check. */}
          <div className="mt-4 mb-5 max-h-[180px] overflow-y-auto no-scrollbar">
            {rows.map((d, i) => {
              const left = outstanding(d)
              const done = isSettled(d)
              return (
                <div key={d.id}>
                  {i > 0 && <Divider />}
                  <button
                    type="button"
                    onClick={() => onEditRow?.(d)}
                    className={`w-full flex items-center gap-3 py-2 text-left
                      active:opacity-60 transition-opacity ${done ? 'opacity-45' : ''}`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-13 font-medium text-slate-700 dark:text-slate-200 truncate">
                        {d.notes || d.name}
                      </span>
                      <span className="block text-10 text-slate-400 dark:text-slate-500">
                        {d.type === 'i_owe' ? 'You owe' : 'Owes you'}
                        {done ? ' · settled' : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-13 font-semibold tabular-nums
                      text-slate-700 dark:text-slate-200"
                    >
                      {fmt(done ? (d.amount ?? 0) : left)}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>

          {!square && (
            <>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="w-full flex items-center gap-3 mb-3 py-2 -mx-1 px-1 rounded-2xl
                  active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
              >
                {account ? <AccountChip acct={account} size="sm" /> : null}
                <span className="flex-1 min-w-0 text-left">
                  <span className="block text-11 text-slate-400 dark:text-slate-500">
                    {theyOwe ? 'Landing in' : 'Paying from'}
                  </span>
                  <span className="block text-14 font-semibold text-slate-800 dark:text-white truncate">
                    {account?.name ?? 'Choose an account'}
                  </span>
                </span>
                <span className="text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true">
                  <IconChevronRight />
                </span>
              </button>

              {amount > Math.abs(net) + 0.005 && (
                <p className="mb-2 text-11 text-slate-400 dark:text-slate-500">
                  {fmt(amount - Math.abs(net))} more than the balance, which
                  {' '}{theyOwe ? 'leaves them ahead' : 'leaves you ahead'} for next time.
                </p>
              )}
            </>
          )}

          <div className="mt-4 flex gap-2.5">
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
              Close
            </Button>
            <Button
              className="flex-[1.6]"
              onClick={handleSettle}
              disabled={!ready}
            >
              {saving ? 'Recording…'
                : square ? 'Nothing to settle'
                : theyOwe ? `Record ${fmt(amount)}`
                : `Pay ${fmt(amount)}`}
            </Button>
          </div>
        </div>
      </Sheet>

      <AccountPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        accounts={usable}
        selected={account}
        onSelect={setAccount}
      />
    </>
  )
}

/** The category every open row agrees on, or null when they disagree. */
function onlyCategory(rows) {
  const cats = new Set((rows ?? []).filter(d => !isSettled(d))
    .map(d => d.sourceCategory).filter(Boolean))
  return cats.size === 1 ? [...cats][0] : null
}

/** The purchase every open row points at, or null. */
function onlySource(rows) {
  const src = new Set((rows ?? []).filter(d => !isSettled(d))
    .map(d => d.sourceTxId).filter(Boolean))
  return src.size === 1 ? [...src][0] : null
}
