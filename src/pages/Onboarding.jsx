import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { PH_ACCOUNTS, PH_GROUPS, TYPE_ICON, CUSTOM_PALETTE } from '../lib/phAccounts'
import { EXPENSE_PRESETS, INFLOW_PRESETS, SYSTEM_CATS, EMOJI_SUGGESTIONS, CAT_PALETTE, LOCKED_EXPENSE, LOCKED_INFLOW } from '../lib/phCategories'

// ── Constants ──────────────────────────────────────────────────────────────────

const CURRENCIES = [
  { code: 'PHP', symbol: '₱', label: 'Philippine Peso' },
  { code: 'USD', symbol: '$',  label: 'US Dollar' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar' },
  { code: 'EUR', symbol: '€',  label: 'Euro' },
]

const CASH = { name: 'Cash', type: 'cash', color: '#10b981' }

const CUSTOM_TYPES = [
  { value: 'cash',    label: 'Cash'     },
  { value: 'ewallet', label: 'E-Wallet' },
  { value: 'bank',    label: 'Bank'     },
  { value: 'credit',  label: 'Credit'   },
]

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepDots({ current, total }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === current
              ? 'w-6 h-2 bg-primary'
              : i < current
              ? 'w-2 h-2 bg-primary/40'
              : 'w-2 h-2 bg-white/20'
          }`}
        />
      ))}
    </div>
  )
}

function SpendrLogo({ size = 64 }) {
  return (
    <img
      src="/icons/icon-512.png"
      alt="Spendr"
      style={{ width: size, height: size }}
    />
  )
}

// ── Step 0: Welcome ────────────────────────────────────────────────────────────

function StepWelcome({ onNext }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
      <SpendrLogo size={72} />

      <div>
        <h1 className="text-[32px] font-semibold tracking-tight text-white">Welcome to Spendr</h1>
        <p className="text-slate-400 mt-2 text-[15px]">Your finances, beautifully tracked.</p>
      </div>

      <div className="flex flex-col items-center gap-2.5 text-sm text-slate-500 mt-2">
        {['Track spending & income', 'Manage multiple accounts', 'Sync across devices'].map(f => (
          <div key={f} className="flex items-center gap-2.5">
            <span className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[11px] font-bold">✓</span>
            <span>{f}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="mt-6 w-full max-w-xs py-4 rounded-2xl bg-primary text-white font-bold text-[16px]
          shadow-[0_4px_24px_rgba(45,157,255,0.45)] active:scale-[0.98] transition-all duration-100"
      >
        Get Started →
      </button>
    </div>
  )
}

// ── Step 1: Name ───────────────────────────────────────────────────────────────

function StepName({ value, onChange, onNext }) {
  return (
    <div className="flex-1 flex flex-col gap-8">
      <div>
        <p className="text-primary text-xs font-bold uppercase tracking-widest mb-3">Step 1 of 7</p>
        <h2 className="text-[28px] font-semibold leading-tight text-white">
          What should<br />we call you?
        </h2>
        <p className="text-slate-500 mt-2 text-sm">A first name or nickname works great.</p>
      </div>

      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && value.trim() && onNext()}
        placeholder="Your name"
        autoFocus
        maxLength={40}
        className="w-full bg-white/[0.06] border border-white/[0.10] rounded-2xl px-5 py-4
          text-white text-[17px] placeholder:text-slate-600
          focus:outline-none focus:border-primary/60 focus:bg-white/[0.08]
          transition-colors"
      />

      <div className="mt-auto">
        <button
          onClick={onNext}
          disabled={!value.trim()}
          className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-[16px]
            shadow-[0_4px_24px_rgba(45,157,255,0.45)] active:scale-[0.98] transition-all duration-100
            disabled:opacity-40 disabled:shadow-none disabled:active:scale-100"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Currency ───────────────────────────────────────────────────────────

function StepCurrency({ value, onChange, onNext }) {
  return (
    <div className="flex-1 flex flex-col gap-8">
      <div>
        <p className="text-primary text-xs font-bold uppercase tracking-widest mb-3">Step 2 of 7</p>
        <h2 className="text-[28px] font-semibold leading-tight text-white">
          Your main<br />currency?
        </h2>
        <p className="text-slate-500 mt-2 text-sm">You can change this later in Settings.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CURRENCIES.map(({ code, symbol, label }) => (
          <button
            key={code}
            onClick={() => onChange(code)}
            className={`p-4 rounded-2xl border-2 text-left transition-all duration-100 active:scale-[0.97] ${
              value === code
                ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(45,157,255,0.3)]'
                : 'border-white/[0.08] bg-white/[0.04] active:bg-white/[0.08]'
            }`}
          >
            <div className="text-2xl font-semibold text-white leading-none">{symbol}</div>
            <div className="text-sm font-bold text-white mt-2">{code}</div>
            <div className="text-xs text-slate-400 mt-0.5 leading-tight">{label}</div>
          </button>
        ))}
      </div>

      <div className="mt-auto">
        <button
          onClick={onNext}
          className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-[16px]
            shadow-[0_4px_24px_rgba(45,157,255,0.45)] active:scale-[0.98] transition-all duration-100"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Pick accounts ──────────────────────────────────────────────────────

const COLOR_SWATCHES = ['#2D9DFF', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#ec4899']

function StepPickAccounts({ selectedNames, onToggle, customAccounts, onAddCustom, onRemoveCustom, onNext }) {
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customName,     setCustomName]     = useState('')
  const [customType,     setCustomType]     = useState('bank')
  const [customColor,    setCustomColor]    = useState(COLOR_SWATCHES[0])

  function addCustom() {
    const trimmed = customName.trim()
    if (!trimmed) return
    onAddCustom({ name: trimmed, type: customType, color: customColor })
    setCustomName('')
    setCustomType('bank')
    setCustomColor(COLOR_SWATCHES[0])
    setShowCustomForm(false)
  }

  function openCustomForm() {
    setCustomName('')
    setCustomType('bank')
    setCustomColor(COLOR_SWATCHES[0])
    setShowCustomForm(true)
  }

  const totalSelected = 1 + selectedNames.size + customAccounts.length // Cash always included

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      <div className="shrink-0">
        <p className="text-primary text-xs font-bold uppercase tracking-widest mb-3">Step 3 of 7</p>
        <h2 className="text-[28px] font-semibold leading-tight text-white">
          Which accounts<br />do you use?
        </h2>
        <p className="text-slate-500 mt-2 text-sm">Tap to select. Cash is always included.</p>
      </div>

      <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-5 pb-2">

        {/* Cash — locked */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">Always included</p>
          <div className="flex flex-wrap gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl
              bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-sm font-semibold">
              <span>💵</span> Cash <span className="text-[10px] opacity-70 ml-0.5">✓</span>
            </span>
          </div>
        </div>

        {/* PH account groups */}
        {PH_GROUPS.map(group => (
          <div key={group}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">{group}</p>
            <div className="flex flex-wrap gap-2">
              {PH_ACCOUNTS.filter(a => a.group === group).map(acct => {
                const sel = selectedNames.has(acct.name)
                return (
                  <button
                    key={acct.name}
                    onClick={() => onToggle(acct.name)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium
                      transition-all duration-100 active:scale-95 ${
                      sel
                        ? 'bg-primary/15 border-primary/50 text-primary'
                        : 'bg-white/[0.04] border-white/[0.08] text-slate-400 active:bg-white/[0.08]'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: acct.color }} />
                    {acct.name}
                    {sel && <span className="text-[10px] ml-0.5">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Custom accounts (already added) */}
        {customAccounts.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">Custom</p>
            <div className="flex flex-wrap gap-2">
              {customAccounts.map(acct => (
                <span key={acct.name}
                  className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-xl
                    bg-primary/15 border border-primary/50 text-primary text-sm font-medium">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: acct.color }} />
                  {acct.name}
                  <button
                    onClick={() => onRemoveCustom(acct.name)}
                    className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center
                      text-primary/60 hover:text-primary hover:bg-primary/20 transition-colors shrink-0"
                    aria-label={`Remove ${acct.name}`}
                  >
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/>
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={openCustomForm}
          className="flex items-center gap-2 text-sm text-slate-500 active:text-slate-300
            transition-colors active:scale-95 duration-100"
        >
          <span className="w-6 h-6 rounded-full border border-white/[0.12] flex items-center justify-center text-xs">+</span>
          Add custom account
        </button>
      </div>

      {/* Custom account modal */}
      {showCustomForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCustomForm(false)}
          />
          <div className="relative w-full max-w-sm bg-[#1a2130] border border-white/[0.12] rounded-3xl p-6 space-y-4 shadow-2xl">
            <div>
              <h3 className="text-base font-semibold text-white">Custom Account</h3>
              <p className="text-xs text-slate-500 mt-0.5">Name, type, and color.</p>
            </div>

            <input
              type="text"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustom()}
              placeholder="Account name"
              autoFocus
              maxLength={40}
              className="w-full bg-white/[0.06] border border-white/[0.10] rounded-2xl px-4 py-3
                text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-primary/60
                transition-colors"
            />

            <div className="grid grid-cols-4 gap-1.5">
              {CUSTOM_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setCustomType(t.value)}
                  className={`py-2 rounded-xl text-xs font-semibold transition-all duration-100 ${
                    customType === t.value
                      ? 'bg-primary text-white shadow-[0_2px_8px_rgba(45,157,255,0.4)]'
                      : 'bg-white/[0.06] text-slate-400 border border-white/[0.08]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Color picker */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2.5">Color</p>
              <div className="flex gap-2.5">
                {COLOR_SWATCHES.map(c => (
                  <button
                    key={c}
                    onClick={() => setCustomColor(c)}
                    className="relative w-7 h-7 rounded-full transition-transform duration-100 active:scale-90 shrink-0"
                    style={{ backgroundColor: c }}
                  >
                    {customColor === c && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-2.5 h-2.5 rounded-full bg-white/90 shadow-sm" />
                      </span>
                    )}
                    {customColor === c && (
                      <span
                        className="absolute inset-0 rounded-full"
                        style={{ boxShadow: `0 0 0 2px ${c}, 0 0 0 4px ${c}88` }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowCustomForm(false)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-slate-400
                  border border-white/[0.08] active:bg-white/[0.05] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addCustom}
                disabled={!customName.trim()}
                className="flex-[2] py-3 rounded-2xl text-sm font-semibold text-white
                  bg-primary disabled:opacity-40 disabled:shadow-none
                  shadow-[0_4px_16px_rgba(45,157,255,0.4)]
                  active:scale-[0.98] transition-all duration-100"
              >
                Add Account
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 pt-2">
        <button
          onClick={onNext}
          className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-[16px]
            shadow-[0_4px_24px_rgba(45,157,255,0.45)] active:scale-[0.98] transition-all duration-100"
        >
          Continue ({totalSelected} {totalSelected === 1 ? 'account' : 'accounts'}) →
        </button>
      </div>
    </div>
  )
}

// ── Step 4: Set starting balances ──────────────────────────────────────────────

function StepSetBalances({ allAccounts, balances, creditLimits, onBalanceChange, onCreditLimitChange, onSkip, onNext }) {
  return (
    <div className="flex-1 flex flex-col gap-5 min-h-0">
      <div className="shrink-0">
        <p className="text-primary text-xs font-bold uppercase tracking-widest mb-3">Step 4 of 7</p>
        <h2 className="text-[28px] font-semibold leading-tight text-white">
          Set starting<br />balances
        </h2>
        <p className="text-slate-500 mt-2 text-sm">Enter what you currently have. You can skip for now.</p>
      </div>

      {/* Ledger list — no cards, just rows divided by hairlines */}
      <div className="flex-1 overflow-y-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        <div className="divide-y divide-white/[0.06]">
          {allAccounts.map(acct => {
            const isCredit = acct.type === 'credit'
            const icon     = TYPE_ICON[acct.type] ?? '💰'
            return (
              <div key={acct.name} className="py-3.5">
                {/* Main row: icon + name + balance input */}
                <div className="flex items-center gap-3">
                  <span
                    className="text-base shrink-0 w-7 text-center"
                    style={{ filter: `drop-shadow(0 0 6px ${acct.color}88)` }}
                  >
                    {icon}
                  </span>

                  <div className="flex items-center gap-1.5 shrink-0 mr-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: acct.color }} />
                  </div>

                  <span className="flex-1 text-[15px] font-medium text-white truncate">{acct.name}</span>

                  {!isCredit && (
                    <div className="flex items-baseline gap-0.5 shrink-0">
                      <span className="text-slate-600 text-sm">₱</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={balances[acct.name] ?? ''}
                        onChange={e => onBalanceChange(acct.name, e.target.value)}
                        placeholder="0.00"
                        className="bg-transparent text-right text-white placeholder:text-slate-700
                          focus:outline-none text-[15px] tabular-nums w-28"
                      />
                    </div>
                  )}
                </div>

                {/* Credit sub-row: two inline fields */}
                {isCredit && (
                  <div className="mt-2 ml-10 flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Owed</p>
                      <div className="flex items-baseline gap-0.5 border-b border-white/[0.10] pb-0.5">
                        <span className="text-slate-600 text-xs">₱</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={balances[acct.name] ?? ''}
                          onChange={e => onBalanceChange(acct.name, e.target.value)}
                          placeholder="0"
                          className="w-full bg-transparent text-white placeholder:text-slate-700
                            focus:outline-none text-sm tabular-nums"
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Limit</p>
                      <div className="flex items-baseline gap-0.5 border-b border-white/[0.10] pb-0.5">
                        <span className="text-slate-600 text-xs">₱</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={creditLimits[acct.name] ?? ''}
                          onChange={e => onCreditLimitChange(acct.name, e.target.value)}
                          placeholder="0"
                          className="w-full bg-transparent text-white placeholder:text-slate-700
                            focus:outline-none text-sm tabular-nums"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="shrink-0 flex gap-3 pt-1">
        <button
          onClick={onSkip}
          className="flex-1 py-4 rounded-2xl border border-white/[0.10] text-slate-400 font-semibold
            text-[15px] active:scale-[0.98] transition-all duration-100 active:bg-white/[0.05]"
        >
          Skip
        </button>
        <button
          onClick={onNext}
          className="flex-[2] py-4 rounded-2xl bg-primary text-white font-bold text-[16px]
            shadow-[0_4px_24px_rgba(45,157,255,0.45)] active:scale-[0.98] transition-all duration-100"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

// ── Step 5 & 6: Pick categories ────────────────────────────────────────────────

const CAT_SWATCHES = CAT_PALETTE.slice(0, 7)

function StepPickCategories({ type, stepNum, locked, presets, selectedNames, onToggle, customCats, onAddCustom, onRemoveCustom, onNext }) {
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customName,     setCustomName]     = useState('')
  const [customIcon,     setCustomIcon]     = useState(EMOJI_SUGGESTIONS[0])
  const [customColor,    setCustomColor]    = useState(CAT_SWATCHES[0])

  const isExpense    = type === 'expense'
  const totalSelected = 1 + selectedNames.size + customCats.length

  function openCustomForm() {
    setCustomName(''); setCustomIcon(EMOJI_SUGGESTIONS[0]); setCustomColor(CAT_SWATCHES[0])
    setShowCustomForm(true)
  }

  function addCustom() {
    const trimmed = customName.trim()
    if (!trimmed) return
    onAddCustom({ name: trimmed, icon: customIcon, color: customColor, type })
    setCustomName(''); setCustomIcon(EMOJI_SUGGESTIONS[0]); setCustomColor(CAT_SWATCHES[0])
    setShowCustomForm(false)
  }

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      <div className="shrink-0">
        <p className="text-primary text-xs font-bold uppercase tracking-widest mb-3">Step {stepNum} of 7</p>
        <h2 className="text-[28px] font-semibold leading-tight text-white">
          {isExpense ? <>What do you<br />spend on?</> : <>What are your<br />income sources?</>}
        </h2>
        <p className="text-slate-500 mt-2 text-sm">
          Tap to select. &ldquo;{locked.name}&rdquo; is always included.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-5 pb-2">
        {/* Locked chip */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">Always included</p>
          <div className="flex flex-wrap gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl
              bg-white/[0.08] border border-white/[0.15] text-slate-300 text-sm font-semibold">
              <span>{locked.icon}</span> {locked.name}
              <span className="text-[10px] opacity-70 ml-0.5">✓</span>
            </span>
          </div>
        </div>

        {/* Preset chips */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">Suggestions</p>
          <div className="flex flex-wrap gap-2">
            {presets.map(cat => {
              const sel = selectedNames.has(cat.name)
              return (
                <button
                  key={cat.name}
                  onClick={() => onToggle(cat.name)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium
                    transition-all duration-100 active:scale-95 ${
                    sel
                      ? 'bg-primary/15 border-primary/50 text-primary'
                      : 'bg-white/[0.04] border-white/[0.08] text-slate-400 active:bg-white/[0.08]'
                  }`}
                >
                  <span>{cat.icon}</span>
                  {cat.name}
                  {sel && <span className="text-[10px] ml-0.5">✓</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Custom categories */}
        {customCats.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">Custom</p>
            <div className="flex flex-wrap gap-2">
              {customCats.map(cat => (
                <span key={cat.name}
                  className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-xl
                    bg-primary/15 border border-primary/50 text-primary text-sm font-medium">
                  <span>{cat.icon}</span>
                  {cat.name}
                  <button
                    onClick={() => onRemoveCustom(cat.name)}
                    className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center
                      text-primary/60 hover:text-primary hover:bg-primary/20 transition-colors shrink-0"
                    aria-label={`Remove ${cat.name}`}
                  >
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/>
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={openCustomForm}
          className="flex items-center gap-2 text-sm text-slate-500 active:text-slate-300
            transition-colors active:scale-95 duration-100"
        >
          <span className="w-6 h-6 rounded-full border border-white/[0.12] flex items-center justify-center text-xs">+</span>
          Add custom category
        </button>
      </div>

      {/* Custom category modal */}
      {showCustomForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCustomForm(false)}
          />
          <div className="relative w-full max-w-sm bg-[#1a2130] border border-white/[0.12] rounded-3xl p-6 space-y-4 shadow-2xl">
            <div>
              <h3 className="text-base font-semibold text-white">Custom Category</h3>
              <p className="text-xs text-slate-500 mt-0.5">Name, icon, and color.</p>
            </div>

            <input
              type="text"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustom()}
              placeholder="Category name"
              autoFocus
              maxLength={30}
              className="w-full bg-white/[0.06] border border-white/[0.10] rounded-2xl px-4 py-3
                text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-primary/60
                transition-colors"
            />

            {/* Emoji picker */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">Icon</p>
              <div className="grid grid-cols-8 gap-1 max-h-[108px] overflow-y-auto">
                {EMOJI_SUGGESTIONS.map(e => (
                  <button
                    key={e}
                    onClick={() => setCustomIcon(e)}
                    className={`h-9 rounded-xl flex items-center justify-center text-[18px]
                      active:scale-90 transition-all duration-75 ${
                      customIcon === e
                        ? 'bg-primary/20 ring-2 ring-primary/40'
                        : 'hover:bg-white/[0.06]'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Color swatches */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2.5">Color</p>
              <div className="flex gap-2.5">
                {CAT_SWATCHES.map(c => (
                  <button
                    key={c}
                    onClick={() => setCustomColor(c)}
                    className="relative w-7 h-7 rounded-full transition-transform duration-100 active:scale-90 shrink-0"
                    style={{ backgroundColor: c }}
                  >
                    {customColor === c && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-2.5 h-2.5 rounded-full bg-white/90 shadow-sm" />
                      </span>
                    )}
                    {customColor === c && (
                      <span
                        className="absolute inset-0 rounded-full"
                        style={{ boxShadow: `0 0 0 2px ${c}, 0 0 0 4px ${c}88` }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowCustomForm(false)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-slate-400
                  border border-white/[0.08] active:bg-white/[0.05] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addCustom}
                disabled={!customName.trim()}
                className="flex-[2] py-3 rounded-2xl text-sm font-semibold text-white
                  bg-primary disabled:opacity-40 disabled:shadow-none
                  shadow-[0_4px_16px_rgba(45,157,255,0.4)]
                  active:scale-[0.98] transition-all duration-100"
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 pt-2">
        <button
          onClick={onNext}
          className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-[16px]
            shadow-[0_4px_24px_rgba(45,157,255,0.45)] active:scale-[0.98] transition-all duration-100"
        >
          Continue ({totalSelected} {totalSelected === 1 ? 'category' : 'categories'}) →
        </button>
      </div>
    </div>
  )
}

// ── Step 7: Import or start fresh ─────────────────────────────────────────────

function StepImport({ onImport, onFresh, saving }) {
  return (
    <div className="flex-1 flex flex-col gap-8">
      <div>
        <p className="text-primary text-xs font-bold uppercase tracking-widest mb-3">Step 7 of 7</p>
        <h2 className="text-[28px] font-semibold leading-tight text-white">
          Have existing<br />data?
        </h2>
        <p className="text-slate-500 mt-2 text-sm">Import from a previous Spendr CSV export, or start fresh.</p>
      </div>

      <div className="flex flex-col gap-4 mt-2">
        <button
          onClick={onImport}
          disabled={saving}
          className="w-full p-5 rounded-2xl border-2 border-primary/30 bg-primary/[0.08] text-left
            active:scale-[0.98] transition-all duration-100 disabled:opacity-50 active:border-primary/50"
        >
          <div className="text-2xl mb-3">📁</div>
          <div className="font-bold text-[16px] text-white">Import from old Spendr</div>
          <div className="text-sm text-slate-400 mt-1">Upload a CSV export file to restore your history</div>
        </button>

        <button
          onClick={onFresh}
          disabled={saving}
          className="w-full p-5 rounded-2xl border-2 border-white/[0.08] bg-white/[0.03] text-left
            active:scale-[0.98] transition-all duration-100 disabled:opacity-50 active:bg-white/[0.07]"
        >
          <div className="text-2xl mb-3">✨</div>
          <div className="font-bold text-[16px] text-white">Start fresh</div>
          <div className="text-sm text-slate-400 mt-1">Begin with a clean slate</div>
        </button>
      </div>

      {saving && (
        <div className="flex justify-center">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

// ── Main Onboarding component ──────────────────────────────────────────────────

export default function Onboarding() {
  const navigate = useNavigate()
  const [step,                setStep]                = useState(0)
  const [name,                setName]                = useState('')
  const [currency,            setCurrency]            = useState('PHP')
  const [selectedNames,       setSelectedNames]       = useState(new Set())
  const [customAccounts,      setCustomAccounts]      = useState([])
  const [balances,            setBalances]            = useState({})
  const [creditLimits,        setCreditLimits]        = useState({})
  const [selectedExpenseNames, setSelectedExpenseNames] = useState(new Set())
  const [selectedInflowNames,  setSelectedInflowNames]  = useState(new Set())
  const [customExpenseCats,   setCustomExpenseCats]   = useState([])
  const [customInflowCats,    setCustomInflowCats]    = useState([])
  const [saving,              setSaving]              = useState(false)

  // If already onboarded, skip straight to dashboard
  useEffect(() => {
    db.meta.get('onboarded').then(meta => {
      if (meta?.value) navigate('/', { replace: true })
    })
  }, [navigate])

  // All selected accounts in order: Cash first, then PH picks, then custom
  const allAccounts = [
    CASH,
    ...PH_ACCOUNTS.filter(a => selectedNames.has(a.name)),
    ...customAccounts,
  ]

  function toggleName(name) {
    setSelectedNames(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function addCustomAccount(acct) {
    setCustomAccounts(prev => [...prev, acct])
  }

  function removeCustomAccount(name) {
    setCustomAccounts(prev => prev.filter(a => a.name !== name))
  }

  function setBalance(name, val) {
    setBalances(prev => ({ ...prev, [name]: val }))
  }

  function setCreditLimit(name, val) {
    setCreditLimits(prev => ({ ...prev, [name]: val }))
  }

  function toggleExpenseCat(name) {
    setSelectedExpenseNames(prev => {
      const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name); return next
    })
  }

  function toggleInflowCat(name) {
    setSelectedInflowNames(prev => {
      const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name); return next
    })
  }

  async function completeOnboarding(goToImport = false) {
    setSaving(true)
    try {
      const finalName = name.trim() || 'there'
      await db.meta.put({ key: 'userName',    value: finalName })
      await db.meta.put({ key: 'displayName', value: finalName })
      await db.meta.put({ key: 'currency',    value: currency  })

      // Update Cash (seeded in db.js) with starting balance
      const cashAcct = await db.accounts.where('name').equals('Cash').first()
      const cashBal  = parseFloat(balances['Cash'] ?? '') || 0
      if (cashAcct) {
        await db.accounts.update(cashAcct.id, { balance: cashBal, currency })
        await db.balances.put({ account: 'Cash', balance: cashBal })
      }

      // Add all other selected / custom accounts
      const toAdd = [
        ...PH_ACCOUNTS.filter(a => selectedNames.has(a.name)),
        ...customAccounts,
      ]

      for (const acct of toAdd) {
        const isCredit = acct.type === 'credit'
        const bal      = parseFloat(balances[acct.name]      ?? '') || 0
        const limit    = parseFloat(creditLimits[acct.name]  ?? '') || 0
        const row = {
          name:     acct.name,
          type:     acct.type,
          color:    acct.color,
          currency,
          balance:  bal,
          ...(isCredit ? {
            creditLimit:    limit,
            statementDate:  null,
            dueDate:        null,
            cutoffDate:     null,
            minimumPayment: 0,
          } : {}),
        }
        await db.accounts.add(row)
        await db.balances.put({ account: acct.name, balance: bal })
      }

      // Seed categories: locked system cats + user selections + custom
      const expenseCatsToSeed = [
        { ...LOCKED_EXPENSE, budget: 0 },
        ...EXPENSE_PRESETS.filter(p => selectedExpenseNames.has(p.name)).map(c => ({ ...c, budget: 0 })),
        ...customExpenseCats.map(c => ({ ...c, budget: 0 })),
      ]
      const inflowCatsToSeed = [
        { ...LOCKED_INFLOW, budget: 0 },
        ...INFLOW_PRESETS.filter(p => selectedInflowNames.has(p.name)).map(c => ({ ...c, budget: 0 })),
        ...customInflowCats.map(c => ({ ...c, budget: 0 })),
      ]
      // Transfer + Transfer Fee — always seeded silently
      const systemOnlyCats = SYSTEM_CATS
        .filter(s => s.name !== 'Others' && s.name !== 'Income')
        .map(c => ({ ...c, budget: 0 }))

      await db.categories.bulkAdd([...expenseCatsToSeed, ...inflowCatsToSeed, ...systemOnlyCats])

      await db.meta.put({ key: 'onboarded', value: true })
      navigate(goToImport ? '/import' : '/', { replace: true, state: goToImport ? { from: 'onboarding' } : undefined })
    } catch (e) {
      console.error('[Onboarding]', e)
      setSaving(false)
    }
  }

  const TOTAL_NON_WELCOME_STEPS = 7

  return (
    <div className="min-h-screen text-white relative flex flex-col">

      {/* Top bar: back + step dots */}
      <div
        className="relative z-10 flex items-center justify-between px-6 pb-2 shrink-0"
        style={{ paddingTop: 'max(3.5rem, calc(env(safe-area-inset-top, 0px) + 1rem))' }}
      >
        {step > 0 ? (
          <button
            onClick={() => setStep(s => s - 1)}
            className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center
              active:scale-95 transition-transform duration-100 active:bg-white/[0.14]"
            aria-label="Back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        ) : (
          <div className="w-9" />
        )}

        {step > 0 && <StepDots current={step - 1} total={TOTAL_NON_WELCOME_STEPS} />}

        <div className="w-9" />
      </div>

      {/* Step content */}
      <div
        key={step}
        className="relative z-10 flex-1 flex flex-col px-6 pt-4 page-enter min-h-0"
        style={{ paddingBottom: 'max(40px, env(safe-area-inset-bottom))' }}
      >
        {step === 0 && <StepWelcome onNext={() => setStep(1)} />}
        {step === 1 && <StepName value={name} onChange={setName} onNext={() => setStep(2)} />}
        {step === 2 && <StepCurrency value={currency} onChange={setCurrency} onNext={() => setStep(3)} />}
        {step === 3 && (
          <StepPickAccounts
            selectedNames={selectedNames}
            onToggle={toggleName}
            customAccounts={customAccounts}
            onAddCustom={addCustomAccount}
            onRemoveCustom={removeCustomAccount}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <StepSetBalances
            allAccounts={allAccounts}
            balances={balances}
            creditLimits={creditLimits}
            onBalanceChange={setBalance}
            onCreditLimitChange={setCreditLimit}
            onSkip={() => setStep(5)}
            onNext={() => setStep(5)}
          />
        )}
        {step === 5 && (
          <StepPickCategories
            type="expense"
            stepNum={5}
            locked={LOCKED_EXPENSE}
            presets={EXPENSE_PRESETS}
            selectedNames={selectedExpenseNames}
            onToggle={toggleExpenseCat}
            customCats={customExpenseCats}
            onAddCustom={cat => setCustomExpenseCats(prev => [...prev, cat])}
            onRemoveCustom={name => setCustomExpenseCats(prev => prev.filter(c => c.name !== name))}
            onNext={() => setStep(6)}
          />
        )}
        {step === 6 && (
          <StepPickCategories
            type="inflow"
            stepNum={6}
            locked={LOCKED_INFLOW}
            presets={INFLOW_PRESETS}
            selectedNames={selectedInflowNames}
            onToggle={toggleInflowCat}
            customCats={customInflowCats}
            onAddCustom={cat => setCustomInflowCats(prev => [...prev, cat])}
            onRemoveCustom={name => setCustomInflowCats(prev => prev.filter(c => c.name !== name))}
            onNext={() => setStep(7)}
          />
        )}
        {step === 7 && (
          <StepImport
            onImport={() => completeOnboarding(true)}
            onFresh={() => completeOnboarding(false)}
            saving={saving}
          />
        )}
      </div>
    </div>
  )
}
