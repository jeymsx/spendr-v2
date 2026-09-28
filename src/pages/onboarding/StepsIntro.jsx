import { forwardRef } from 'react'
import Button from '../../components/ui/Button'
import { CURRENCIES } from './shared'
import { GoogleG, Heading, StepBody, StepFooter } from './parts'

/**
 * The first three steps: hello, your name, and - outside the Philippines
 * only - your currency.
 */

// ── Welcome ────────────────────────────────────────────────────────────────

/**
 * @param {{onNext: () => void, onSignIn: (() => void) | null, signingIn: boolean}} props
 */
export const StepWelcome = forwardRef(
  /** @param {{onNext: () => void, onSignIn: (() => void) | null, signingIn: boolean}} props @param {import('react').Ref<HTMLHeadingElement>} ref */
  function StepWelcome({ onNext, onSignIn, signingIn }, ref) {
    return (
      <>
        <StepBody className="justify-center text-center items-center">
          <Heading
            ref={ref}
            title="Know where your money goes"
            sub="Spending, bills and savings in one place. Free, and it works offline."
          />
        </StepBody>
        <StepFooter>
          <Button size="lg" block onClick={onNext}>Get started</Button>
          {/* Only where there is an account to sign in to: a build with no
              cloud has nothing behind this button. */}
          {onSignIn && (
            <Button size="lg" block variant="secondary" onClick={onSignIn} loading={signingIn}>
              {!signingIn && <GoogleG />}
              I already have an account
            </Button>
          )}
        </StepFooter>
      </>
    )
  },
)

// ── Name ───────────────────────────────────────────────────────────────────

/**
 * @param {{value: string, onChange: (v: string) => void, onNext: () => void}} props
 */
export const StepName = forwardRef(
  /** @param {{value: string, onChange: (v: string) => void, onNext: () => void}} props @param {import('react').Ref<HTMLHeadingElement>} ref */
  function StepName({ value, onChange, onNext }, ref) {
    const ok = value.trim().length > 0
    return (
      <>
        <StepBody>
          <Heading ref={ref} title="What should we call you?" sub="A first name or a nickname." />
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && ok) onNext() }}
            placeholder="Your name"
            aria-label="Your name"
            autoComplete="given-name"
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={40}
            className="w-full rounded-2xl px-5 py-4 text-17 text-white placeholder:text-slate-500
              bg-white/[0.06] border border-white/[0.12] outline-none
              focus:border-primary/70 focus:bg-white/[0.08] transition-colors"
          />
        </StepBody>
        <StepFooter>
          <Button size="lg" block onClick={onNext} disabled={!ok}>Continue</Button>
        </StepFooter>
      </>
    )
  },
)

// ── Currency ───────────────────────────────────────────────────────────────

/**
 * Only asked outside the Philippines, with the likeliest already ticked.
 *
 * @param {{value: string, onChange: (v: string) => void, onNext: () => void}} props
 */
export const StepCurrency = forwardRef(
  /** @param {{value: string, onChange: (v: string) => void, onNext: () => void}} props @param {import('react').Ref<HTMLHeadingElement>} ref */
  function StepCurrency({ value, onChange, onNext }, ref) {
    return (
      <>
        <StepBody>
          <Heading ref={ref} title="Your main currency" sub="Everything adds up in this one. You can change it in Settings." />
          <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Main currency">
            {CURRENCIES.map(({ code, symbol, label }) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={value === code}
                onClick={() => onChange(code)}
                className="onb-choice press rounded-2xl p-4 text-left"
              >
                <span className="block text-22 font-semibold text-white leading-none">{symbol}</span>
                <span className="block text-14 font-semibold text-white mt-2">{code}</span>
                <span className="block text-12 text-slate-400 mt-0.5 leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </StepBody>
        <StepFooter>
          <Button size="lg" block onClick={onNext}>Continue</Button>
        </StepFooter>
      </>
    )
  },
)
