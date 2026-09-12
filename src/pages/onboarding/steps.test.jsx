// @vitest-environment jsdom
/**
 * Render tests for the onboarding steps.
 *
 * These exist because onboarding is the one flow the visual harness cannot
 * reach: it renders only when the `onboarded` meta flag is absent, so getting
 * a screenshot of it means clearing the database the rest of the checks are
 * measured against. Splitting Onboarding.jsx into five modules was therefore
 * the one refactor with no pixel diff to back it up - so it gets assertions
 * instead.
 *
 * They are deliberately shallow. What is worth pinning here is that each step
 * mounts, shows the copy a first-time user is meant to read, and reports the
 * choice they make - not the exact markup, which is the part that is supposed
 * to be free to change.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { StepDots, StepName, StepCurrency, StepWelcome } from './StepsIntro'
import { StepSetBalances } from './StepBalances'
import { StepDone } from './StepCategories'
import { CURRENCIES, CUSTOM_TYPES, CASH } from './shared'

afterEach(cleanup)

describe('shared constants', () => {
  it('offers the peso first, since this is a Philippine app', () => {
    expect(CURRENCIES[0].code).toBe('PHP')
    expect(CURRENCIES[0].symbol).toBe('₱')
  })

  it('always gives a new user a Cash account', () => {
    expect(CASH).toEqual({ name: 'Cash', type: 'cash', color: '#10b981' })
  })

  it('offers exactly the four account types onboarding can create', () => {
    expect(CUSTOM_TYPES.map(t => t.value)).toEqual(['cash', 'ewallet', 'bank', 'credit'])
  })
})

describe('StepDots', () => {
  it('draws one dot per step, and marks the current one wider', () => {
    const { container } = render(<StepDots current={2} total={7} />)
    // .rounded-full, not 'div > div': testing-library's own wrapper is a div
    // and counted as an eighth.
    const dots = [...container.querySelectorAll('.rounded-full')]
    expect(dots.length).toBe(7)
    // The position is carried by width, not colour alone - which is the only
    // reason this is worth asserting.
    expect(dots.filter(d => d.className.includes('w-6')).length).toBe(1)
  })
})

describe('StepWelcome', () => {
  it('offers both a start and a sign-in, and reports which was pressed', () => {
    const onNext = vi.fn()
    const onSignIn = vi.fn()
    render(<StepWelcome onNext={onNext} onSignIn={onSignIn} signingIn={false} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(buttons[0])
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})

describe('StepName', () => {
  it('reports what is typed', () => {
    const onChange = vi.fn()
    render(<StepName value="" onChange={onChange} onNext={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'James' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('will not continue on an empty name', () => {
    const onNext = vi.fn()
    render(<StepName value="" onChange={vi.fn()} onNext={onNext} />)
    const next = screen.getAllByRole('button').at(-1)
    expect(next.disabled).toBe(true)
  })

  it('continues once there is one', () => {
    const onNext = vi.fn()
    render(<StepName value="James" onChange={vi.fn()} onNext={onNext} />)
    const next = screen.getAllByRole('button').at(-1)
    expect(next.disabled).toBe(false)
    fireEvent.click(next)
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})

describe('StepCurrency', () => {
  it('lists every currency and reports the pick', () => {
    const onChange = vi.fn()
    render(<StepCurrency value="PHP" onChange={onChange} onNext={vi.fn()} />)
    for (const c of CURRENCIES) expect(screen.getByText(c.label)).toBeTruthy()
    fireEvent.click(screen.getByText('US Dollar'))
    expect(onChange).toHaveBeenCalledWith('USD')
  })
})

describe('StepSetBalances', () => {
  const accounts = [
    { name: 'Cash', type: 'cash', color: '#10b981' },
    { name: 'BPI', type: 'bank', color: '#b91c1c' },
  ]

  it('asks for a balance per account', () => {
    render(
      <StepSetBalances
        allAccounts={accounts}
        balances={{}}
        creditLimits={{}}
        onBalanceChange={vi.fn()}
        onCreditLimitChange={vi.fn()}
        onSkip={vi.fn()}
        onNext={vi.fn()}
      />,
    )
    expect(screen.getByText('Cash')).toBeTruthy()
    expect(screen.getByText('BPI')).toBeTruthy()
  })

  it('lets the whole step be skipped, because a balance can wait', () => {
    const onSkip = vi.fn()
    render(
      <StepSetBalances
        allAccounts={accounts}
        balances={{}}
        creditLimits={{}}
        onBalanceChange={vi.fn()}
        onCreditLimitChange={vi.fn()}
        onSkip={onSkip}
        onNext={vi.fn()}
      />,
    )
    const skip = screen.getAllByRole('button').find(b => /skip/i.test(b.textContent))
    expect(skip).toBeTruthy()
    fireEvent.click(skip)
    expect(onSkip).toHaveBeenCalledTimes(1)
  })
})

describe('StepDone', () => {
  it('finishes', () => {
    const onFinish = vi.fn()
    render(<StepDone onFinish={onFinish} saving={false} />)
    fireEvent.click(screen.getAllByRole('button').at(-1))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('does not let a double tap save twice', () => {
    const onFinish = vi.fn()
    render(<StepDone onFinish={onFinish} saving />)
    expect(screen.getAllByRole('button').at(-1).disabled).toBe(true)
  })
})
