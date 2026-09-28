// @vitest-environment jsdom
/**
 * Render tests for the onboarding steps.
 *
 * These exist because onboarding is the one flow the visual harness cannot
 * reach: it renders only when the `onboarded` meta flag is absent, so getting
 * a screenshot of it means clearing the database the rest of the checks are
 * measured against. So it gets assertions instead.
 *
 * They are deliberately shallow. What is worth pinning here is that each step
 * mounts, shows the copy a first-time user is meant to read, and reports the
 * choice they make - not the exact markup, which is the part that is supposed
 * to be free to change.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { StepName, StepCurrency, StepWelcome } from './StepsIntro'
import { StepBalances } from './StepBalances'
import { StepStayOnTrack } from './StepStayOnTrack'
import { StepDone } from './StepDone'
import InstallGuide from '../../components/InstallGuide'
import { CURRENCIES, CUSTOM_TYPES, CASH } from './shared'

afterEach(cleanup)

const buttonNamed = (/** @type {RegExp} */ re) => screen.getAllByRole('button').find(b => re.test(b.textContent ?? ''))

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

describe('StepWelcome', () => {
  it('starts, and signs in where there is an account to sign in to', () => {
    const onNext = vi.fn()
    const onSignIn = vi.fn()
    render(<StepWelcome onNext={onNext} onSignIn={onSignIn} signingIn={false} />)
    fireEvent.click(buttonNamed(/get started/i))
    fireEvent.click(buttonNamed(/already have an account/i))
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onSignIn).toHaveBeenCalledTimes(1)
  })

  it('offers no sign-in when there is no cloud to sign in to', () => {
    render(<StepWelcome onNext={vi.fn()} onSignIn={null} signingIn={false} />)
    expect(buttonNamed(/already have an account/i)).toBeUndefined()
  })
})

describe('StepName', () => {
  it('reports what is typed', () => {
    const onChange = vi.fn()
    render(<StepName value="" onChange={onChange} onNext={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'James' } })
    expect(onChange).toHaveBeenCalledWith('James')
  })

  it('will not continue on an empty name', () => {
    render(<StepName value="  " onChange={vi.fn()} onNext={vi.fn()} />)
    expect(/** @type {HTMLButtonElement} */ (buttonNamed(/continue/i)).disabled).toBe(true)
  })

  it('continues once there is one, from the button or the keyboard', () => {
    const onNext = vi.fn()
    render(<StepName value="James" onChange={vi.fn()} onNext={onNext} />)
    fireEvent.click(buttonNamed(/continue/i))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onNext).toHaveBeenCalledTimes(2)
  })
})

describe('StepCurrency', () => {
  it('lists every currency as a choice and reports the pick', () => {
    const onChange = vi.fn()
    render(<StepCurrency value="PHP" onChange={onChange} onNext={vi.fn()} />)
    expect(screen.getAllByRole('radio')).toHaveLength(CURRENCIES.length)
    fireEvent.click(screen.getByText('US Dollar'))
    expect(onChange).toHaveBeenCalledWith('USD')
  })
})

describe('StepBalances', () => {
  const accounts = [
    { name: 'Cash', type: 'cash', color: '#10b981' },
    { name: 'BPI', type: 'bank', color: '#b91c1c' },
    { name: 'BPI Credit', type: 'credit', color: '#7f1d1d' },
  ]
  const props = {
    accounts, balances: {}, limits: {}, currency: 'PHP',
    onBalance: vi.fn(), onLimit: vi.fn(), onNext: vi.fn(), onSkip: vi.fn(),
  }

  it('asks for a balance per account, and owed plus limit for a card', () => {
    render(<StepBalances {...props} />)
    expect(screen.getByLabelText('Cash, balance')).toBeTruthy()
    expect(screen.getByLabelText('BPI, balance')).toBeTruthy()
    expect(screen.getByLabelText('BPI Credit, owed now')).toBeTruthy()
    expect(screen.getByLabelText('BPI Credit, credit limit')).toBeTruthy()
  })

  it('reports a typed balance, formatted the way money fields are', () => {
    const onBalance = vi.fn()
    render(<StepBalances {...props} onBalance={onBalance} />)
    fireEvent.change(screen.getByLabelText('BPI, balance'), { target: { value: '12500' } })
    expect(onBalance).toHaveBeenCalledWith('BPI', '12,500')
  })

  it('lets the whole step be skipped, because a balance can wait', () => {
    const onSkip = vi.fn()
    render(<StepBalances {...props} onSkip={onSkip} />)
    fireEvent.click(buttonNamed(/skip/i))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })
})

describe('StepStayOnTrack', () => {
  const base = {
    signedIn: false, onSignIn: vi.fn(), signingIn: false, push: 'ok', time: '20:00',
    onTime: vi.fn(), onEnable: vi.fn(async () => ({ ok: true })), onNext: vi.fn(),
  }

  it('offers the Google backup first, or not now', () => {
    const onSignIn = vi.fn()
    const onNext = vi.fn()
    render(<StepStayOnTrack {...base} onSignIn={onSignIn} onNext={onNext} />)
    fireEvent.click(buttonNamed(/continue with google/i))
    fireEvent.click(buttonNamed(/not now/i))
    expect(onSignIn).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('once signed in, offers the nudge at a time and moves on when it is on', async () => {
    const onEnable = vi.fn(async () => ({ ok: true }))
    const onNext = vi.fn()
    const onTime = vi.fn()
    render(<StepStayOnTrack {...base} signedIn onEnable={onEnable} onNext={onNext} onTime={onTime} />)
    fireEvent.click(screen.getByRole('radio', { name: '9 PM' }))
    expect(onTime).toHaveBeenCalledWith('21:00')
    fireEvent.click(buttonNamed(/remind me at 8:00 PM/i))
    await vi.waitFor(() => expect(onNext).toHaveBeenCalledTimes(1))
    expect(onEnable).toHaveBeenCalledTimes(1)
  })

  it('says why, and stays, when notifications are refused', async () => {
    const onNext = vi.fn()
    render(<StepStayOnTrack {...base} signedIn onEnable={async () => ({ ok: false, reason: 'blocked' })} onNext={onNext} />)
    fireEvent.click(buttonNamed(/remind me/i))
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('on an iPhone still in Safari, says the nudge waits for the Home Screen', () => {
    render(<StepStayOnTrack {...base} signedIn push="ios-install" />)
    expect(screen.getByText(/add Spendr to your Home Screen/i)).toBeTruthy()
    expect(buttonNamed(/remind me/i)).toBeUndefined()
  })
})

describe('StepDone', () => {
  it('says what was made, and finishes', () => {
    const onFinish = vi.fn()
    render(<StepDone name="James Sablay" accounts={3} total={12500} currency="PHP" nudge="20:00" onFinish={onFinish} saving={false} />)
    expect(screen.getByText(/all set, James$/)).toBeTruthy()
    expect(screen.getByText(/3 accounts · ₱12,500.00 · nudge at 8:00 PM/)).toBeTruthy()
    fireEvent.click(buttonNamed(/start tracking/i))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('does not let a double tap save twice', () => {
    render(<StepDone name="" accounts={1} total={0} currency="PHP" nudge={null} onFinish={vi.fn()} saving />)
    expect(/** @type {HTMLButtonElement} */ (buttonNamed(/start tracking/i)).disabled).toBe(true)
  })
})

describe('InstallGuide', () => {
  it("is one button where the browser has handed over its prompt", () => {
    render(<InstallGuide context="prompt" />)
    expect(buttonNamed(/install spendr/i)).toBeTruthy()
  })

  it('is three steps on an iPhone, ending in Add', () => {
    render(<InstallGuide context="ios" />)
    const steps = screen.getAllByRole('listitem')
    expect(steps).toHaveLength(3)
    expect(steps[1].textContent).toMatch(/Add to Home Screen/)
    expect(steps[2].textContent).toMatch(/Tap Add/)
  })

  it('shows the way out of an app’s browser, with the link to copy', () => {
    render(<InstallGuide context="in-app" />)
    expect(buttonNamed(/copy link/i)).toBeTruthy()
  })

  it('says it is done once installed', () => {
    render(<InstallGuide context="installed" />)
    expect(screen.getByText(/on your Home Screen/i)).toBeTruthy()
  })
})
