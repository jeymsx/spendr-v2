import { useEffect, useRef, useState } from 'react'
import Sheet from '../../components/ui/Sheet'
import Button from '../../components/ui/Button'
import AmountHero from '../../components/ui/AmountHero'
import AmountInput from '../../components/ui/AmountInput'
import DetailRow from '../../components/ui/DetailRow'
import { parseMoney, numToMoneyStr } from '../../utils/moneyInput'
import { fmt } from '../../lib/money'
import { valuedAgo } from '../../lib/investments'

/** The accent, the colour a transfer is drawn in: a value update is a move
 *  that is neither income nor spending, and red or green would say it was. */
const VALUE_COLOR = 'var(--color-primary)'

/**
 * What an investment is worth now - typed from what the provider shows you.
 *
 * The same shape as paying a card from its page (CardPaymentSheet): the
 * figure is the subject and the input at once, the rows under it say what
 * will change, one button commits. It opens on the value it last had, so
 * "nothing moved" is one tap and still dates the figure.
 *
 * What it writes is the difference, marked so no total counts it as income
 * or spending - see db/accountWrites.js recordValue.
 */
export default function UpdateValueSheet({ open, onClose, account, status, onSave, saving = false }) {
  const [value, setValue] = useState('')
  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null))
  const current = account?.balance ?? 0

  // Hydrate on the way in - the sheet stays mounted through its exit.
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(current > 0 ? numToMoneyStr(current) : '')
  }, [open, current])

  const typed = parseMoney(value)
  const valid = Number.isFinite(typed) && typed >= 0 && value.trim() !== ''
  const delta = valid ? typed - current : 0

  /* Digits and one point - the raw string, so the caret stays put. The same
     rule CardPaymentSheet's hero uses. */
  const onChange = (/** @type {any} */ e) => {
    const v = String(e.target.value).replace(/[^0-9.]/g, '')
    const parts = v.split('.')
    setValue(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : v)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={120}
      scrim={55}
      dismissible={!saving}
      ariaLabel={`Update ${account?.name ?? 'value'}`}
      initialFocus={inputRef}
    >
      <div className="pb-1">
        <div className="text-center">
          <h3 className="text-17 font-semibold text-slate-900 dark:text-white">
            Update value
          </h3>
          <p className="mt-1 mx-auto max-w-[268px] text-13 leading-snug text-slate-400 dark:text-slate-500">
            What {account?.name} is worth today.<br />Not counted as income or spending.
          </p>
        </div>

        <AmountHero color={VALUE_COLOR} className="mt-5 mb-6">
          <AmountInput
            currency={account?.currency}
            ref={inputRef}
            value={value}
            onChange={onChange}
            label="Value today"
            color={VALUE_COLOR}
          />
        </AmountHero>

        <div className="flex flex-col mb-2">
          <DetailRow
            label="Last value"
            value={fmt(current, account?.currency)}
            sub={valuedAgo(status?.valuedAt ?? null)}
            padded={false}
            isLast
          />
          {valid && Math.abs(delta) >= 0.005 && (
            <DetailRow
              label="Change"
              value={`${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta), account?.currency)}`}
              padded={false}
              isLast
            />
          )}
        </div>

        <Button
          block
          className="mt-5"
          disabled={!valid || saving}
          loading={saving}
          onClick={() => onSave(typed)}
        >
          {valid && Math.abs(delta) < 0.005 ? 'Same as before' : 'Save value'}
        </Button>

        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="press press-fade active:opacity-60 w-full mt-3 py-2 text-13 font-semibold
            text-slate-500 dark:text-slate-400 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </Sheet>
  )
}
