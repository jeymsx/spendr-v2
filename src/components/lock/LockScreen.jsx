import { useEffect, useId, useRef, useState } from 'react'
import { FaceId } from '@untitledui/icons'
import Button from '../ui/Button'
import PinPad from './PinPad'
import { useAuth } from '../../context/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'
import { cancelRecovery, pinWait, startRecovery, unlockName } from '../../lib/appLock'
import { tryLockPin, unlockWithPasskey } from '../../lib/unlock'

/** @typedef {import('../../lib/appLock').LockConfig} LockConfig */

/** "0:30", "14:59". @param {number} ms */
function clock(ms) {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** @param {string} s */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * The lock: Spendr's mark, one line, and the ways in.
 *
 * ── It asks by itself ──
 *
 * Face ID comes up the moment the lock does - on opening Spendr and on coming
 * back to it - which iOS allows without a tap since 17.4, and limits how
 * often instead. So a prompt that is dismissed or fails leaves the button and
 * nothing more: nothing asks again by itself until Spendr next comes back,
 * because a prompt that keeps reappearing is exactly what the limit stops.
 * Going off screen mid-prompt calls it off.
 *
 * An answer opens Spendr only when its signature checks out against the
 * passkey saved on this device (lib/unlock.js unlockWithPasskey). The prompt
 * closing is not enough, and never was.
 *
 * ── The other ways in ──
 *
 * The PIN, when one was set, on a keypad in place of the button - with the
 * pause wrong tries earn counted down on it. And "Forgot? Sign in again" for
 * an account that can turn the lock off: it goes to Google and back, and
 * LockGate decides on the way back (appLock.recoveryOutcome).
 *
 * `active` is false while an unlocked lock fades away: it must not ask again.
 *
 * @param {{ config: LockConfig, onUnlock: () => void, note?: string, active?: boolean }} props
 */
export default function LockScreen({ config, onUnlock, note = '', active = true }) {
  const name = unlockName()
  const titleId = useId()
  const { signInWithGoogle, session } = useAuth()
  const [view, setView] = useState(/** @type {'faceid'|'pin'} */ ('faceid'))
  const [asking, setAsking] = useState(false)
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [checking, setChecking] = useState(false)
  const [wrong, setWrong] = useState(false)
  const [pinNote, setPinNote] = useState('')
  const [wait, setWait] = useState(() => pinWait(Date.now()))
  const inFlight = useRef(/** @type {AbortController|null} */ (null))
  const dialog = useRef(/** @type {HTMLDivElement|null} */ (null))
  const canRecover = isSupabaseConfigured && !!config.accountId
  const paused = wait > 0

  /** Face ID, checked. Asks the browser before anything is awaited, so a tap can call it. */
  function ask() {
    if (inFlight.current) return
    const controller = new AbortController()
    inFlight.current = controller
    const t0 = performance.now()
    const answer = unlockWithPasskey(config, controller.signal)
    setAsking(true)
    setMessage('')
    /* Only the attempt still in flight may speak: one called off - by going
       off screen, or by Use PIN - must not put its error over the next. */
    const current = () => inFlight.current === controller
    answer
      .then((ok) => {
        if (!current()) return
        if (ok) onUnlock()
        else setMessage(`That wasn't this lock's passkey.${config.pin || canRecover ? ' Try another way in below.' : ''}`)
      })
      .catch((e) => {
        if (e?.name === 'AbortError' || !current()) return
        /* A refusal inside a fraction of a second means no prompt was shown -
           iOS spacing prompts out, most likely - rather than a face that did
           not match or a Cancel. */
        setMessage(performance.now() - t0 < 700
          ? `${cap(name)} didn't open. Wait a moment, then try again.`
          : `${cap(name)} didn't unlock Spendr. Try again.`)
      })
      .finally(() => {
        if (!current()) return
        inFlight.current = null
        setAsking(false)
      })
  }

  /** Call off the attempt in flight, at once - so the next can start straight away. */
  function stop() {
    inFlight.current?.abort()
    inFlight.current = null
    setAsking(false)
  }

  // On appearing, and on each return while locked: ask, once.
  const latest = useRef({ ask, stop, view, active })
  useEffect(() => { latest.current = { ask, stop, view, active } })
  useEffect(() => {
    dialog.current?.focus({ preventScroll: true })
    if (latest.current.active && document.visibilityState === 'visible') latest.current.ask()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') latest.current.stop()
      else if (latest.current.active && latest.current.view === 'faceid') latest.current.ask()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      inFlight.current?.abort()
      inFlight.current = null
    }
  }, [])

  // The pause after wrong PINs, counted down while it lasts.
  useEffect(() => {
    if (!paused) return
    const id = setInterval(() => setWait(pinWait(Date.now())), 1000)
    return () => clearInterval(id)
  }, [paused])

  /** @param {string} pin */
  async function tryPin(pin) {
    setChecking(true)
    const result = await tryLockPin(pin, config)
    setChecking(false)
    if (result.ok) {
      onUnlock()
      return
    }
    const before = 5 - result.fails
    setPinNote(before > 0 && before <= 2 ? `Wrong PIN. ${before} more ${before === 1 ? 'try' : 'tries'} before a pause.` : 'Wrong PIN.')
    setWait(result.wait)
    setWrong(true)
    // Red for a moment, then an empty pad for the next go.
    setTimeout(() => { setWrong(false); setAttempt(a => a + 1) }, 450)
  }

  async function signInAgain() {
    if (!config.accountId) return
    setMessage('')
    /* The server's record of this account's last sign-in, from the session
       already on the phone: only a later one will turn the lock off. */
    const before = session?.user?.id === config.accountId ? session.user.last_sign_in_at ?? null : null
    startRecovery(config.accountId, before, Date.now())
    try {
      const { error } = await signInWithGoogle()
      if (error) throw error
    } catch {
      cancelRecovery()
      setMessage("Couldn't start signing in. Check your connection and try again.")
    }
  }

  const shown = message || note

  if (view === 'pin') {
    const status = paused ? `Too many tries. Try again in ${clock(wait)}.` : checking ? 'Checking…' : pinNote
    return (
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="lock-screen outline-none">
        <div key="pin" className="lock-swap flex-1 w-full flex flex-col items-center justify-center">
          <img src="/icons/icon-192.png" alt="" width={56} height={56} className="w-14 h-14" />
          <h1 id={titleId} className="mt-4 text-20 font-semibold tracking-tight text-slate-900 dark:text-white">Enter your PIN</h1>
          <p role="status" className={`mt-1.5 min-h-[20px] text-13 text-center ${pinNote && !paused && !checking ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {status}
          </p>
          <div className="mt-4">
            <PinPad
              key={attempt}
              onComplete={tryPin}
              disabled={checking || paused || wrong}
              invalid={wrong}
              left={(
                <button
                  type="button"
                  className="pin-key pin-key-quiet"
                  aria-label={`Use ${name}`}
                  onClick={() => { stop(); setView('faceid'); ask() }}
                >
                  <FaceId size={28} strokeWidth={1.8} aria-hidden="true" />
                </button>
              )}
            />
          </div>
          {canRecover && (
            <Button variant="quiet" size="sm" className="mt-5 px-4" onClick={signInAgain}>Forgot your PIN? Sign in again</Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="lock-screen outline-none">
      <div key="faceid" className="lock-swap flex-1 w-full max-w-[340px] flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
          <img src="/icons/icon-192.png" alt="" width={76} height={76} className="w-[76px] h-[76px]" />
          <h1 id={titleId} className="mt-5 text-22 font-semibold tracking-tight text-slate-900 dark:text-white">Spendr is locked</h1>
          <p className="mt-1.5 text-14 text-slate-500 dark:text-slate-400">Use {name} to open it.</p>
        </div>
        <div className="flex flex-col items-stretch gap-3">
          {shown && (
            <p role="alert" className="text-13 leading-snug text-center text-slate-600 dark:text-slate-300 text-balance">{shown}</p>
          )}
          <Button block size="lg" loading={asking} onClick={ask}>
            {!asking && <FaceId size={20} strokeWidth={1.8} aria-hidden="true" />}
            {asking ? `Waiting for ${name}…` : `Unlock with ${name}`}
          </Button>
          {config.pin && (
            <Button block size="lg" variant="secondary" onClick={() => { stop(); setView('pin') }}>
              Use PIN
            </Button>
          )}
          {canRecover && (
            <Button variant="quiet" size="sm" className="self-center px-4" onClick={signInAgain}>Forgot? Sign in again</Button>
          )}
        </div>
      </div>
    </div>
  )
}
