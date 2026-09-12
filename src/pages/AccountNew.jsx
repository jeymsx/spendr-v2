import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { GRADIENT_PRESETS } from '../lib/accountBrands'
import { CARD_DESIGNS } from '../lib/cardDesigns'
import { PH_ACCOUNTS } from '../lib/phAccounts'
import { parseMoney, moneyChangeHandler } from '../utils/moneyInput'
import {
  PreviewCard,
  SchemeRail,
} from '../components/CardStyle'
import {
  TYPE_OPTIONS, defaultRole, buildAccountRow, createAccount,
} from './Accounts'
import IconButton from '../components/ui/IconButton'
import SectionLabel from '../components/ui/SectionLabel'
import { Segmented, BrandTile, StepProgress, inputCls } from './accounts/NewFields'
import { StyleStep, CreatedStep } from './accounts/NewCardStyleStep'
import Rail from '../components/ui/Rail'

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


// ── The live preview ───────────────────────────────────────────────────────────

/**
 * The card face, built from whatever has been filled in so far. Identical
 * material to the Accounts list, because the point is that this IS the card
 * you are about to get, not an illustration of one.
 */
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
    /* Tapping the tile that is already on clears it.

       The grid is how you choose an institution, so it should also be how
       you un-choose one - and the case that makes this matter is the one
       where the name is rejected: tap BPI, get "you already have an account
       with this name", and the only way out was to go to the field below and
       delete the text the tile had just put there. The tile said "selected"
       and offered no way to say otherwise.

       Back to the draft's own defaults rather than just blanking the name.
       The preset set four other fields on the way in - type, role, colour,
       and the house colour the swatch row offers back - and leaving those
       behind would mean an unnamed account still carrying BPI's crimson and
       calling itself a bank.

       touchedName goes back to false too. It exists to hold the error back
       until you have interacted with the field, and clearing a name on
       purpose should not immediately be told the name is missing. Both
       advancing and saving set it themselves, so nothing stops validating. */
    if (draft.name.trim() === preset.name) {
      set({
        name: '',
        type: 'cash',
        role: defaultRole('cash'),
        color: GRADIENT_PRESETS[0].join(','),
        customColor: false,
        presetColor: null,
      })
      setTouchedName(false)
      return
    }

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
        <header className="relative flex items-center gap-2 px-5 pt-safe-header pb-3 shrink-0">
          <IconButton
            label={step === 0 ? 'Back to accounts' : 'Previous step'}
            onClick={back}
          >
            <IconChevronLeft />
          </IconButton>
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
            <Rail className="mt-3 gap-2 px-5 pb-1">
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
            </Rail>
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
              <SectionLabel hint="What is in it right now.">Opening balance</SectionLabel>
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
