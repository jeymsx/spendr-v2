import { useState } from 'react'
import { PH_ACCOUNTS, PH_GROUPS, POPULAR_ACCOUNTS } from '../../lib/phAccounts'
import { IconTick } from '../../components/icons'
import Button from '../../components/ui/Button'
import SectionLabel from '../../components/ui/SectionLabel'
import Divider from '../../components/ui/Divider'
import { CUSTOM_TYPES } from './shared'
import Rail from '../../components/ui/Rail'
import SearchField from '../../components/ui/SearchField'

// ── Step 3: Pick accounts ──────────────────────────────────────────────────────

export const COLOR_SWATCHES = ['#2D9DFF', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#ec4899']

/**
 * A caption with a rule running off the end of it.
 *
 * The caption and the hairline are both the shared primitives now; what is
 * left here is the arrangement, which no other screen has.
 *
 * The two margins are the arrangement too. SectionLabel carries 6px under
 * itself for the field it usually names, and in a centred flex row that 6px
 * would drop the rule 3px below the caption's middle - so the rule takes the
 * same 6px and the two centre together. The wrapper then only owes the
 * remaining 4px of the 10px gap that used to sit under the whole thing.
 */
export function OnbSectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2.5 mb-1">
      <SectionLabel className="shrink-0">{children}</SectionLabel>
      <Divider className="flex-1 mb-1.5" />
    </div>
  )
}

export function StepPickAccounts({ selectedNames, onToggle, customAccounts, onAddCustom, onRemoveCustom, onNext }) {
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customName,     setCustomName]     = useState('')
  const [customType,     setCustomType]     = useState('bank')
  const [customColor,    setCustomColor]    = useState(COLOR_SWATCHES[0])
  const [query,          setQuery]          = useState('')

  function addCustom() {
    const trimmed = customName.trim()
    if (!trimmed) return
    onAddCustom({ name: trimmed, type: customType, color: customColor })
    setCustomName('')
    setCustomType('bank')
    setCustomColor(COLOR_SWATCHES[0])
    setShowCustomForm(false)
  }

  const q        = query.toLowerCase().trim()
  const filtered = q ? PH_ACCOUNTS.filter(a => a.name.toLowerCase().includes(q)) : null

  const totalSelected = 1 + selectedNames.size + customAccounts.length // Cash always included

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      <div className="shrink-0">
        <p className="text-primary text-xs font-bold mb-3">Step 3 of 6</p>
        <h2 className="text-28 font-semibold leading-tight text-white">
          Which accounts<br />do you use?
        </h2>
        <p className="text-slate-500 mt-2 text-sm">Tap to select. Cash is always included.</p>
      </div>

      {/* Search.

          `onDark` because this flow paints its own dark ground whatever the
          theme is - the field's theme-answering colours would come out
          white-on-near-white here. */}
      <div className="shrink-0">
        <SearchField
          tone="onDark"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onClear={() => setQuery('')}
          placeholder="Search accounts…"
        />
      </div>

      <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-5 pb-2"
        style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>

        {filtered ? (
          /* ── Search results ── */
          <div>
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No accounts match "{query}"</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {filtered.map(acct => {
                  const sel = selectedNames.has(acct.name)
                  return (
                    <button
                      key={acct.name}
                      onClick={() => onToggle(acct.name)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-2xl border text-sm font-medium
                        transition-all duration-100 active:scale-[0.94] ${
                        sel
                          ? 'bg-primary/15 border-primary/50 text-primary'
                          : 'bg-white/[0.04] border-white/[0.08] text-slate-300'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: acct.color }} />
                      {acct.name}
                      {sel && <IconTick size={11} />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Cash — locked */}
            <div>
              <OnbSectionLabel>Always included</OnbSectionLabel>
              <div className="flex flex-wrap gap-2">
                <span className="flex items-center gap-2 px-3 py-2 rounded-2xl
                  bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 text-sm font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  Cash
                  <span className="opacity-70"><IconTick size={11} /></span>
                </span>
              </div>
            </div>

            {/* Popular */}
            <div>
              <OnbSectionLabel>Popular</OnbSectionLabel>
              <Rail
                className="gap-2.5 pb-1 -mx-1 px-1"
              >
                {POPULAR_ACCOUNTS.map(acct => {
                  const sel = selectedNames.has(acct.name)
                  return (
                    <button
                      key={acct.name}
                      onClick={() => onToggle(acct.name)}
                      className={`shrink-0 flex flex-col gap-0.5 px-4 py-3 rounded-2xl border text-left
                        transition-all duration-100 active:scale-[0.96] min-w-[100px] ${
                        sel
                          ? 'bg-primary/15 border-primary/50'
                          : 'bg-white/[0.04] border-white/[0.09]'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: acct.color }} />
                      <span className={`text-sm font-semibold mt-2 leading-tight ${sel ? 'text-primary' : 'text-white'}`}>
                        {acct.name}
                      </span>
                      {sel && (
                        <span className="text-10 text-primary/70 flex items-center gap-1">
                          <IconTick size={10} /> Selected
                        </span>
                      )}
                    </button>
                  )
                })}
              </Rail>
            </div>

            {/* PH account groups */}
            {PH_GROUPS.map(group => (
              <div key={group}>
                <OnbSectionLabel>{group}</OnbSectionLabel>
                <div className="flex flex-wrap gap-2">
                  {PH_ACCOUNTS.filter(a => a.group === group).map(acct => {
                    const sel = selectedNames.has(acct.name)
                    return (
                      <button
                        key={acct.name}
                        onClick={() => onToggle(acct.name)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-2xl border text-sm font-medium
                          transition-all duration-100 active:scale-[0.94] ${
                          sel
                            ? 'bg-primary/15 border-primary/50 text-primary'
                            : 'bg-white/[0.04] border-white/[0.08] text-slate-300'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: acct.color }} />
                        {acct.name}
                        {sel && <IconTick size={11} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Custom accounts added */}
            {customAccounts.length > 0 && (
              <div>
                <OnbSectionLabel>Custom</OnbSectionLabel>
                <div className="flex flex-wrap gap-2">
                  {customAccounts.map(acct => (
                    <span key={acct.name}
                      className="flex items-center gap-2 pl-3 pr-1.5 py-2 rounded-2xl
                        bg-primary/15 border border-primary/50 text-primary text-sm font-medium">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: acct.color }} />
                      {acct.name}
                      <button
                        onClick={() => onRemoveCustom(acct.name)}
                        className="ml-0.5 w-5 h-5 rounded-full flex items-center justify-center
                          bg-primary/20 text-primary/70 active:bg-primary/35 transition-colors shrink-0"
                        aria-label={`Remove ${acct.name}`}
                      >
                        <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/>
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { setCustomName(''); setCustomType('bank'); setCustomColor(COLOR_SWATCHES[0]); setShowCustomForm(true) }}
              className="flex items-center gap-2 text-sm text-slate-500 active:text-slate-300 transition-colors active:scale-95"
            >
              <span className="w-6 h-6 rounded-full border border-white/[0.12] flex items-center justify-center text-xs">+</span>
              Add custom account
            </button>
          </>
        )}
      </div>

      {/* Custom account modal */}
      {showCustomForm && (
        /* design-ok: not a Sheet, and it cannot be one. Sheet's panel is
            `bg-panel`, which is theme-aware - and this screen is drawn in the
            dark palette whatever the theme setting (28 unconditional
            `text-white`, not one `dark:` variant), so a Sheet here would be a
            white panel on a dark screen in light mode. It also runs before the
            app shell exists, where Sheet's scroll lock and stacking order have
            nothing to sit in. Centred, and dismissed by the backdrop. */
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          role="dialog"
          aria-modal="true"
          aria-label="Custom account"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCustomForm(false)} />
          <div className="relative w-full max-w-sm bg-dark-lifted border border-white/[0.12] rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Custom account</h3>
            <input
              type="text"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustom()}
              placeholder="Account name"
              autoFocus
              maxLength={40}
              className="w-full bg-white/[0.06] border border-white/[0.10] rounded-2xl px-4 py-3
                text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-primary/60 transition-colors"
            />
            <div className="grid grid-cols-4 gap-1.5">
              {CUSTOM_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setCustomType(t.value)}
                  className={`py-2 rounded-xl text-xs font-semibold transition-all duration-100 ${
                    customType === t.value
                      ? 'bg-primary text-white'
                      : 'bg-white/[0.06] text-slate-400 border border-white/[0.08]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div>
              <SectionLabel>Color</SectionLabel>
              <div className="flex gap-2.5">
                {COLOR_SWATCHES.map(c => (
                  <button
                    key={c}
                    onClick={() => setCustomColor(c)}
                    className="relative w-7 h-7 rounded-full transition-transform duration-100 active:scale-90 shrink-0"
                    style={{ backgroundColor: c }}
                  >
                    {customColor === c && (
                      <>
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="w-2.5 h-2.5 rounded-full bg-white/90 shadow-sm" />
                        </span>
                        <span className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 0 2px ${c}, 0 0 0 4px ${c}88` }} />
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowCustomForm(false)}
                className="flex-1 py-3 rounded-full text-sm font-semibold text-slate-400
                  border border-white/[0.08] active:bg-white/[0.05] transition-colors"
              >
                Cancel
              </button>
              <Button
                size="sm"
                className="flex-[2]"
                onClick={addCustom} disabled={!customName.trim()}
              >
                Add account
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 pt-2">
        <button
          onClick={onNext}
          className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-16
             active:scale-[0.98] transition-all duration-100"
        >
          Continue ({totalSelected} {totalSelected === 1 ? 'account' : 'accounts'}) →
        </button>
      </div>
    </div>
  )
}
