import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useTheme } from '../../context/ThemeContext'
import SubPage from '../../components/SubPage'
import Segmented from '../../components/ui/Segmented'
import { setViewMode, getViewPreference } from '../../web/useViewMode'
import useRates from '../../hooks/useRates'
import { PauseCircle } from '@untitledui/icons'
import Switch from '../../components/ui/Switch'
import { setReduceMotion, systemReducesMotion } from '../../components/ui/motion'
import { useReduceMotionChosen } from '../../hooks/useReduceMotion'
import {
  ACCENT_COLORS, IconPalette, RowChevron, RowDivider, RowIcon, SectionCard, SectionHeader, SettingsRow,
} from './shared'

/**
 * Preferences: how the app looks, and how it behaves.
 *
 * ── Why a page of its own ──
 *
 * They were two sections on Settings - Appearance and Preferences - and
 * growing: theme, accent, style, confirmations, rollover, net worth, the
 * desktop layout. Settings is where you go to manage things and move data;
 * these are the few switches that change the app itself, and they read
 * better together, a tap away, than scattered down the longest screen in it.
 *
 * ── Style ──
 *
 * Vivid is Spendr as it has always looked - the accent washing the ground,
 * tinted glass cards. Clean is flat: neutral surfaces and hairlines, the iOS
 * and shadcn look, and in dark mode a true black ground - lights out. It is
 * a choice beside the theme rather than a third theme, so either style works
 * in light and in dark. The two previews are drawn from the same colours the
 * style uses, in the theme you are in now.
 */
export default function Preferences() {
  const navigate = useNavigate()
  const { theme, setTheme, style, setStyle, accentColor } = useTheme()
  const meta = useLiveQuery(() => db.meta.toArray(), [], [])
  const fx = useRates()
  const [view, setView] = useState(getViewPreference)

  const read = (/** @type {string} */ key, /** @type {any} */ fallback) =>
    (meta ?? []).find(m => m.key === key)?.value ?? fallback
  const skipConfirm = !!read('skipConfirm', false)
  const budgetRollover = !!read('budgetRollover', false)
  // On unless it was turned off - lib/netWorth.js debtsCountFrom.
  const countDebts = read('netWorthDebts', true) !== false
  const netWorthMode = read('netWorthMode', 'converted') === 'separated' ? 'separated' : 'converted'
  const put = (/** @type {string} */ key, /** @type {any} */ value) =>
    db.meta.put({ key, value, updatedAt: new Date().toISOString() })

  const accentName = useMemo(() => ACCENT_COLORS.find(c => c.hex === accentColor)?.name ?? 'Custom', [accentColor])
  const dark = theme === 'dark'

  return (
    <SubPage title="Preferences">
      <div className="mt-2 mb-8">
        <SectionHeader>Appearance</SectionHeader>
        <div className="mx-5 flex flex-col gap-4">
          <Segmented
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
            value={theme}
            onChange={(/** @type {string} */ v) => setTheme(v)}
          />
          <div role="radiogroup" aria-label="Style" className="grid grid-cols-2 gap-3">
            <StyleChoice value="vivid" current={style} dark={dark} onPick={setStyle}
              label="Vivid" hint="Your accent, all through" />
            <StyleChoice value="flat" current={style} dark={dark} onPick={setStyle}
              label={dark ? 'Lights out' : 'Clean'} hint={dark ? 'True black, flat and quiet' : 'Flat, neutral, crisp'} />
          </div>
        </div>
        <div className="mt-4">
          <SectionCard>
            <SettingsRow
              iconEl={<RowIcon color="violet"><IconPalette /></RowIcon>}
              label="Accent colour"
              sublabel={accentName}
              right={
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
                  <RowChevron />
                </div>
              }
              onTap={() => navigate('/settings/accent')}
            />
            <RowDivider />
            <ReduceMotionRow />
          </SectionCard>
        </div>
      </div>

      <div className="mb-8">
        <SectionHeader>Behaviour</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={
              <RowIcon color="green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </RowIcon>
            }
            label="Skip confirmation"
            sublabel="Save instantly, no review step"
            right={<ToggleSwitch on={skipConfirm} />}
            onTap={() => put('skipConfirm', !skipConfirm)}
          />
          <RowDivider />
          {/* The default for a category that has not been decided on its own.
              Turning it off here does not turn off a category you switched on
              deliberately - see lib/rollover.js. */}
          <SettingsRow
            iconEl={
              <RowIcon color="violet">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </RowIcon>
            }
            label="Carry budgets over"
            sublabel="Unspent rolls into next month"
            right={<ToggleSwitch on={budgetRollover} />}
            onTap={() => put('budgetRollover', !budgetRollover)}
          />

          <RowDivider />
          {/* Money between you and other people - the Debts page - as part
              of net worth: what they owe you adds, what you owe them takes
              off. On unless turned off. Every net-worth figure reads it,
              through lib/netWorth.js. */}
          <SettingsRow
            iconEl={
              <RowIcon color="amber">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="8" r="3" />
                  <path d="M3 20a6 6 0 0 1 12 0" />
                  <path d="M16 11h5M18.5 8.5v5" />
                </svg>
              </RowIcon>
            }
            label="Count debts in net worth"
            sublabel="What people owe you, less what you owe"
            right={<ToggleSwitch on={countDebts} />}
            onTap={() => put('netWorthDebts', !countDebts)}
          />

          {/* Only for a ledger that actually holds more than one currency:
              there is nothing to choose between when every account is in
              pesos. */}
          {fx.needed && (
            <>
              <RowDivider />
              <SettingsRow
                iconEl={
                  <RowIcon color="teal">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v18" />
                      <path d="M5 7h14" />
                      <path d="M5 7l-3 6a3 3 0 006 0z" />
                      <path d="M19 7l3 6a3 3 0 01-6 0z" />
                      <path d="M8 21h8" />
                    </svg>
                  </RowIcon>
                }
                label="Net worth"
                sublabel="Across currencies"
                right={<ModeSelect value={netWorthMode} onChange={(/** @type {string} */ v) => put('netWorthMode', v)} dark={dark} />}
              />
            </>
          )}

          <RowDivider />
          {/* Without this, choosing "switch to mobile" in the desktop sidebar
              was a one-way door: the preference is stored per-device in
              localStorage, and nothing else could clear it. */}
          <SettingsRow
            iconEl={
              <RowIcon color="blue">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="13" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </RowIcon>
            }
            label="Desktop layout"
            sublabel={view === 'mobile' ? 'Always mobile' : 'Automatic on wide screens'}
            right={<RowChevron />}
            onTap={() => {
              const next = view === 'mobile' ? 'auto' : 'desktop'
              setView(next)
              setViewMode(next)
            }}
          />
        </SectionCard>
      </div>

    </SubPage>
  )
}

/**
 * One style, as a small picture of the app in it: its ground, a card with a
 * figure and a bar, and the tab bar - drawn in that style's own colours for
 * the theme you are in.
 *
 * @param {{value: 'vivid'|'flat', current: string, dark: boolean, label: string, hint: string,
 *          onPick: (v: string) => void}} props
 */
function StyleChoice({ value, current, dark, label, hint, onPick }) {
  const on = current === value
  const flat = value === 'flat'
  const ground = dark
    ? (flat ? '#000000' : 'radial-gradient(130% 90% at 50% -10%, rgba(var(--color-primary-rgb), 0.28), transparent 70%), #0b0f14')
    : (flat ? '#f2f2f7' : 'radial-gradient(130% 90% at 50% -10%, rgba(var(--color-primary-rgb), 0.14), transparent 70%), #f8fafc')
  const card = dark
    ? (flat ? { background: '#111113', border: '1px solid rgba(255,255,255,0.08)' } : { background: 'rgba(var(--color-primary-rgb), 0.12)', border: '1px solid rgba(var(--color-primary-rgb), 0.22)' })
    : (flat ? { background: '#ffffff', border: '1px solid rgba(0,0,0,0.06)' } : { background: '#ffffff', border: '1px solid rgba(var(--color-primary-rgb), 0.16)', boxShadow: '0 2px 8px rgba(var(--color-primary-rgb), 0.12)' })
  const line = dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)'
  /* The hero is where the two differ most - the net-worth wallet in your
     accent, or a plain panel with its figure in ink - so the preview's top
     card is that. */
  const hero = flat
    ? { ...card, background: dark ? '#1c1c1f' : '#ffffff' }
    : { background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 55%, black), var(--color-primary))' }
  const heroLine = flat ? line : 'rgba(255,255,255,0.35)'
  const figure = flat ? (dark ? '#ffffff' : '#0f172a') : '#ffffff'
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={() => onPick(value)}
      className={`rounded-2xl p-2 text-left transition-shadow active:scale-[0.98] transition-transform ${
        on ? 'ring-2 ring-primary' : 'ring-1 ring-slate-200 dark:ring-white/[0.10]'
      }`}
    >
      <span className="block rounded-xl overflow-hidden h-[108px] p-2.5 relative" style={{ background: ground }} aria-hidden="true">
        <span className="block rounded-lg p-2" style={hero}>
          <span className="block h-1.5 w-8 rounded-full" style={{ background: heroLine }} />
          <span className="block mt-1.5 h-3 w-14 rounded-full" style={{ background: figure, opacity: 0.9 }} />
          <span className="block mt-2 h-1.5 w-full rounded-full" style={{ background: heroLine }} />
        </span>
        <span className="absolute inset-x-2.5 bottom-2.5 flex gap-1.5">
          <span className="flex-1 h-5 rounded-md" style={card} />
          <span className="flex-1 h-5 rounded-md" style={card} />
        </span>
      </span>
      <span className="block px-1 pt-2 pb-0.5">
        <span className="block text-13 font-semibold text-slate-900 dark:text-white">{label}</span>
        <span className="block text-11 text-slate-500 dark:text-slate-400 leading-snug">{hint}</span>
      </span>
    </button>
  )
}

/**
 * The net-worth reading, as a dropdown rather than a segmented pair.
 *
 * It was a card of its own with a two-up toggle and a paragraph under it,
 * which is a lot of screen for a binary that most ledgers never see. As a row
 * in Preferences it sits with the other things that change how the app
 * behaves, and the choice is two words.
 *
 * The select is laid over the chip at zero opacity rather than styled with
 * appearance-none - the same trick as the category chip in PeopleSplit, and
 * for the same two reasons: it keeps the native option list, the iOS wheel,
 * type-ahead and VoiceOver, while giving complete control of the closed
 * state and sidestepping every browser's own idea of a select arrow.
 */
function ModeSelect({ value, onChange, dark }) {
  const LABEL = { converted: 'Combined', separated: 'Separate' }
  return (
    <span
      className="relative inline-flex items-center gap-1 pl-3 pr-6 py-1.5 rounded-full
        text-12 font-semibold bg-slate-100 dark:bg-white/[0.07]
        text-slate-700 dark:text-slate-200"
    >
      {LABEL[value] ?? LABEL.converted}
      <svg
        className="absolute right-2 text-slate-400 dark:text-slate-500"
        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label="How net worth adds up accounts in different currencies"
        className="absolute inset-0 w-full h-full opacity-0"
        style={{ colorScheme: dark ? 'dark' : 'light' }}
      >
        <option value="converted">Combined</option>
        <option value="separated">Separate</option>
      </select>
    </span>
  )
}

/**
 * Reduce motion: every animation and transition in Spendr finishes as it
 * starts - sheets appear rather than slide, cards open without growing,
 * charts are drawn already drawn. The phone's own Reduce Motion does the
 * same on its own; with it on, this reads on and cannot be turned off here,
 * because the phone's answer is the one to respect.
 *
 * A real switch (role="switch", its own state announced), not a row that
 * looks like one: it is the one setting on this page that exists for
 * accessibility, so it is the one that most has to say what it is.
 */
function ReduceMotionRow() {
  const chosen = useReduceMotionChosen()
  const system = systemReducesMotion()
  return (
    <SettingsRow
      iconEl={<RowIcon color="slate"><PauseCircle size={18} strokeWidth={1.8} /></RowIcon>}
      label="Reduce motion"
      sublabel={system ? "On in your phone's settings" : 'Fewer animations and transitions'}
      right={<Switch on={chosen || system} onChange={(/** @type {boolean} */ v) => setReduceMotion(v)} label="Reduce motion" disabled={system} />}
    />
  )
}

// ── Toggle switch ──────────────────────────────────────────────────────────────

function ToggleSwitch({ on }) {
  return (
    <span className={`inline-flex items-center shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors duration-200 ${on ? 'bg-primary' : 'bg-slate-200 dark:bg-white/25'}`}>
      <span className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </span>
  )
}
