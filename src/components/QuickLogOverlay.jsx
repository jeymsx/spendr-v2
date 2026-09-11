import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { quickParse, learnLedger } from '../lib/quickParse'
import CategoryGlyph from './CategoryGlyph'
import { IconTick, IconWarning, IconBell } from './icons'

const _php = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = (v) => '₱' + _php.format(Math.abs(v ?? 0))

const TYPE_COPY = {
  expense:  { verb: 'Expense',  to: '/expense'  },
  inflow:   { verb: 'Inflow',   to: '/inflow'   },
  transfer: { verb: 'Transfer', to: '/transfer' },
}

/**
 * One thing the parser worked out, as a chip.
 *
 * Three tones, and the distinction is honesty rather than decoration:
 *
 *   accent  the direction, which is the one thing it is always sure of
 *   plain   FILLED - you said this. It is in the words you typed.
 *   guess   OUTLINED - it inferred this from your history or a merchant list.
 *
 * Once the parser started filling in the account from what you usually do, a
 * preview that rendered "GCash" identically whether you had typed it or not
 * was claiming more than it knew. Filled means yours; outlined means ours.
 *
 * The light-mode greys are slate-600, not the slate-400 they look like they
 * should be. Measured through the scrim against the net-worth card behind it,
 * slate-400 comes out at 2.0:1 and slate-500 at 3.7:1. Only slate-600 clears
 * 4.5:1 in the worst case.
 */
function Chip({ children, tone = 'plain', title }) {
  const TONES = {
    accent: 'bg-primary/[0.14] accent-ink',
    plain:  'bg-slate-900/[0.06] text-slate-700 dark:bg-white/[0.08] dark:text-slate-200',
    guess:  'border border-dashed border-slate-900/20 text-slate-600'
            + ' dark:border-white/25 dark:text-slate-300',
  }
  return (
    <span
      title={title}
      className={[
        'pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium',
        TONES[tone] ?? TONES.plain,
      ].join(' ')}
    >
      {children}
    </span>
  )
}

/** Plain English for where a field came from, on hover / long-press. */
function why(m) {
  if (!m) return undefined
  switch (m.via) {
    case 'name':     return 'you typed this'
    case 'history':  return `from your own history: "${m.value}"`
    case 'typo':     return `you typed "${m.typed}" - taken as "${m.value}"`
    case 'merchant': return `"${m.value}" is a known merchant`
    case 'template': return `from your "${m.value}" template`
    default:         return undefined
  }
}

/** Filled when you said it, outlined when the parser inferred it. */
const toneFor = (m) => (m?.via === 'name' ? 'plain' : 'guess')

/* Learned phrases are stored normalised - lowercase, punctuation stripped -
   because that is what matching needs. Showing one back in that form reads
   like a database dump, so it is capitalised on the way out. */
const titleCase = (s) => String(s ?? '').replace(/\b\w/g, c => c.toUpperCase())

/**
 * Two examples, built from THIS user's own accounts and merchants.
 *
 * The hint used to be hardcoded: Try "200 from maya savings to maya". On a
 * device with no Maya Savings account that is worse than no example at all -
 * "maya savings" falls back to matching "Maya", both sides of the transfer
 * agree, it is refused for being a transfer to itself, and you land on an
 * expense instead. An app should not suggest a sentence it cannot parse.
 *
 * So the accounts are whichever two you use most and the merchant is whatever
 * you have logged most often.
 */
export function examplesFor(transactions, accounts) {
  const rank = (pick) => {
    const n = new Map()
    for (const t of transactions ?? []) {
      const v = pick(t)
      if (v) n.set(v, (n.get(v) ?? 0) + 1)
    }
    return [...n.entries()].sort((x, y) => y[1] - x[1]).map(([v]) => v)
  }
  const names = (accounts ?? []).map(a => a?.name).filter(Boolean)
  const used = rank(t => t.account).filter(a => names.includes(a))
  const [from, to] = used.length >= 2 ? used : names
  const merchant = rank(t => t.description)[0]

  return {
    transfer: from && to ? `200 from ${from.toLowerCase()} to ${to.toLowerCase()}` : null,
    expense: merchant ? `150 ${merchant.toLowerCase()}` : null,
  }
}

/**
 * Hold the + and type a transaction.
 *
 * The screen dims to one question, because this is a single-purpose mode: you
 * are typing one line and then leaving. A sheet would keep the page behind it
 * legible and invite you to read it, which is the opposite of what a capture
 * surface wants.
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

  const accounts   = useLiveQuery(() => db.accounts.toArray(),     [], [])
  const categories = useLiveQuery(() => db.categories.toArray(),   [], [])
  const txAll      = useLiveQuery(() => db.transactions.toArray(), [], [])
  const recurring  = useLiveQuery(() => db.recurring.toArray(),    [], [])
  const templates  = useLiveQuery(() => db.templates.toArray(),    [], [])

  /**
   * Everything this user's own ledger can teach the parser: which category
   * each merchant belongs to, which account pays for it, and what it usually
   * costs.
   *
   * Recomputed only when the transaction COUNT changes, not on every
   * keystroke. It is a full pass over the table plus a fuzzy-token index, and
   * the answer cannot change while you are typing. On a nine-month ledger
   * that is the difference between building the index once and building it
   * once per character.
   */
  const knowledge = useMemo(
    () => learnLedger(txAll ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txAll?.length],
  )

  const parsed = useMemo(
    () => quickParse(text, { accounts, categories, recurring, templates, knowledge }),
    [text, accounts, categories, recurring, templates, knowledge],
  )

  const examples = useMemo(() => examplesFor(txAll, accounts), [txAll, accounts])

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

  /*
    How tall the screen ACTUALLY is right now.

    Centring the content needs this. A `fixed inset-0` overlay keeps the full
    window height when the software keyboard opens - the keyboard covers the
    bottom rather than shrinking the layout - so anything centred in it is
    centred behind the keyboard, which is the one place it cannot be seen.
    visualViewport is the only thing that reports the part still visible.

    Read in the initialiser rather than the effect body, because a setState
    during an effect is a cascading render and the lint rule is right.
  */
  const [viewportH, setViewportH] = useState(
    () => (typeof window !== 'undefined' ? window.visualViewport?.height ?? null : null),
  )
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => setViewportH(vv.height)
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  const go = useCallback(() => {
    const dest = TYPE_COPY[parsed.type] ?? TYPE_COPY.expense
    // Router state, not a query string: the payload holds names with spaces
    // and it has no business being visible or shareable.
    navigate(dest.to, { state: { prefill: parsed } })
    onClose()
  }, [parsed, navigate, onClose])

  /* Straight to the bill's own page, which is where posting a charge lives. */
  const goBill = useCallback(() => {
    if (!parsed.recurringMatch) return
    navigate(`/recurring/${parsed.recurringMatch.id}`)
    onClose()
  }, [parsed.recurringMatch, navigate, onClose])

  const cat = (categories ?? []).find(c => c.name === parsed.category) ?? null
  const ready = parsed.amount != null
  const dest = TYPE_COPY[parsed.type] ?? TYPE_COPY.expense

  return (
    <div className="fixed inset-0 z-[200]" style={{ touchAction: 'none' }}>
      {/*
        Very dark, lightly blurred. The app behind survives as faint structure
        rather than as fog: at 40px of blur it became a milky nothing, which
        reads as a screen you have been taken TO. This reads as a surface
        pulled over the top, which is what it is.

        Theme-aware because it has to be. The old version got away with white
        text in both themes only BECAUSE the scrim was heavy enough to turn a
        white page black underneath. Thin it and that stops being true, so
        every secondary colour was re-measured through the scrim.

        This is also the Cancel button. Tapping anywhere off the content
        closes, which is why there is no longer a row of screen spent on a
        word saying so.
      */}
      <div
        className="sheet-overlay absolute inset-0
          bg-white/88 dark:bg-black/[0.88] backdrop-blur-[10px]"
        onClick={onClose}
      />

      {/*
        Sized to the VISIBLE viewport and centred inside it, so the content
        sits in the middle of what you can actually see rather than the middle
        of a window whose bottom half the keyboard is covering.

        pointer-events-none, with the content turning them back on: that is
        what lets a tap on the empty space around the text fall through to the
        scrim and close.
      */}
      <div
        className="relative pointer-events-none flex flex-col justify-center px-6"
        style={{ height: viewportH ? `${viewportH}px` : '100%' }}
      >
        {/* pointer-events-none by default, with only the parts you actually
            touch turning them back on. Text is not one of those: the heading
            is full-width, so leaving it interactive made the whole horizontal
            band at heading height a dead zone where tapping did nothing. */}
        <div className="pointer-events-none">
          {/*
            A question, not a label.

            "QUICK LOG" in small caps told you which screen you were on, which
            you already knew - you held the button to get here. Asking instead
            does the one useful thing a prompt can do: it says what kind of
            answer is wanted in the same breath as inviting one.

            Deliberately neutral about direction. "What did you spend?" would
            be wrong for the inflows and transfers that are a quarter of this
            ledger.
          */}
          <h2 className="text-[27px] leading-[1.25] font-medium tracking-[-0.01em]
            text-slate-900 dark:text-white">
            What do you want to log?
          </h2>

          {/*
            Left-aligned, and that is a bug fix rather than a preference.
            Centred, an EMPTY field puts the caret in the middle of the
            placeholder - the bar blinks between "jo" and "llibee" and reads
            as though the app has typed an entry you now have to clear.

            No rule underneath either. The line was announcing "this is a form
            field", which is the opposite of the intent.
          */}
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && ready) go() }}
            placeholder={examples.expense ?? '150 jollibee'}
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Quick log"
            className="pointer-events-auto mt-3 w-full bg-transparent outline-none
              text-[21px] leading-snug font-normal
              text-slate-700 dark:text-white/85
              placeholder-slate-400 dark:placeholder-white/30"
          />

          {/* What it understood. Deliberately shows the TYPE first: getting an
              expense when you meant a transfer is the one mistake that is
              annoying to undo. */}
          <div className="mt-6 min-h-[64px] flex flex-wrap items-start justify-start gap-2">
            {!text.trim() ? (
              <p className="text-[13px] leading-relaxed text-slate-600 dark:text-white/40">
                {(examples.expense || examples.transfer) && (
                  <>
                    Try &ldquo;{examples.expense ?? examples.transfer}&rdquo;
                    {examples.expense && examples.transfer && (
                      <> or &ldquo;{examples.transfer}&rdquo;</>
                    )}.
                  </>
                )}
              </p>
            ) : (
              <>
                <Chip tone="accent">{dest.verb}</Chip>
                {parsed.amount != null && <Chip>{money(parsed.amount)}</Chip>}
                {parsed.type === 'transfer' ? (
                  <>
                    {parsed.fromAccount && <Chip>from {parsed.fromAccount}</Chip>}
                    {parsed.toAccount && <Chip>to {parsed.toAccount}</Chip>}
                    {parsed.fee != null && <Chip>{money(parsed.fee)} fee</Chip>}
                  </>
                ) : (
                  <>
                    {parsed.category && (
                      <Chip tone={toneFor(parsed.matched.category)} title={why(parsed.matched.category)}>
                        <CategoryGlyph cat={cat} size={13} color={false} />
                        {parsed.category}
                      </Chip>
                    )}
                    {parsed.account && (
                      <Chip tone={toneFor(parsed.matched.account)} title={why(parsed.matched.account)}>
                        {parsed.account}
                      </Chip>
                    )}
                  </>
                )}
                {parsed.matched.date && <Chip>{parsed.matched.date}</Chip>}
                {parsed.description && !parsed.category && (
                  <Chip>{parsed.description}</Chip>
                )}
              </>
            )}
          </div>

          {/* The honest bit: say what is still missing rather than presenting
              a filled-looking form that is not. */}
          {text.trim() && !ready && (
            <p className="flex items-center gap-1.5 text-[12px] text-amber-800 dark:text-amber-300/80">
              <IconWarning size={13} /> Needs an amount
            </p>
          )}
          {ready && !parsed.category && parsed.type === 'expense' && !parsed.transferIssue && (
            <p className="text-[12px] text-slate-600 dark:text-white/40">
              No category matched — you can pick one next
            </p>
          )}

          {/* It ALMOST parsed as a transfer. Falling through to an expense in
              silence is how money ends up moving the wrong way: the form looks
              filled in, and the single field that is wrong is the costly one. */}
          {parsed.transferIssue && (
            <p className="flex items-start gap-1.5 text-[12px] text-amber-800 dark:text-amber-300/80">
              <span className="mt-[2px] shrink-0"><IconWarning size={13} /></span>
              {parsed.transferIssue.reason === 'same-account'
                ? `Both sides read as ${parsed.transferIssue.account} — a transfer needs two different accounts`
                : `No account called “${parsed.transferIssue.typed}” — logging this as an expense`}
            </p>
          )}

          {/* Your usual amount for this merchant, when what you typed is
              nowhere near it. A hint, never a block: the parser has no idea
              whether today's Grab really was nine thousand pesos. It exists
              for the dropped or duplicated zero, which is cheap to catch here
              and expensive to find in a statement three weeks on. */}
          {parsed.amountFlag && (
            <p className="flex items-center gap-1.5 text-[12px] text-amber-800 dark:text-amber-300/80">
              <IconWarning size={13} />
              {parsed.amountFlag.direction === 'high' ? 'Much more' : 'Much less'} than
              your usual {titleCase(parsed.amountFlag.phrase)} ({money(parsed.amountFlag.median)})
            </p>
          )}

          {/* You already have a bill by this name.

              Offered rather than substituted: "549 netflix" might be the
              monthly charge, or a gift card bought at a counter. Only you know
              which, so both routes stay one tap away and the plain one keeps
              the confirm button.

              It matters because posting the bill is not the same as logging an
              expense - it advances nextDate and stamps recurringId, which is
              what makes the bill's history real. Log it by hand and the bill
              sits there looking unpaid. */}
          {parsed.recurringMatch && (
            <button
              onClick={goBill}
              className="pointer-events-auto mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-full
                text-[13px] font-medium
                text-slate-700 bg-slate-900/[0.05] border border-slate-900/10
                dark:text-white/85 dark:bg-white/[0.08] dark:border-white/15
                active:scale-[0.98] transition-all duration-100"
            >
              <IconBell size={13} />
              Post the {parsed.recurringMatch.name} bill instead
            </button>
          )}
        </div>

        {/*
          Confirm, as a disc in the bottom-right corner.

          A full-width bar under the text was the wrong shape for this. It is
          the last thing in a reading order nobody reads, and on a phone it
          sits where the thumb is not. Bottom-right is the one place a right
          thumb reaches without regripping, and because it is anchored to the
          VISIBLE viewport it floats just above the keyboard rather than
          behind it.

          Kept visible while disabled rather than hidden, so the target does
          not appear under a thumb already on its way down.
        */}
        <button
          onClick={go}
          disabled={!ready}
          aria-label={`Review ${dest.verb.toLowerCase()}`}
          className="pointer-events-auto absolute bottom-6 right-6
            w-14 h-14 rounded-full bg-primary text-white
            flex items-center justify-center
            shadow-[0_8px_28px_-8px_rgba(0,0,0,0.55)]
            disabled:opacity-25 disabled:shadow-none
            active:scale-95 transition-all duration-100"
        >
          <IconTick size={22} />
        </button>
      </div>
    </div>
  )
}
