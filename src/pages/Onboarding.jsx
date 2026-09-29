import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import db, { UNSYNCED } from '../db/db'
import { CORRECTION_DESC } from '../lib/flows'
import { APP_VERSION } from '../lib/release'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { fullSync } from '../lib/sync'
import { isSupabaseConfigured } from '../lib/supabase'
import { PH_ACCOUNTS } from '../lib/phAccounts'
import { enableReminders, pushSupport, serverKey } from '../lib/push'
import { DEFAULT_NUDGE, nudgeLabel } from '../lib/nudge'
import { setNudge } from '../hooks/useNudge'
import { installContext } from '../lib/install'
import { useKeyboardInset } from '../hooks/useKeyboardInset'
import { useReduceMotion } from '../hooks/useReduceMotion'
import { parseMoney } from '../utils/moneyInput'
import IconButton from '../components/ui/IconButton'
import { SPRING, EXIT } from './recap/theme'
import { CASH, CURRENCIES } from './onboarding/shared'
import { clearDraft, guessCurrency, inPhilippines, planSteps, readDraft, saveDraft, starterCategories } from './onboarding/flow'
import { readPreview } from './onboarding/preview'
import Stage, { sceneFor, STAGE_MAX } from './onboarding/Stage'
import { Heading, OverlayHost, StepBody } from './onboarding/parts'
import { StepCurrency, StepName, StepWelcome } from './onboarding/StepsIntro'
import { StepAccounts } from './onboarding/StepAccounts'
import { StepBalances } from './onboarding/StepBalances'
import { StepStayOnTrack } from './onboarding/StepStayOnTrack'
import { StepInstall, StepInstallFirst, StepOpenInBrowser } from './onboarding/StepInstall'
import { StepDone } from './onboarding/StepDone'

/**
 * Setup: the first thing anyone sees.
 *
 * ── What it is for ──
 *
 * To get from "what is this?" to a ledger with your accounts in it, with as
 * few questions as that takes and nothing that feels like a form. flow.js has
 * what is asked and why the order changes from phone to phone; each step is
 * its own file; Stage.jsx is the glass picture above them, which carries its
 * objects from one step to the next instead of swapping illustrations.
 *
 * ── How it moves ──
 *
 * Forward, the step slides in from the right out of a short blur while the
 * one before leaves to the left the same way; Back reverses both. The stage's
 * objects move to their places for the new step on the same zero-bounce
 * spring, so the whole screen is one movement rather than a page change with
 * a picture swap on top. With reduced motion, steps cross-fade and nothing
 * travels.
 *
 * ── Leaving and coming back ──
 *
 * Everything answered is kept in the tab as it is answered (flow.js, the
 * draft). Google's sign-in is a full redirect away and back; a phone short
 * of memory drops a backgrounded tab. Either way setup resumes at the step it
 * was on, and signing in partway through either finds an account that
 * already has data - welcome back, straight to it - or a new one, and
 * carries on.
 */

/** The share of the screen each step gives its picture. */
const STAGE_SHARE = /** @type {Record<import('./onboarding/flow').StepId, number>} */ ({
  welcome: 0.5,
  openInBrowser: 0.24,
  installFirst: 0.24,
  name: 0.3,
  currency: 0.24,
  accounts: 0.26,
  balances: 0.25,
  stayOnTrack: 0.3,
  install: 0.3,
  done: 0.46,
})

/**
 * The room each step's words and buttons need under the picture, at least.
 * On a short phone the picture gives way, not the question.
 */
const CONTENT_MIN = /** @type {Record<import('./onboarding/flow').StepId, number>} */ ({
  welcome: 300,
  openInBrowser: 440,
  installFirst: 440,
  name: 280,
  currency: 380,
  accounts: 400,
  balances: 380,
  stayOnTrack: 360,
  install: 360,
  done: 300,
})

/**
 * Forward slides in from the right; Back from the left.
 *
 * Opacity and a short slide, and no blur. The app's content swaps go through
 * a blur, but those are a figure or a line; a blur over a whole screen of
 * words and card faces is two full-screen filter passes on every frame of
 * the move, and on a budget Android that is the difference between a slide
 * and a stutter. The pictures above still assemble and settle on their own.
 */
const SWAP = {
  enter: (/** @type {number} */ dir) => ({ opacity: 0, x: 36 * dir }),
  center: { opacity: 1, x: 0 },
  exit: (/** @type {number} */ dir) => ({ opacity: 0, x: -36 * dir, transition: EXIT }),
}
const FADE = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

/* One sign-in's follow-up at a time. StrictMode runs the effect twice in
   development, and two full syncs racing each other on a fresh account would
   push the same rows twice. */
/** @type {{userId: string, promise: Promise<'onboarded'|'returning'|'new'>} | null} */
let afterSignIn = null

/** Whether the account just signed in to already had a ledger in it. */
async function hasLedger() {
  const [txs, accounts, named] = await Promise.all([
    db.transactions.count(),
    db.accounts.count(),
    db.meta.get('displayName'),
  ])
  return txs > 0 || accounts > 1 || !!named?.value
}

/** @param {string} userId */
function followSignIn(userId) {
  if (afterSignIn?.userId === userId) return afterSignIn.promise
  const promise = (async () => {
    if ((await db.meta.get('onboarded'))?.value) return /** @type {const} */ ('onboarded')
    /* Nothing on this device is worth keeping yet: setup writes its accounts
       and categories only at the end. So an account that already has data
       simply replaces it, without the question SyncManager asks. */
    await fullSync(userId, { choice: 'account' })
    return (await hasLedger()) ? /** @type {const} */ ('returning') : /** @type {const} */ ('new')
  })()
  afterSignIn = { userId, promise }
  promise.catch(() => { afterSignIn = null })
  return promise
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { user, signInWithGoogle } = useAuth()
  const { accentColor } = useTheme()
  const reduce = useReduceMotion()
  const kb = useKeyboardInset()

  const [preview] = useState(readPreview)
  const [ph] = useState(() => preview?.ph ?? inPhilippines())
  const cloud = preview?.cloud ?? isSupabaseConfigured
  const [plan] = useState(() => planSteps({ install: installContext(), cloud, ph }))
  const [draft] = useState(readDraft)

  const [step, setStep] = useState(() => {
    const want = preview?.step ?? draft?.step
    return want && plan.includes(/** @type {any} */ (want)) ? /** @type {import('./onboarding/flow').StepId} */ (want) : 'welcome'
  })
  const [dir, setDir] = useState(1)
  const [name, setName] = useState(draft?.name ?? '')
  const [currency, setCurrency] = useState(() => draft?.currency ?? (ph ? 'PHP' : guessCurrency(CURRENCIES.map(c => c.code))))
  const [picked, setPicked] = useState(() => new Set(draft?.picked ?? []))
  const [custom, setCustom] = useState(/** @type {Array<{name: string, type: string, color: string}>} */ (draft?.custom ?? []))
  const [balances, setBalances] = useState(/** @type {Record<string, string>} */ (draft?.balances ?? {}))
  const [limits, setLimits] = useState(/** @type {Record<string, string>} */ (draft?.limits ?? {}))
  const [nudgeTime, setNudgeTime] = useState(DEFAULT_NUDGE)
  const [nudgeOn, setNudgeOn] = useState(false)
  const [key, setKey] = useState(/** @type {string|null} */ (null))
  const [saving, setSaving] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [following, setFollowing] = useState(false)
  const [fakeSignedIn, setFakeSignedIn] = useState(!!preview?.signedIn)
  const [host, setHost] = useState(/** @type {HTMLElement|null} */ (null))
  const headingRef = useRef(/** @type {HTMLHeadingElement|null} */ (null))
  const firstStep = useRef(true)
  const columnRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [columnW, setColumnW] = useState(() => (typeof window === 'undefined' ? 390 : Math.min(window.innerWidth, 560)))

  // The column's width, for the stage to fit its hand of cards across.
  useLayoutEffect(() => {
    const el = columnRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setColumnW(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const signedIn = preview ? fakeSignedIn : !!user
  const push = preview ? (preview.push ?? 'ok') : pushSupport()

  // Someone already set up has no business here - except to preview it.
  useEffect(() => {
    if (preview) return
    db.meta.get('onboarded').then(meta => {
      if (meta?.value) navigate('/', { replace: true })
    })
  }, [navigate, preview])

  /* Back from Google. An account with a ledger already in it is someone
     returning: straight to it. A new one carries on with setup, from where
     the sign-in was started - or from the name, if it was the welcome's
     "I already have an account" and it turned out there was none. */
  useEffect(() => {
    if (!user?.id || preview) return
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFollowing(true)
    followSignIn(user.id)
      .then(async result => {
        if (!live) return
        if (result === 'new') {
          setFollowing(false)
          setStep(s => (s === 'welcome' ? 'name' : s))
          return
        }
        clearDraft()
        if (result === 'returning') {
          await db.meta.put({ key: 'onboarded', value: true })
          showToast('Welcome back. Your data is here.', 'success')
        }
        navigate('/', { replace: true })
      })
      .catch(e => {
        console.error('[Onboarding] after sign-in:', e)
        if (!live) return
        setFollowing(false)
        showToast('Signed in, but the sync failed. You can carry on.', 'warning')
        setStep(s => (s === 'welcome' ? 'name' : s))
      })
    return () => { live = false }
  }, [user?.id, preview, navigate, showToast])

  // The draft, kept as it is answered.
  useEffect(() => {
    if (step === 'welcome' || preview) return
    saveDraft({ step, name, currency, picked: [...picked], custom, balances, limits })
  }, [step, name, currency, picked, custom, balances, limits, preview])

  // The server's push key, fetched while the question is read, so the tap
  // that answers it has nothing to wait for before it asks the phone.
  useEffect(() => {
    if (step !== 'stayOnTrack' || !signedIn || preview || push !== 'ok' || key) return
    serverKey().then(setKey).catch(() => { /* enableReminders fetches it itself */ })
  }, [step, signedIn, preview, push, key])

  // The question, read out when a step arrives - not on the first screen,
  // which has not moved anywhere.
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return }
    const t = setTimeout(() => headingRef.current?.focus({ preventScroll: true }), 60)
    return () => clearTimeout(t)
  }, [step, following])

  const accounts = useMemo(() => [
    CASH,
    ...PH_ACCOUNTS.filter(a => picked.has(a.name)),
    ...custom,
  ], [picked, custom])
  // What you have, less what the cards owe: the figure Home will open on.
  const total = accounts
    .reduce((sum, a) => sum + (a.type === 'credit' ? -1 : 1) * parseMoney(balances[a.name]), 0)

  const index = plan.indexOf(step)
  /** @param {number} delta */
  function go(delta) {
    const next = plan[index + delta]
    if (!next) return
    setDir(delta > 0 ? 1 : -1)
    setStep(next)
  }
  const next = () => go(1)

  async function signIn() {
    if (preview) { setFakeSignedIn(true); return }
    // Kept first: the redirect is a whole page away and back (see the draft).
    saveDraft({ step, name, currency, picked: [...picked], custom, balances, limits })
    setSigningIn(true)
    try {
      await signInWithGoogle()
      // The redirect takes it from here; the spinner stays until it does.
    } catch (e) {
      console.error('[Onboarding] sign in failed:', e)
      showToast('Sign-in failed. Try again.', 'error')
      setSigningIn(false)
    }
  }

  /** @returns {Promise<{ok: boolean, reason?: string}>} */
  async function enableNudge() {
    if (preview) { setNudgeOn(true); return { ok: true } }
    if (!user?.id) return { ok: false, reason: 'signed-out' }
    const r = await enableReminders(user.id, key)
    if (r.ok) {
      await setNudge(nudgeTime)
      setNudgeOn(true)
    }
    return r
  }

  async function finish() {
    if (preview) {
      showToast('That was a preview. Nothing was saved.', 'success')
      clearDraft()
      navigate('/', { replace: true })
      return
    }
    setSaving(true)
    try {
      const finalName = name.trim() || 'there'
      /* Stamped, so a sync that races this one cannot overwrite them with
         the server's defaults (sync.js, pullPreferences). */
      const at = new Date().toISOString()
      await db.meta.put({ key: 'userName', value: finalName, updatedAt: at })
      await db.meta.put({ key: 'displayName', value: finalName, updatedAt: at })
      await db.meta.put({ key: 'currency', value: currency, updatedAt: at })

      // Cash is seeded with the database (db.js); it gets its balance here.
      const cash = await db.accounts.where('name').equals('Cash').first()
      const cashBal = parseMoney(balances.Cash)
      if (cash) {
        await db.accounts.update(cash.id, { balance: cashBal, currency })
        await db.balances.put({ account: 'Cash', balance: cashBal })
      }

      /* Each account once, even if this runs twice - a double tap, or a
         sync that already brought one in. */
      for (const acct of accounts.slice(1)) {
        if (await db.accounts.where('name').equals(acct.name).first()) continue
        const credit = acct.type === 'credit'
        const bal = parseMoney(balances[acct.name])
        await db.accounts.add({
          name: acct.name,
          type: acct.type,
          color: acct.color,
          currency,
          // A card's balance is its charges (utils/creditCycle.js); what it owes today is one, below.
          balance: credit ? 0 : bal,
          ...(credit ? {
            creditLimit: parseMoney(limits[acct.name]),
            statementDate: null,
            dueDate: null,
            cutoffDate: null,
            minimumPayment: 0,
          } : {}),
        })
        await db.balances.put({ account: acct.name, balance: credit ? 0 : bal })
        /* What a card owes on the day you start. The number used to go on
           the account, where nothing reads it for a card: Home said the whole
           limit was free, the card said nothing was used, and net worth left
           the debt out. As a correction it is the card's first charge - it
           moves the card and net worth, and is not spending. */
        if (credit && bal > 0) {
          const nowISO = new Date().toISOString()
          await db.transactions.add({
            txId:        crypto.randomUUID(),
            type:        'expense',
            date:        nowISO,
            description: CORRECTION_DESC,
            category:    'Others',
            account:     acct.name,
            amount:      bal,
            adjust:      'correction',
            synced:      UNSYNCED,
            updatedAt:   nowISO,
          })
        }
      }

      // The starter categories, less any a sync has already put here.
      const have = await db.categories.toArray()
      const missing = starterCategories().filter(c => !have.some(h => h.name === c.name && h.type === c.type))
      if (missing.length) await db.categories.bulkAdd(missing)

      /* Someone who has just set up has no earlier version to hear about:
         What's New over their first Home was a list of changes to an app
         they had never used. */
      await db.meta.put({ key: 'whatsNewSeen', value: APP_VERSION })
      await db.meta.put({ key: 'onboarded', value: true })
      clearDraft()
      navigate('/', { replace: true })
    } catch (e) {
      console.error('[Onboarding]', e)
      showToast('Setup failed. Please try again.', 'error')
      setSaving(false)
    }
  }

  // ── The screen ──────────────────────────────────────────────────────────

  const available = kb.open ? kb.height : Math.max(kb.height, 480)
  const share = kb.open ? 0.16 : (STAGE_SHARE[step] ?? 0.3)
  const room = available - 56 - (CONTENT_MIN[step] ?? 360)
  const stageH = Math.round(Math.max(kb.open ? 96 : 128, Math.min(STAGE_MAX, available * share, room)))
  const actors = sceneFor(step, {
    accounts, name, total, currency, signedIn, time: nudgeLabel(nudgeTime), keyboard: kb.open,
    wide: columnW / stageH, width: columnW, push,
  })
  const dots = plan.filter(s => s !== 'welcome' && s !== 'done')
  const at = dots.indexOf(step)

  function content() {
    if (following) {
      return (
        <StepBody className="justify-center items-center text-center">
          <Heading ref={headingRef} title="Getting your account ready" sub="This only takes a moment." />
          <span className="w-6 h-6 rounded-full border-2 border-white/25 border-t-white animate-spin" aria-hidden="true" />
        </StepBody>
      )
    }
    switch (step) {
      case 'welcome':
        return <StepWelcome ref={headingRef} onNext={next} onSignIn={cloud ? signIn : null} signingIn={signingIn} />
      case 'openInBrowser':
        return <StepOpenInBrowser ref={headingRef} onNext={next} />
      case 'installFirst':
        return <StepInstallFirst ref={headingRef} onNext={next} />
      case 'name':
        return <StepName ref={headingRef} value={name} onChange={setName} onNext={next} />
      case 'currency':
        return <StepCurrency ref={headingRef} value={currency} onChange={setCurrency} onNext={next} />
      case 'accounts':
        return (
          <StepAccounts
            ref={headingRef}
            selectedNames={picked}
            onToggle={(/** @type {string} */ n) => setPicked(prev => {
              const s = new Set(prev)
              if (s.has(n)) s.delete(n)
              else s.add(n)
              return s
            })}
            customAccounts={custom}
            onAddCustom={(/** @type {any} */ a) => setCustom(prev => [...prev, a])}
            onRemoveCustom={(/** @type {string} */ n) => setCustom(prev => prev.filter(a => a.name !== n))}
            onNext={next}
          />
        )
      case 'balances':
        return (
          <StepBalances
            ref={headingRef}
            accounts={accounts}
            balances={balances}
            limits={limits}
            currency={currency}
            onBalance={(/** @type {string} */ n, /** @type {string} */ v) => setBalances(p => ({ ...p, [n]: v }))}
            onLimit={(/** @type {string} */ n, /** @type {string} */ v) => setLimits(p => ({ ...p, [n]: v }))}
            onNext={next}
            onSkip={next}
          />
        )
      case 'stayOnTrack':
        return (
          <StepStayOnTrack
            ref={headingRef}
            signedIn={signedIn}
            onSignIn={signIn}
            signingIn={signingIn}
            push={push}
            time={nudgeTime}
            onTime={setNudgeTime}
            onEnable={enableNudge}
            onNext={next}
          />
        )
      case 'install':
        return <StepInstall ref={headingRef} onNext={next} />
      case 'done':
        return (
          <StepDone
            ref={headingRef}
            name={name}
            accounts={accounts.length}
            total={total}
            currency={currency}
            nudge={nudgeOn ? nudgeTime : null}
            onFinish={finish}
            saving={saving}
          />
        )
      default:
        return null
    }
  }

  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>
      {/* `dark` whatever the theme: see .onboarding-shell in index.css.
          Pinned to the visible part of the screen, so the keyboard shrinks
          setup rather than covering its buttons. */}
      <div
        className="onboarding-shell dark fixed inset-x-0 top-0 overflow-hidden"
        style={{ top: kb.open ? kb.top : 0, height: kb.open ? kb.height : '100dvh' }}
      >
        <OverlayHost.Provider value={host}>
          <div ref={columnRef} className="onboarding-column relative h-full flex flex-col">
            <div
              className="relative z-10 shrink-0 flex items-center justify-between px-5 h-14"
              style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
            >
              <span className={`transition-opacity duration-300 ${index > 0 && !following ? '' : 'opacity-0 pointer-events-none'}`}>
                <IconButton label="Back" onClick={() => go(-1)} disabled={index === 0 || following}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </IconButton>
              </span>
              <Progress count={dots.length} at={at} />
              <span className="w-9" aria-hidden="true" />
            </div>

            <Stage actors={actors} height={stageH} hue={accentColor} reduce={reduce} />

            <div className="relative flex-1 min-h-0">
              <AnimatePresence initial={false} custom={dir}>
                <motion.div
                  key={following ? 'following' : step}
                  custom={dir}
                  variants={reduce ? FADE : SWAP}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={reduce ? { duration: 0.2 } : SPRING}
                  className="absolute inset-0 flex flex-col px-6"
                >
                  {content()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </OverlayHost.Provider>
        <div ref={setHost} />
      </div>
    </MotionConfig>
  )
}

/**
 * Where setup is: a dot per step, the current one drawn out into a pill -
 * the one behind shrinking back as the next grows, on the same spring as
 * everything else. Hidden on the welcome and the last screen, which are not
 * steps so much as the way in and the way out.
 *
 * @param {{count: number, at: number}} props
 */
function Progress({ count, at }) {
  const shown = at >= 0
  return (
    <div
      className={`flex items-center gap-1.5 transition-opacity duration-300 ${shown ? '' : 'opacity-0'}`}
      role="progressbar"
      aria-label="Setup"
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={shown ? at + 1 : undefined}
      aria-hidden={shown ? undefined : true}
    >
      {Array.from({ length: count }, (_, i) => (
        <motion.span
          key={i}
          initial={false}
          animate={{ width: i === at ? 22 : 6 }}
          transition={SPRING}
          className={`block h-1.5 rounded-full transition-colors duration-300 ${i === at ? 'bg-primary' : i < at ? 'bg-primary/55' : 'bg-white/20'}`}
        />
      ))}
    </div>
  )
}
