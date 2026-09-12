import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useAuth } from '../context/AuthContext'
import { fullSync } from '../lib/sync'
import { PH_ACCOUNTS } from '../lib/phAccounts'
import { EXPENSE_PRESETS, INFLOW_PRESETS, SYSTEM_CATS, LOCKED_EXPENSE, LOCKED_INFLOW } from '../lib/phCategories'
import { useToast } from '../context/ToastContext'
import { CASH } from './onboarding/shared'
import {
  StepDots,
  StepWelcome,
  StepName,
  StepCurrency,
} from './onboarding/StepsIntro'
import { StepPickAccounts } from './onboarding/StepAccounts'
import { StepSetBalances } from './onboarding/StepBalances'
import { StepPickCategories, StepDone } from './onboarding/StepCategories'

// ── Main Onboarding component ──────────────────────────────────────────────────

export default function Onboarding() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const { user, signInWithGoogle } = useAuth()
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
  const [signingIn,           setSigningIn]           = useState(false)

  // If already onboarded, skip straight to dashboard
  useEffect(() => {
    db.meta.get('onboarded').then(meta => {
      if (meta?.value) navigate('/', { replace: true })
    })
  }, [navigate])

  // If user just signed in via Google (OAuth redirect back), sync and complete onboarding
  useEffect(() => {
    if (!user) return
    db.meta.get('onboarded').then(async meta => {
      if (meta?.value) return // already done
      setSigningIn(true)
      try {
        await fullSync(user.id)
        await db.meta.put({ key: 'onboarded', value: true })
        navigate('/', { replace: true })
      } catch (e) {
        console.error('[Onboarding] sign-in sync failed:', e)
        showToast('Signed in, but sync failed', 'warning')
        setSigningIn(false)
      }
    })
  }, [user, navigate, showToast])

  async function handleSignIn() {
    setSigningIn(true)
    try {
      await signInWithGoogle()
      // OAuth redirect will take over; setSigningIn stays true during redirect
    } catch (e) {
      console.error('[Onboarding] sign in failed:', e)
      showToast('Sign-in failed', 'error')
      setSigningIn(false)
    }
  }

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
      showToast('Setup failed - please retry', 'error')
      setSaving(false)
    }
  }

  const TOTAL_NON_WELCOME_STEPS = 7

  return (
    <div className="onboarding-shell h-dvh text-white relative flex flex-col overflow-hidden">

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
        {step === 0 && <StepWelcome onNext={() => setStep(1)} onSignIn={handleSignIn} signingIn={signingIn} />}
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
          <StepDone
            onFinish={() => completeOnboarding(false)}
            saving={saving}
          />
        )}
      </div>
    </div>
  )
}
