import { Fragment } from 'react'
import { ACCOUNT_TYPE_ICON, IconCashUI } from '../../components/icons'
import Divider from '../../components/ui/Divider'

// ── Step 4: Set starting balances ──────────────────────────────────────────────

export function StepSetBalances({ allAccounts, balances, creditLimits, onBalanceChange, onCreditLimitChange, onSkip, onNext }) {
  return (
    <div className="flex-1 flex flex-col gap-5 min-h-0">
      <div className="shrink-0">
        <p className="text-primary text-xs font-bold mb-3">Step 4 of 6</p>
        <h2 className="text-[28px] font-semibold leading-tight text-white">
          Set starting<br />balances
        </h2>
        <p className="text-slate-500 mt-2 text-sm">Enter what you currently have. You can skip for now.</p>
      </div>

      {/* Ledger list — no cards, just rows divided by hairlines */}
      <div className="flex-1 overflow-y-auto pb-2 no-scrollbar">
        <div>
          {allAccounts.map((acct, i) => {
            const isCredit = acct.type === 'credit'
            const Icon     = ACCOUNT_TYPE_ICON[acct.type] ?? IconCashUI
            return (
              /* `divide-y` drew the line between rows and nowhere else; the
                 hairline is its own element now, so it is asked for on every
                 row but the first. Full bleed, because the rows are: nothing
                 in this list is inside a card. */
              <Fragment key={acct.name}>
                {i > 0 && <Divider />}
                <div className="py-3.5">
                  {/* Main row: icon + name + balance input */}
                  <div className="flex items-center gap-3">
                    {/* The glow survives the swap - drop-shadow applies to
                        an SVG the same as to a glyph - and the icon now takes
                        the account's own colour, which the emoji could not. */}
                    <span
                      className="shrink-0 w-7 flex items-center justify-center"
                      style={{ color: acct.color, filter: `drop-shadow(0 0 6px ${acct.color}88)` }}
                    >
                      <Icon size={18} />
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
                        <p className="text-xs text-slate-600 mb-1">Owed</p>
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
                        <p className="text-xs text-slate-600 mb-1">Limit</p>
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
              </Fragment>
            )
          })}
        </div>
      </div>

      <div className="shrink-0 flex gap-3 pt-1">
        <button
          onClick={onSkip}
          className="flex-1 py-4 rounded-full border border-white/[0.10] text-slate-400 font-semibold
            text-[15px] active:scale-[0.98] transition-all duration-100 active:bg-white/[0.05]"
        >
          Skip
        </button>
        <button
          onClick={onNext}
          className="flex-[2] py-4 rounded-2xl bg-primary text-white font-bold text-[16px]
             active:scale-[0.98] transition-all duration-100"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
