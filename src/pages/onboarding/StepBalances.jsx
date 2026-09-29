import { forwardRef } from 'react'
import Button from '../../components/ui/Button'
import MoneyField from '../../components/ui/MoneyField'
import { accountBrand } from '../../lib/accountBrands'
import { TYPE_LABEL } from '../../lib/accountMeta'
import { moneyChangeHandler } from '../../utils/moneyInput'
import { baseDecimals } from '../../lib/money'
import { Heading, StepBody, StepFooter } from './parts'

/**
 * How much is in each?
 *
 * One field per account picked, under a sliver of its own card face so the
 * row is recognisably the card on the stage - where the total adds up as the
 * numbers go in. A credit card asks what is owed and its limit instead.
 * All of it can be skipped: a balance is a correction away later.
 */

/**
 * @param {{accounts: Array<{name: string, type: string, color: string}>, balances: Record<string, string>,
 *          limits: Record<string, string>, currency: string, onBalance: (name: string, v: string) => void,
 *          onLimit: (name: string, v: string) => void, onNext: () => void, onSkip: () => void}} props
 */
export const StepBalances = forwardRef(
  /** @param {any} props @param {import('react').Ref<HTMLHeadingElement>} ref */
  function StepBalances({ accounts, balances, limits, currency, onBalance, onLimit, onNext, onSkip }, ref) {
    return (
      <>
        <StepBody>
          <Heading ref={ref} title="How much is in each?" sub="A rough number is fine. You can skip this." />
          <div className="flex flex-col gap-3">
            {accounts.map(acct => {
              const brand = accountBrand(acct)
              const credit = acct.type === 'credit'
              /* Cash is its own kind; saying so twice reads as a stutter. */
              const kind = credit ? 'Credit card' : TYPE_LABEL[/** @type {keyof typeof TYPE_LABEL} */ (acct.type)] ?? ''
              const showKind = kind && kind.toLowerCase() !== acct.name.toLowerCase()
              return (
                <div key={acct.name} className="card rounded-3xl p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="acct-card w-10 h-[26px] rounded-md shrink-0"
                      style={{ '--card-from': brand.from, '--card-to': brand.to }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 min-w-0 text-15 font-semibold text-white truncate">{acct.name}</span>
                    {showKind && <span className="text-12 text-slate-400 shrink-0">{kind}</span>}
                  </div>
                  {credit ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-12 font-medium text-slate-400 pl-2">Owed now</span>
                        <MoneyField
                          value={balances[acct.name] ?? ''}
                          onChange={moneyChangeHandler(v => onBalance(acct.name, v), baseDecimals(currency))}
                          currency={currency}
                          aria-label={`${acct.name}, owed now`}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-12 font-medium text-slate-400 pl-2">Limit</span>
                        <MoneyField
                          value={limits[acct.name] ?? ''}
                          onChange={moneyChangeHandler(v => onLimit(acct.name, v), baseDecimals(currency))}
                          currency={currency}
                          aria-label={`${acct.name}, credit limit`}
                        />
                      </label>
                    </div>
                  ) : (
                    <MoneyField
                      value={balances[acct.name] ?? ''}
                      onChange={moneyChangeHandler(v => onBalance(acct.name, v), baseDecimals(currency))}
                      currency={currency}
                      aria-label={`${acct.name}, balance`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </StepBody>
        <StepFooter>
          <Button size="lg" block onClick={onNext}>Continue</Button>
          <Button size="lg" block variant="quiet" onClick={onSkip}>Skip for now</Button>
        </StepFooter>
      </>
    )
  },
)
