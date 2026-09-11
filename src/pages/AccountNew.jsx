import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { accountBrand, GRADIENT_PRESETS } from '../lib/accountBrands'
import { CARD_DESIGNS } from '../lib/cardDesigns'
import { PH_ACCOUNTS } from '../lib/phAccounts'
import { parseMoney, moneyChangeHandler } from '../utils/moneyInput'
import BrandWatermark from '../components/BrandWatermark'
import {
  PreviewCard, CardDesignGallery, ColorRail, SchemeRail,
} from '../components/CardStyle'
import Confetti from '../components/Confetti'
import {
  TYPE_OPTIONS, defaultRole, buildAccountRow, createAccount,
} from './Accounts'

/**
 * Creating an account, as a guided page rather than one long sheet.
 *
 * The old form was a bottom sheet with every field on one scroll: name, type,
 * role, colour, opening balance, network, and five credit fields that only
 * apply to one account type in five. You could not see what you were making
 * until it appeared in the list.
 *
 * So the card is the subject of the page. It sits pinned at the top and
 * updates on every keystroke and tap - pick BPI and it turns crimson and
 * takes BPI's mark; choose Mastercard and the mark appears where a real card
 * prints it. The fields are split into steps, which is not decoration: the
 * credit step is skipped entirely for accounts that cannot have a statement,
 * so nobody is scrolled past four fields that do not apply to them.
 *
 * Saving goes through buildAccountRow/createAccount in Accounts.jsx, shared
 * with the edit sheet, so the two screens cannot drift on which fields a
 * credit card nulls or that currency is always PHP.
 */

// The category glyph for each account type, so the Kind grid shows a shape
// rather than an emoji.
// Values are the real group strings from phAccounts, so renaming a group
// cannot silently stop the filter matching.
const FILTERS = [
  { value: 'all',               label: 'All' },
  { value: 'E-Wallets',         label: 'Wallets' },
  { value: 'Traditional Banks', label: 'Banks' },
  { value: 'Digital Banks',     label: 'Digital' },
]

const ROLE_OPTIONS = [
  { value: 'spending', label: 'Spending', hint: 'Day-to-day money you spend from' },
  { value: 'savings',  label: 'Savings',  hint: 'Money you are holding, not spending' },
]

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

// ── The live preview ───────────────────────────────────────────────────────────

/**
 * The card face, built from whatever has been filled in so far. Identical
 * material to the Accounts list, because the point is that this IS the card
 * you are about to get, not an illustration of one.
 */
// ── Field furniture ────────────────────────────────────────────────────────────

/**
 * A section header. Sentence case and normal weight rather than the
 * uppercase-tracked label a web form uses - the screaming caps were a large
 * part of why this page read as HTML.
 */
function SectionLabel({ children, hint }) {
  return (
    <div className="mb-2.5 px-1">
      <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{children}</p>
      {hint && (
        <p className="text-[12px] leading-snug text-slate-500 dark:text-slate-400 mt-0.5">{hint}</p>
      )}
    </div>
  )
}

const inputCls = (bad = false) =>
  `w-full px-4 py-3.5 rounded-2xl text-[15px] tabular-nums
   bg-white dark:bg-white/[0.05] text-slate-800 dark:text-white
   border ${bad ? 'border-red-400 dark:border-red-500/60' : 'border-slate-200 dark:border-white/[0.09]'}
   placeholder:text-slate-400 dark:placeholder:text-slate-500
   focus:outline-none focus:border-primary/60`

/**
 * A segmented control: one track, equal segments, the selection sliding
 * between them. The platform control for a small mutually-exclusive choice,
 * and it cannot produce an orphan the way wrapping chips do.
 *
 * Only for two or three options - past that the labels get too narrow to
 * read, which is what OptionGrid is for.
 */
function Segmented({ options, value, onChange }) {
  const index = Math.max(0, options.findIndex(o => o.value === value))
  return (
    <div
      className="relative flex p-1 rounded-2xl bg-slate-100 dark:bg-white/[0.06]
        border border-slate-200/70 dark:border-white/[0.06]"
      role="radiogroup"
    >
      {/* The moving thumb, sized as a fraction of the track so it lands on
          each segment exactly however many there are. */}
      <span
        aria-hidden="true"
        className="absolute top-1 bottom-1 rounded-xl bg-white dark:bg-white/[0.14]
          shadow-sm transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          left: 4,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`relative z-10 flex-1 py-2 text-[13px] font-semibold rounded-xl
            transition-colors duration-150 ${
              value === o.value
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-slate-400'
            }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}


/**
 * One institution in the picker.
 *
 * A tile rather than a list row, which is the answer to the list being too
 * long: forty rows is several screens of scrolling, while forty tiles in
 * three columns is fourteen rows. Recognition does the work here - you find
 * your bank by its colour and mark, not by reading its name - so the mark is
 * the tile and the name is only its caption.
 *
 * The mark is the same art as the card watermark, reused through
 * BrandWatermark with a class that renders it at full strength instead of at
 * 10% in a corner. Institutions with no logo file get their monogram from the
 * same component, so there is one code path for all three cases.
 */
function BrandTile({ preset, selected, onPick }) {
  const brand = accountBrand(preset)
  return (
    <button
      type="button"
      onClick={() => onPick(preset)}
      aria-pressed={selected}
      className="flex flex-col items-center gap-1 rounded-xl
        active:scale-[0.94] transition-transform duration-75"
    >
      <span
        className={`relative w-full aspect-square rounded-xl flex items-center justify-center
          overflow-hidden ${
            selected
              ? 'ring-2 ring-primary ring-offset-1 ring-offset-white dark:ring-offset-[#0b0f14]'
              : ''
          }`}
        style={{ background: `linear-gradient(135deg, ${brand.from}, ${brand.to})` }}
      >
        <BrandWatermark brand={brand} className="brand-glyph" />
        {selected && (
          <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-white text-primary
            flex items-center justify-center shadow">
            <IconCheck />
          </span>
        )}
      </span>
      <span className={`text-[9px] leading-[1.15] text-center line-clamp-2 ${
        selected ? 'font-semibold text-primary' : 'text-slate-600 dark:text-slate-300'
      }`}>
        {preset.name}
      </span>
    </button>
  )
}




/** The step indicator. Rendered above the card on the final step and below
 *  it on the others, so it is a component rather than two copies. */
function StepProgress({ steps, index, className = '' }) {
  return (
    <div className={`px-5 flex items-center gap-1.5 ${className}`} role="presentation">
      {steps.map((s, i) => (
        <span
          key={s}
          className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
            i <= index ? 'bg-primary' : 'bg-slate-200 dark:bg-white/[0.10]'
          }`}
        />
      ))}
    </div>
  )
}

// ── Card style step ────────────────────────────────────────────────────────────

/**
 * The card, stood up on its end.
 *
 * A CSS rotation of the real landscape face rather than a second portrait
 * layout, which is what the reference does too - its wordmark reads
 * bottom-to-top because the whole card is turned, not redrawn. One layout to
 * maintain, and what you are looking at is provably the card you are about to
 * get rather than an illustration of it.
 *
 * A transform never changes the layout box, so the wrapper is sized to the
 * PORTRAIT footprint and the landscape card is centred inside it and turned.
 * Rotating a w x h box by 90 degrees gives an h x w footprint, so the card is
 * built at (portraitH x portraitW) and lands exactly filling the wrapper. Get
 * that backwards and it overflows by the difference - the same trap the tilted
 * detail card fell into when its rotation saved no vertical space.
 */
/**
 * Choosing how the card looks.
 *
 * Everything on this step - the coverflow gallery, the dots, the colour row -
 * is in components/CardStyle.jsx, because the edit screen shows the same
 * three controls and two copies of a hand-tuned coverflow rail would not stay
 * the same for long.
 */
function StyleStep({ draft, set, action }) {
  return (
    <section className="flex-1 flex flex-col justify-center min-h-0 py-2">
      <CardDesignGallery draft={draft} set={set} />

      <div className="mt-4 px-5">
        <ColorRail draft={draft} set={set} />
      </div>

      {/* The button lives INSIDE the centred group on this step, not pinned to
          the bottom of the screen.

          Pinned, it sat a long way under the colour row with nothing between
          them - and because the section above it was flex-1, the section ate
          every spare pixel and left the whole group riding high with a gap
          beneath. Part of the same group, all five pieces centre together:
          card, name, dots, colours, button.

          It is also the only step where this is possible. One and two scroll,
          and a button that scrolls away with the content has to sit at the
          end of it; this step fits on one screen by design, so the button can
          be where the eye already is. */}
      <div className="mt-6 px-5 flex justify-center">{action}</div>

      {/* No error here. The name cannot be edited on this step, and step one
          will not let a duplicate through - so the only way to arrive with a
          bad name is another device syncing one while you stood on this
          screen. save() already handles that by dropping back to step one,
          where the field shows the reason next to itself. */}
    </section>
  )
}

/**
 * What you see the moment the account exists.
 *
 * Creating one used to end in a toast and a jump to the list, where the card
 * you had just spent three steps choosing was one tile among nine, at a
 * third of the size, with nothing marking it as new. Three steps of
 * deciding, and no moment of having decided.
 *
 * So the card gets the screen once, at full size, lying flat - the same face
 * from the gallery, now an account rather than a preview. Confetti says the
 * thing happened; the buttons say what can happen next.
 */
function CreatedStep({ draft, onDone, onAddTransaction }) {
  const isCredit = draft.type === 'credit'

  return (
    <section className="flex-1 flex flex-col items-center justify-center px-5 text-center">
      <Confetti />

      <div style={{ animation: 'pageFadeIn 0.45s ease both' }}>
        <h2 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
          You&rsquo;re all set!
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-200">{draft.name.trim()}</span>
          {' '}has been added to your accounts.
        </p>
      </div>

      {/* Rises a little later than the text, so the card arrives rather than
          appearing with it. */}
      <div className="w-full mt-7" style={{ animation: 'quickIn 0.5s 0.12s cubic-bezier(0.32, 0.72, 0, 1) both' }}>
        <PreviewCard draft={draft} large />
      </div>

      <p className="mt-5 text-[12.5px] leading-relaxed text-slate-400 dark:text-slate-500 max-w-[300px]">
        {isCredit
          ? 'Charges you log to it count against the limit, and installments spread across the statements they will land on.'
          : 'Log an expense, an inflow or a transfer against it and the balance keeps itself.'}
      </p>

      <div className="w-full mt-8 flex flex-col gap-2.5" style={{ animation: 'pageFadeIn 0.5s 0.3s ease both' }}>
        <button
          onClick={onDone}
          className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white bg-primary
            shadow-[0_6px_20px_-6px_rgba(var(--color-primary-rgb),0.6)]
            active:scale-[0.98] transition-transform duration-100"
        >
          Done
        </button>
        <button
          onClick={onAddTransaction}
          className="w-full py-3 rounded-2xl text-sm font-semibold
            text-slate-600 dark:text-slate-300
            active:bg-slate-100 dark:active:bg-white/[0.06] transition-colors"
        >
          Add a transaction
        </button>
      </div>
    </section>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AccountNew() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(false)
  const [touchedName, setTouchedName] = useState(false)
  const [filter, setFilter] = useState('all')

  const [draft, setDraft] = useState({
    name: '',
    type: 'cash',
    role: 'spending',
    // The first gradient, not the first solid. Two reasons, and the second is
    // the real one: a flat emerald is a duller card than the app can now make,
    // and PALETTE[0] sat tenth in the swatch row - so centring the selection
    // opened the row on the solids with every gradient scrolled off to the
    // left, hiding them behind a swipe nobody would know to make. A branded
    // account never sees this: pickPreset overwrites it with the
    // institution's own colour.
    color: GRADIENT_PRESETS[0].join(','),
    design: CARD_DESIGNS[0].key,
    customColor: false,
    presetColor: null,
    scheme: '',
    startingBal: '0',
    creditLimit: '0',
    cutoffDay: '',
    dueDay: '',
    minPayment: '0',
  })
  const set = useCallback((patch) => setDraft(d => ({ ...d, ...patch })), [])

  const isCredit = draft.type === 'credit'

  // The credit step is skipped for anything that cannot carry a statement,
  // rather than shown with its four fields disabled.
  // `style` replaced `review`, and is last so its button is the one that
  // creates the account. For an ordinary account that puts the card style at
  // step three; a credit card gets it at four, because its statement fields
  // have to be asked for somewhere and they are not something to interrupt
  // the visual step with.
  const steps = useMemo(
    () => ['institution', 'details', ...(isCredit ? ['credit'] : []), 'style'],
    [isCredit],
  )
  // Changing type away from credit can strand the index past the end.
  const current = steps[Math.min(step, steps.length - 1)]

  const taken = useMemo(
    () => new Set((accounts ?? []).map(a => (a.name ?? '').trim().toLowerCase())),
    [accounts],
  )
  const trimmed = draft.name.trim()
  const duplicate = !!trimmed && taken.has(trimmed.toLowerCase())
  // A duplicate name is not cosmetic: sync upserts accounts on (user, name),
  // so two accounts sharing one would silently merge in the cloud.
  const nameProblem = !trimmed
    ? 'Give the account a name'
    : duplicate ? 'You already have an account with this name' : null

  const canAdvance = current === 'institution' ? !nameProblem : true

  // Search wins over the filter: typing means you already know what you
  // want, and hiding a match because a category pill happens to be selected
  // is the kind of thing that makes a search box feel broken.
  const visiblePresets = useMemo(() => {
    const q = draft.name.trim().toLowerCase()
    if (q) return PH_ACCOUNTS.filter(a => a.name.toLowerCase().includes(q))
    if (filter === 'all') return PH_ACCOUNTS
    return PH_ACCOUNTS.filter(a => a.group === filter)
  }, [draft.name, filter])

  function pickPreset(preset) {
    set({
      name: preset.name,
      type: preset.type,
      role: defaultRole(preset.type),
      color: preset.color,
      // Switching institution drops any earlier override, so the new one
      // arrives in its own colours rather than inheriting the last pick.
      customColor: false,
      // Kept so the swatch row can offer the house colour back. Most of the
      // list - PNB, BDO, PSBank - has a real logo and a real house colour
      // without an entry in BRAND_GRADIENTS, so accountBrand reports them as
      // `custom` and there is no gradient to look up. Without this the row
      // would show nothing selected on exactly the accounts most likely to
      // have been picked from the grid.
      presetColor: preset.color,
    })
    setTouchedName(true)
  }

  /**
   * A step change starts at the top.
   *
   * Necessary the moment the action button moved into the flow: Continue now
   * lives at the BOTTOM of a step, so tapping it left the scroller parked
   * down there and the next step opened halfway through itself - on the
   * institution list, below the fold entirely.
   *
   * Instant, not smooth. This is a new page rather than a movement within
   * one, and animating it would read as the old page sliding away.
   *
   * <main> is the scroller, not the window - see layouts/AppLayout.jsx - so
   * window.scrollTo would do nothing here.
   */
  useEffect(() => {
    document.getElementById('app-main')?.scrollTo({ top: 0, behavior: 'auto' })
  }, [step])

  const nameRef = useRef(null)

  function next() {
    if (current === 'institution') {
      setTouchedName(true)
      if (nameProblem) {
        // The button is disabled, so this only runs when something else calls
        // next() - but keeping the scroll here means the reason is always one
        // place, whatever route gets here.
        nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        nameRef.current?.focus()
        return
      }
    }
    setStep(s => Math.min(s + 1, steps.length - 1))
  }

  function back() {
    if (step === 0) navigate('/accounts')
    else setStep(s => Math.max(s - 1, 0))
  }

  async function save() {
    if (nameProblem) { setStep(0); setTouchedName(true); return }
    setSaving(true)
    try {
      const row = buildAccountRow({
        name: draft.name,
        type: draft.type,
        role: draft.role,
        color: draft.color,
        creditLimit: draft.creditLimit,
        statementDay: '',
        dueDay: draft.dueDay,
        cutoffDay: draft.cutoffDay,
        minPayment: draft.minPayment,
        scheme: draft.scheme,
        design: draft.design,
        customColor: draft.customColor,
      })
      await createAccount(row, isCredit ? 0 : parseMoney(draft.startingBal))
      /* No toast, and no navigation. The next screen IS the confirmation,
         and a toast sliding over it would be the same news twice. */
      setCreated(true)
    } catch (e) {
      console.error('[AccountNew] save failed:', e)
      showToast('Failed to create account', 'error')
      setSaving(false)
    }
  }

  /* One button, two homes. Steps one and two hang it off the bottom of a
     scrolling page; the style step puts it inside its centred group. Building
     it once here keeps the two from drifting apart.

     w-full, not a min-width pill. At min-w-[15rem] the button was 240px in a
     ~350px gutter, so it floated with an inch of dead space either side and
     read as a suggestion rather than the way forward. Filling the gutter is
     what iOS does with a primary action, and it makes the target the full
     width of the thumb's reach. px-8 stays as the floor for the label. */
  const actionButton = current === 'style' ? (
    <button
      onClick={save}
      disabled={saving || !!nameProblem}
      className="w-full px-8 py-3 min-h-[44px] rounded-full
        text-[15px] font-semibold text-white bg-primary
        shadow-[0_6px_20px_-4px_rgba(0,0,0,0.45)]
        disabled:opacity-50 active:scale-[0.97] transition-transform duration-75"
    >
      {saving ? 'Adding\u2026' : 'Add account'}
    </button>
  ) : (
    <button
      onClick={next}
      disabled={!canAdvance}
      className="w-full px-8 py-3 min-h-[44px] rounded-full
        text-[15px] font-semibold text-white bg-primary
        shadow-[0_6px_20px_-4px_rgba(0,0,0,0.45)]
        disabled:opacity-50 active:scale-[0.97] transition-transform duration-75"
    >
      Continue
    </button>
  )

  // min-h-full plus a flex column is what lets the review step centre
  // itself: <main> is a definite-height scroller, so the flex child can take
  // the leftover space between the progress bar and the action.
  //
  // The navbar clearance belongs to the steps that SCROLL, not to the root.
  //
  // Three versions of this were wrong in three different ways. min-h-[calc
  // (100dvh-5rem)] with pb-nav subtracted the navbar twice, leaving 80px of
  // dead air under the button. min-h-full did not resolve at all - <main>
  // takes its height from flex-grow, and a percentage min-height against a
  // flex-grown parent is not reliably definite, so the section stopped 110px
  // short and mt-auto computed to 0. min-h-[100dvh] with pb-nav resolved
  // fine and then overflowed by exactly 80px, because the padding is space
  // the style step does not need: nothing on it scrolls, so nothing can hide
  // behind the navbar.
  //
  // So the root is the viewport minus the navbar with a small pad, which is
  // the box the style step centres itself in - and the clearance moves to the
  // action wrapper on steps one and two, which are the ones long enough to
  // scroll a button under the navbar. Each piece of padding now belongs to
  // the thing that needs it.
  /* Replaces the whole page rather than sitting on top of it: the form is
     finished, there is nothing left to go back to, and a step header
     counting "3/3" over a screen that says the account exists would be
     describing the wrong thing. Below every hook, so hookcheck stays true. */
  if (created) {
    return (
      <div className="flex flex-col min-h-[calc(100dvh-5rem)] pb-4">
        <CreatedStep
          draft={draft}
          onDone={() => navigate('/accounts', { replace: true })}
          onAddTransaction={() => navigate('/expense', { replace: true })}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-5rem)] pb-4">
      {/* ── Header ── */}
      {/* ── Step chrome, pinned ──────────────────────────────────────────

          Steps one and two scroll - the institution grid is forty tiles - and
          the header scrolled away with them, taking the back button and the
          step count with it. Halfway down the bank list there was nothing on
          screen saying where you were or how to get out.

          Frosted rather than filled. Every other sticky header in this app
          uses a solid colour, but those are all inside SHEETS, where the
          background is a known flat value. This is a page, and the page has a
          fixed radial gradient behind it (html.dark::before) - a solid fill
          would read as a flat patch sliding over a gradient. A translucent
          tint over a blur frosts whatever passes beneath and needs to know
          nothing about what that is.

          The progress bar comes along because it is the same chrome: it
          answers "how much is left", which is only useful while you are still
          in it. ── */}
      <div className="sticky top-0 z-20 shrink-0 pb-2">
        {/* The frost is its OWN layer, not the wrapper's background, and that
            is what lets it feather.
 
            Feathering means masking, and masking the wrapper would fade the
            header text and the progress bar along with the blur - the mask
            applies to the element's whole rendering, filter and content
            alike. A separate layer behind them can be masked to nothing at
            its bottom edge while the text above stays at full strength.
 
            It reaches 20px BELOW the wrapper, so the fade happens past the
            content rather than across it: at the header's own bottom edge the
            blur is still at full strength, and it thins out over the gap into
            the page. Without that overhang the frost stopped mid-sentence and
            the tiles behind it were sharply half-blurred.
 
            mask-image with a -webkit- twin: Safari still wants the prefix,
            and this is a PWA on iOS. */}
        <div
          className="absolute inset-x-0 top-0 -bottom-5 pointer-events-none
            backdrop-blur-xl bg-white/70 dark:bg-black/35"
          style={{
            maskImage: 'linear-gradient(to bottom, #000 0%, #000 58%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 58%, transparent 100%)',
          }}
          aria-hidden="true"
        />
        <header className="relative flex items-center gap-2 px-4 pt-safe-header pb-3 shrink-0">
          <button
            onClick={back}
            className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0
              bg-white dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/[0.09]
              text-slate-600 dark:text-slate-300 shadow-sm
              active:scale-90 transition-transform duration-75"
            aria-label={step === 0 ? 'Back to accounts' : 'Previous step'}
          >
            <IconChevronLeft />
          </button>
          <h1 className="flex-1 text-center text-base font-semibold text-slate-800 dark:text-white truncate px-1">
            New Account
          </h1>
          <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
            {steps.indexOf(current) + 1}/{steps.length}
          </span>
        </header>

        {/* ── The final step: the card is the whole screen ──

            Progress moves to the top so nothing sits between the card and the
            middle of the viewport, and the block centres in what is left. On
            every other step the card stays a running preview pinned under the
            header. ── */}
        <StepProgress steps={steps} index={steps.indexOf(current)} className="relative shrink-0" />
      </div>

      {current === 'style' ? (
        <StyleStep draft={draft} set={set} action={actionButton} />
      ) : (
        /* The card sat flush against the progress bar, which read as the two
           being one component. pt-3 separated them; pt-7 gives the card room
           to look like the subject of the screen rather than a header
           attachment. */
        <div className="pt-7">
          <PreviewCard draft={draft} />
        </div>
      )}

      {current === 'institution' && (
        <div className="mt-4">
          <div className="px-5 relative">
            <span className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
              <IconSearch />
            </span>
            <input
              value={draft.name}
              /* Typing IS naming. The grid filters on the same value, so a
                 name that matches an institution surfaces its logo to tap, and
                 one that matches nothing is simply the name - no second field,
                 no "or". Tapping a logo writes its name back into this field,
                 which is what makes the two behaviours one control rather than
                 two sharing a box.

                 A colour already picked survives a rename, deliberately: it
                 was chosen for the card, not for the name on it. */
              onChange={e => { set({ name: e.target.value }); setTouchedName(true) }}
              placeholder="Search, or type any name"
              ref={nameRef}
              className={inputCls(touchedName && !!nameProblem) + ' pl-10'}
            />
          </div>

          {/* px-5, not px-1. This sits OUTSIDE the field's own px-5 wrapper -
              it is a sibling of that div, not a child - so px-1 put it 4px
              from the screen edge while the field it describes started at 20.
              Aligned to the field's border box rather than its text, which
              starts at 60px behind the search icon; an error indented under
              the icon would read as belonging to the icon. */}
          {touchedName && nameProblem && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-2 px-5">{nameProblem}</p>
          )}

          {/* A filter row instead of four stacked sections. It scrolls
              sideways, so a narrow screen never wraps it into an orphan. */}
          {!draft.name && (
            <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar px-5 pb-1">
              {FILTERS.map(f => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  aria-pressed={filter === f.value}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold border
                    transition-colors active:scale-[0.97] ${
                      filter === f.value
                        ? 'bg-primary/[0.14] border-primary/45 text-primary'
                        : 'bg-white dark:bg-white/[0.05] border-slate-200 dark:border-white/[0.09] text-slate-600 dark:text-slate-300'
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <div className="px-5 mt-4">
            {visiblePresets.length > 0 ? (
              <div className="grid grid-cols-5 gap-x-2 gap-y-3.5">
                {visiblePresets.map(preset => (
                  <BrandTile
                    key={preset.name + preset.group}
                    preset={preset}
                    selected={trimmed === preset.name}
                    onPick={pickPreset}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400 px-1">
                Nothing matches that. Name it yourself below.
              </p>
            )}
          </div>

          {/* Always reachable: the list will never cover every institution,
              and cash, envelopes and joint pots have no institution at all. */}
          {/* The manual-name field used to live here, under an "Or name it
              yourself" heading. It is the field at the top now - see its
              onChange. The error message moved up with it. */}
        </div>
      )}

      {/* ── Step: details ── */}
      {current === 'details' && (
        <div className="px-5 mt-4 space-y-7">
          <div>
            <SectionLabel>Kind of account</SectionLabel>
            {/* A real <select>, because this runs as a PWA on iOS and iOS
                answers a select with its own wheel picker - a scrolling drum
                that lands with a detent, sized and placed by the OS. A grid of
                five tiles is a passable imitation of a control the platform
                will simply hand over if asked.

                appearance-none only strips the default arrow and chrome; the
                native picker still opens, so this is styling the closed state
                rather than replacing the control. The chevron is drawn beside
                it and marked aria-hidden, since the select announces itself.

                text-[16px], not the 15px the other fields use: below 16px iOS
                zooms the viewport when a form control takes focus, and it does
                not zoom back out.

                pr-11 keeps the value clear of the chevron - a select does not
                know the chevron is there and would happily print "E-Wallet"
                straight through it. */}
            <div className="relative">
              <select
                value={draft.type}
                onChange={e => {
                  const v = e.target.value
                  set({
                    type: v,
                    role: defaultRole(v),
                    // A cash tin has no card network to print.
                    scheme: v === 'cash' ? '' : draft.scheme,
                  })
                }}
                className={inputCls() + ' appearance-none pr-11 text-[16px] cursor-pointer'
                  + ' [color-scheme:light] dark:[color-scheme:dark]'}
              >
                {TYPE_OPTIONS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <span
                className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none
                  text-slate-400 dark:text-slate-500"
                aria-hidden="true"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </div>
          </div>

          {!isCredit && (
            <div>
              <SectionLabel>Counts as</SectionLabel>
              <Segmented options={ROLE_OPTIONS} value={draft.role} onChange={(v) => set({ role: v })} />
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-2 px-1">
                {ROLE_OPTIONS.find(r => r.value === draft.role)?.hint}
              </p>
            </div>
          )}

          {!isCredit && (
            <div>
              <SectionLabel hint="What is in it right now.">
                Opening balance
              </SectionLabel>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">₱</span>
                <input
                  inputMode="decimal"
                  value={draft.startingBal}
                  onChange={moneyChangeHandler(v => set({ startingBal: v }))}
                  className={inputCls() + ' pl-9'}
                />
              </div>
            </div>
          )}

          {draft.type !== 'cash' && (
            <div>
              <SectionLabel>Card network</SectionLabel>
              {/* The marks themselves, in a row you swipe - the same control
                  as the colours, for the same reason: five boxed tiles in a
                  3+2 grid left an orphan row, and a box around a logo is a
                  second rectangle competing with the one on the card. */}
              <SchemeRail value={draft.scheme} onChange={v => set({ scheme: v })} />
            </div>
          )}

          {/* Only worth showing when the brand is unknown: a recognised
              institution takes its own colours, so a swatch here would do
              nothing and look broken. */}
          {/* The colour grid used to be here. It is on the style step now,
              alongside the design gallery, which is where you can actually see
              what a colour does to the card. Asking for it twice in one flow
              was the tell that it was in the wrong place the first time. */}
        </div>
      )}

      {/* ── Step: credit ── */}
      {current === 'credit' && (
        <div className="px-5 mt-4 space-y-6">
          <div>
            <SectionLabel>Credit limit</SectionLabel>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">₱</span>
              <input
                inputMode="decimal"
                value={draft.creditLimit}
                onChange={moneyChangeHandler(v => set({ creditLimit: v }))}
                className={inputCls() + ' pl-9'}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <SectionLabel hint="Day the statement closes.">Cutoff day</SectionLabel>
              <input
                inputMode="numeric"
                value={draft.cutoffDay}
                onChange={e => set({ cutoffDay: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                placeholder="e.g. 26"
                className={inputCls()}
              />
            </div>
            <div>
              <SectionLabel hint="Day payment is due.">Due day</SectionLabel>
              <input
                inputMode="numeric"
                value={draft.dueDay}
                onChange={e => set({ dueDay: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                placeholder="e.g. 5"
                className={inputCls()}
              />
            </div>
          </div>

          <div>
            <SectionLabel>Minimum payment</SectionLabel>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">₱</span>
              <input
                inputMode="decimal"
                value={draft.minPayment}
                onChange={moneyChangeHandler(v => set({ minPayment: v }))}
                className={inputCls() + ' pl-9'}
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            A credit card's balance comes from its charges, so it starts at zero
            and fills in as you record spending.
          </p>
        </div>
      )}

      {/* ── The action, in the flow of each step ──

          It has been three things. First a full-width button on an opaque
          blurred bar - a slab bolted to the bottom of the screen, whose
          height had to be kept in step with the navbar by hand, which is
          what clipped it by 4px when I reserved 76px for an 80px navbar.
          Then a fixed pill, which fixed the slab but kept the coupling: a
          fixed element has to be told where the navbar ends, and the page
          had to reserve a matching hole for it.

          Now it is simply the last thing on the page. `mt-auto` pushes it to
          the bottom when the step is short - which is most of them - and
          lets it sit directly under the content when the step is long enough
          to scroll, instead of hovering over it. No z-index, no
          pointer-events dance, no measurement of the navbar: it is laid out
          by the same flow as everything above it, and pb-nav on the root
          keeps the whole page clear of the navbar in one place. ── */}
      {/* pt-4, not pt-6. mt-auto already pushes this to the bottom, so the
          padding was buying separation the empty space above had already
          bought. */}
      {/* Steps one and two: the button is the last thing on a page that
          scrolls, so it belongs at the end of it. mt-auto pushes it down when
          the step is short. The style step does not come through here - it
          renders the same button inside its own centred group, because it is
          the one step that fits on a screen. */}
      {current !== 'style' && (
        <div className="mt-auto flex flex-col items-center gap-2 px-5 pt-4
          pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
          {actionButton}
        </div>
      )}
    </div>
  )
}
