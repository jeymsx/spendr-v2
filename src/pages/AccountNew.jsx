import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { accountBrand } from '../lib/accountBrands'
import { PH_ACCOUNTS } from '../lib/phAccounts'
import { parseMoney, moneyChangeHandler } from '../utils/moneyInput'
import BrandMark from '../components/BrandMark'
import BrandWatermark from '../components/BrandWatermark'
import SchemeMark, { SCHEME_OPTIONS } from '../components/SchemeMark'
import {
  PALETTE, TYPE_OPTIONS, TYPE_LABEL, defaultRole,
  buildAccountRow, createAccount, fmt,
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

const CARD_RATIO = 1.586

// The category glyph for each account type, so the Kind grid shows a shape
// rather than an emoji.
// Values are the real group strings from phAccounts, so renaming a group
// cannot silently stop the filter matching.
const FILTERS = [
  { value: 'all',               label: 'All' },
  { value: 'E-Wallets',         label: 'Wallets' },
  { value: 'Traditional Banks', label: 'Banks' },
  { value: 'Digital Banks',     label: 'Digital' },
  { value: 'Credit Cards',      label: 'Credit' },
]

const TYPE_MARK_FOR = {
  cash:    'cash',
  ewallet: 'wallet',
  savings: 'bank',
  bank:    'bank',
  credit:  'card',
}

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
function PreviewCard({ draft }) {
  const brand = accountBrand({ name: draft.name, type: draft.type, color: draft.color })
  const isCredit = draft.type === 'credit'
  const typeLabel = TYPE_LABEL[draft.type]
  const named = draft.name.trim()
  // An account named after its own type would otherwise label itself twice.
  const subtitle = typeLabel && typeLabel.toLowerCase() !== named.toLowerCase()
    ? typeLabel
    : null

  return (
    <div
      className="acct-card mx-auto w-full max-w-[300px] rounded-2xl px-5 pt-4 pb-4
        flex flex-col text-left text-white"
      style={{
        background: `linear-gradient(135deg, ${brand.from} 0%, ${brand.to} 100%)`,
        aspectRatio: String(CARD_RATIO),
      }}
      data-brand={brand.key}
    >
      <BrandWatermark brand={brand} />

      <div className="flex items-center gap-2.5">
        <BrandMark mark={brand.mark} size={22} className="shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-tight truncate">
            {named || 'New account'}
          </p>
          {subtitle && <p className="text-[10px] text-white/65 truncate">{subtitle}</p>}
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-white/50">
            PHP
          </p>
          {isCredit && parseMoney(draft.creditLimit) > 0 && (
            <p className="text-[11px] font-semibold tabular-nums text-white/80 mt-0.5">
              {fmt(parseMoney(draft.creditLimit))} limit
            </p>
          )}
        </div>
        <SchemeMark scheme={draft.scheme} className="h-[22px]" />
      </div>
    </div>
  )
}

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
 * A uniform grid of choices. Wrapping chips were leaving orphans - "Credit
 * Card" and "JCB" each stranded alone on a second row - because chip widths
 * follow their text. Fixed columns align every cell instead, so a five-option
 * set reads as 3 + 2 of a grid rather than as a ragged overflow.
 */
function OptionGrid({ options, value, onChange, columns = 3 }) {
  return (
    <div className={`grid gap-2 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`} role="radiogroup">
      {options.map(o => {
        const active = value === o.value
        return (
          <button
            key={o.value || 'none'}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex flex-col items-center justify-center gap-1.5 h-[62px] rounded-2xl
              border text-[12px] font-semibold transition-colors active:scale-[0.97] ${
                active
                  ? 'bg-primary/[0.12] border-primary/50 text-primary'
                  : 'bg-white dark:bg-white/[0.05] border-slate-200 dark:border-white/[0.09] text-slate-600 dark:text-slate-300'
              }`}
          >
            {o.art}
            <span className="leading-none">{o.label}</span>
          </button>
        )
      })}
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

function Card({ children, className = '' }) {
  return (
    <div
      className={`rounded-2xl overflow-hidden bg-white border border-slate-100
        dark:bg-white/[0.04] dark:border-white/[0.07]
        shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none ${className}`}
    >
      {children}
    </div>
  )
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3">
      <span className="text-[13px] text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 tabular-nums text-right truncate">
        {value}
      </span>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AccountNew() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [touchedName, setTouchedName] = useState(false)
  const [filter, setFilter] = useState('all')

  const [draft, setDraft] = useState({
    name: '',
    type: 'cash',
    role: 'spending',
    color: PALETTE[0],
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
  const steps = useMemo(
    () => ['institution', 'details', ...(isCredit ? ['credit'] : []), 'review'],
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
    const q = query.trim().toLowerCase()
    if (q) return PH_ACCOUNTS.filter(a => a.name.toLowerCase().includes(q))
    if (filter === 'all') return PH_ACCOUNTS
    return PH_ACCOUNTS.filter(a => a.group === filter)
  }, [query, filter])

  function pickPreset(preset) {
    set({
      name: preset.name,
      type: preset.type,
      role: defaultRole(preset.type),
      color: preset.color,
    })
    setTouchedName(true)
  }

  function next() {
    if (current === 'institution') {
      setTouchedName(true)
      if (nameProblem) return
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
      })
      await createAccount(row, isCredit ? 0 : parseMoney(draft.startingBal))
      showToast('Account created')
      navigate('/accounts', { replace: true })
    } catch (e) {
      console.error('[AccountNew] save failed:', e)
      showToast('Failed to create account', 'error')
      setSaving(false)
    }
  }

  const stepTitle = {
    institution: 'Which account?',
    details: 'The details',
    credit: 'Billing cycle',
    review: 'Ready to add',
  }[current]

  return (
    <div className="pb-32">
      {/* ── Header ── */}
      <header className="flex items-center gap-2 px-4 pt-safe-header pb-3">
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

      {/* ── The card being made, always on screen ── */}
      <section className="px-5 mt-1">
        <PreviewCard draft={draft} />
      </section>

      {/* ── Progress ── */}
      <div className="px-5 mt-5 flex items-center gap-1.5" role="presentation">
        {steps.map((s, i) => (
          <span
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i <= steps.indexOf(current)
                ? 'bg-primary'
                : 'bg-slate-200 dark:bg-white/[0.10]'
            }`}
          />
        ))}
      </div>

      <h2 className="px-5 mt-4 text-[19px] font-semibold tracking-tight text-slate-900 dark:text-white">
        {stepTitle}
      </h2>

      {/* ── Step: institution ── */}
      {current === 'institution' && (
        <div className="mt-4">
          <div className="px-5 relative">
            <span className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
              <IconSearch />
            </span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search banks and wallets"
              className={inputCls() + ' pl-10'}
            />
          </div>

          {/* A filter row instead of four stacked sections. It scrolls
              sideways, so a narrow screen never wraps it into an orphan. */}
          {!query && (
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
          <div className="px-5 mt-7">
            <SectionLabel hint="Anything not above, or just Cash.">
              Or name it yourself
            </SectionLabel>
            <input
              value={draft.name}
              onChange={e => { set({ name: e.target.value }); setTouchedName(true) }}
              placeholder="Account name"
              className={inputCls(touchedName && !!nameProblem)}
            />
            {touchedName && nameProblem && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-2">{nameProblem}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Step: details ── */}
      {current === 'details' && (
        <div className="px-5 mt-4 space-y-7">
          <div>
            <SectionLabel>Kind of account</SectionLabel>
            <OptionGrid
              options={TYPE_OPTIONS.map(t => ({
                value: t.value,
                label: t.shortLabel,
                art: <BrandMark mark={TYPE_MARK_FOR[t.value]} size={20} />,
              }))}
              value={draft.type}
              onChange={(v) => set({
                type: v,
                role: defaultRole(v),
                // A cash tin has no card network to print.
                scheme: v === 'cash' ? '' : draft.scheme,
              })}
            />
          </div>

          {!isCredit && (
            <div>
              <SectionLabel hint="Decides which group it lands in, and which total it feeds.">
                Counts as
              </SectionLabel>
              <Segmented options={ROLE_OPTIONS} value={draft.role} onChange={(v) => set({ role: v })} />
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-2 px-1">
                {ROLE_OPTIONS.find(r => r.value === draft.role)?.hint}
              </p>
            </div>
          )}

          {!isCredit && (
            <div>
              <SectionLabel hint="What is in it right now. You can change this later.">
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
              <SectionLabel hint="Printed on the card face, like the real thing.">
                Card network
              </SectionLabel>
              {/* Showing the marks rather than their names: it is what you
                  look for on the physical card, and Mastercard keeps its own
                  colours here the same as it does on the card face. */}
              <OptionGrid
                options={SCHEME_OPTIONS.map(o => ({
                  value: o.value,
                  label: o.label,
                  art: o.value
                    ? <SchemeMark scheme={o.value} className="scheme-pick" />
                    : <span className="block w-5 h-[2px] rounded-full bg-current opacity-40" />,
                }))}
                value={draft.scheme}
                onChange={(v) => set({ scheme: v })}
              />
            </div>
          )}

          {/* Only worth showing when the brand is unknown: a recognised
              institution takes its own colours, so a swatch here would do
              nothing and look broken. */}
          {accountBrand({ name: draft.name, type: draft.type, color: draft.color }).key === 'custom' && (
            <div>
              <SectionLabel hint="Used to build the card's gradient.">Colour</SectionLabel>
              <div className="grid grid-cols-7 gap-2">
                {PALETTE.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set({ color: c })}
                    aria-label={`Colour ${c}`}
                    aria-pressed={draft.color === c}
                    className={`aspect-square rounded-full transition-transform active:scale-90 ${
                      draft.color === c
                        ? 'ring-2 ring-offset-2 ring-primary ring-offset-white dark:ring-offset-[#0b0f14]'
                        : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}
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

      {/* ── Step: review ── */}
      {current === 'review' && (
        <div className="px-5 mt-4">
          <Card>
            <SummaryRow label="Name" value={trimmed || '—'} />
            <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
            <SummaryRow label="Kind" value={TYPE_LABEL[draft.type]} />
            <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
            <SummaryRow label="Counts as" value={isCredit ? 'Credit' : (draft.role === 'savings' ? 'Savings' : 'Spending')} />
            {!isCredit && (
              <>
                <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
                <SummaryRow label="Opening balance" value={fmt(parseMoney(draft.startingBal))} />
              </>
            )}
            {isCredit && (
              <>
                <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
                <SummaryRow label="Credit limit" value={fmt(parseMoney(draft.creditLimit))} />
                <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
                <SummaryRow label="Cutoff / due" value={
                  draft.cutoffDay || draft.dueDay
                    ? `${draft.cutoffDay || '—'} / ${draft.dueDay || '—'}`
                    : 'Not set'
                } />
                <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
                <SummaryRow label="Minimum payment" value={fmt(parseMoney(draft.minPayment))} />
              </>
            )}
            {draft.scheme && (
              <>
                <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
                <SummaryRow label="Network" value={SCHEME_OPTIONS.find(o => o.value === draft.scheme)?.label ?? draft.scheme} />
              </>
            )}
          </Card>

          {nameProblem && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-3">{nameProblem}</p>
          )}
        </div>
      )}

      {/* ── Footer: fixed above the nav, so the action is always reachable
             without scrolling to the end of a step ── */}
      <div className="fixed left-0 right-0 bottom-0 z-40 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+76px)] pt-3
        bg-white/85 dark:bg-[#0b0f14]/90 backdrop-blur-xl
        border-t border-slate-200/70 dark:border-white/[0.07]">
        {current === 'review' ? (
          <button
            onClick={save}
            disabled={saving || !!nameProblem}
            className="w-full py-3.5 rounded-2xl text-[15px] font-semibold text-white bg-primary
              disabled:opacity-50 active:scale-[0.99] transition-transform duration-75"
          >
            {saving ? 'Adding…' : 'Add account'}
          </button>
        ) : (
          <button
            onClick={next}
            disabled={!canAdvance}
            className="w-full py-3.5 rounded-2xl text-[15px] font-semibold text-white bg-primary
              disabled:opacity-50 active:scale-[0.99] transition-transform duration-75"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  )
}
