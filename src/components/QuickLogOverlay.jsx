import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { quickParse, learnMerchants } from '../lib/quickParse'
import CategoryGlyph from './CategoryGlyph'
import { IconTick, IconWarning } from './icons'

const _php = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = (v) => '₱' + _php.format(Math.abs(v ?? 0))

const TYPE_COPY = {
  expense:  { verb: 'Expense',  to: '/expense'  },
  inflow:   { verb: 'Inflow',   to: '/inflow'   },
  transfer: { verb: 'Transfer', to: '/transfer' },
}

/** One thing the parser worked out, as a chip. */
function Chip({ children, tone = 'plain', title }) {
  return (
    <span
      title={title}
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium',
        tone === 'accent'
          ? 'bg-primary/[0.14] accent-ink'
          : 'bg-white/[0.08] text-slate-200 dark:text-slate-200',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

/**
 * Hold the + and type a transaction.
 *
 * The whole screen blurs behind one field, because this is a single-purpose
 * mode: you are typing one line and then leaving. A sheet would keep the page
 * behind it legible and invite you to read it, which is the opposite of what
 * a capture surface wants.
 *
 * It does NOT save. It parses, shows you what it understood, and hands the
 * result to the normal expense/inflow/transfer page with the fields filled in.
 * Two reasons: the parser is confident about amounts and much less so about
 * categories, so a silent save would file things wrong and you would never
 * notice; and the existing pages already handle overdraw, duplicates,
 * installments and confirmation, none of which is worth reimplementing here.
 */
export default function QuickLogOverlay({ onClose }) {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  const accounts   = useLiveQuery(() => db.accounts.toArray(), [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const txAll      = useLiveQuery(() => db.transactions.toArray(), [], [])

  /**
   * What this user files each merchant under, from their own ledger.
   *
   * Recomputed only when the transaction count changes rather than on every
   * keystroke - it is a full pass over the table, and the answer does not
   * change while you type.
   */
  const merchantMap = useMemo(
    () => learnMerchants(txAll ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txAll?.length],
  )

  const parsed = useMemo(
    () => quickParse(text, { accounts, categories, merchantMap }),
    [text, accounts, categories, merchantMap],
  )

  // Mounted only while open (AppLayout guards it), so the field starts empty
  // every time without a reset effect - which is what an `open` prop plus
  // `setText('')` on close was doing, at the cost of a setState inside an
  // effect body and one stale render of last time's text.
  useEffect(() => {
    // A frame's delay, or iOS opens the keyboard before the overlay has
    // painted and the field jumps.
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const go = useCallback(() => {
    const dest = TYPE_COPY[parsed.type] ?? TYPE_COPY.expense
    // Router state, not a query string: the payload holds names with spaces
    // and it has no business being visible or shareable.
    navigate(dest.to, { state: { prefill: parsed } })
    onClose()
  }, [parsed, navigate, onClose])

  const cat = (categories ?? []).find(c => c.name === parsed.category) ?? null
  const ready = parsed.amount != null
  const dest = TYPE_COPY[parsed.type] ?? TYPE_COPY.expense

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ touchAction: 'none' }}>
      {/* The blur IS the mode. Heavier than the sheets' backdrop, because
          nothing behind this needs to stay readable. */}
      <div
        className="sheet-overlay absolute inset-0 bg-black/65 backdrop-blur-2xl"
        onClick={onClose}
      />

      <div className="relative flex-1 flex flex-col justify-center px-6 pb-24">
        <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-white/50">
          Quick log
        </p>

        {/* One field, big. No label - the placeholder is the instruction and
            the preview below is the feedback. */}
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && ready) go() }}
          placeholder="150 jollibee"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Quick log"
          className="mt-4 w-full bg-transparent text-center outline-none
            text-[28px] font-semibold text-white
            placeholder-white/25"
        />

        <div className="mt-1 h-px bg-white/15" />

        {/* What it understood. Deliberately shows the TYPE first: getting an
            expense when you meant a transfer is the one mistake that is
            annoying to undo. */}
        <div className="mt-5 min-h-[76px] flex flex-wrap items-center justify-center gap-2">
          {!text.trim() ? (
            <p className="text-[13px] text-white/40 text-center leading-relaxed">
              Type an amount and what it was for.<br />
              Try “200 from maya savings to maya” or “42000 salary”.
            </p>
          ) : (
            <>
              <Chip tone="accent">{dest.verb}</Chip>
              {parsed.amount != null && <Chip>{money(parsed.amount)}</Chip>}
              {parsed.type === 'transfer' ? (
                <>
                  {parsed.fromAccount && <Chip>from {parsed.fromAccount}</Chip>}
                  {parsed.toAccount && <Chip>to {parsed.toAccount}</Chip>}
                </>
              ) : (
                <>
                  {parsed.category && (
                    <Chip title={`matched by ${parsed.matched.category?.via}`}>
                      <CategoryGlyph cat={cat} size={13} color={false} />
                      {parsed.category}
                    </Chip>
                  )}
                  {parsed.account && <Chip>{parsed.account}</Chip>}
                </>
              )}
              {parsed.matched.date && <Chip>{parsed.matched.date}</Chip>}
              {parsed.description && !parsed.category && (
                <Chip>{parsed.description}</Chip>
              )}
            </>
          )}
        </div>

        {/* The honest bit: say what is still missing rather than presenting a
            filled-looking form that is not. */}
        {text.trim() && !ready && (
          <p className="mt-1 flex items-center justify-center gap-1.5 text-[12px] text-amber-300/80">
            <IconWarning size={13} /> Needs an amount
          </p>
        )}
        {ready && !parsed.category && parsed.type === 'expense' && (
          <p className="mt-1 text-center text-[12px] text-white/40">
            No category matched — you can pick one next
          </p>
        )}

        <button
          onClick={go}
          disabled={!ready}
          className="mt-6 w-full py-3.5 rounded-2xl text-[15px] font-semibold text-white
            bg-primary shadow-[0_6px_24px_-6px_rgba(0,0,0,0.6)]
            disabled:opacity-30 disabled:shadow-none
            active:scale-[0.98] transition-all duration-100
            flex items-center justify-center gap-2"
        >
          <IconTick size={15} />
          Review {dest.verb.toLowerCase()}
        </button>

        <button
          onClick={onClose}
          className="mt-2 w-full py-2 text-[13px] font-medium text-white/50 active:opacity-70"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
