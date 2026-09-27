import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FaceId } from '@untitledui/icons'
import SubPage from '../../components/SubPage'
import Button from '../../components/ui/Button'
import Segmented from '../../components/ui/Segmented'
import Sheet from '../../components/ui/Sheet'
import Switch from '../../components/ui/Switch'
import PinPad from '../../components/lock/PinPad'
import { useAppLock } from '../../components/lock/LockGate'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { PASSKEY_PROBLEMS } from '../../lib/passkey'
import { clearTries, unlockName } from '../../lib/appLock'
import { hashPin, makeLockPasskey, tryLockPin, unlockWithPasskey } from '../../lib/unlock'
import {
  IconCloud, IconFaceId, IconPasscode, IconTrash, RowDivider, RowIcon, SectionCard, SectionHeader, SettingsRow,
} from './shared'

/** @param {string} s */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const DELAY_OPTIONS = [
  { value: 0, label: 'Immediately' },
  { value: 60_000, label: '1 min' },
  { value: 300_000, label: '5 min' },
]

/**
 * App lock: Face ID in front of Spendr (lib/appLock.js, components/lock/).
 *
 * The switch, and under it, in plain words, what the lock is not: it keeps
 * the app's screens closed, and encrypts nothing. Then, once it is on, how
 * long Spendr can be away before it asks again, and the ways back in if Face
 * ID ever cannot - a PIN, and signing in again for an account.
 *
 * Turning it off, and changing or removing the PIN, ask for Face ID first:
 * each of them is a way past the lock, and whoever has the phone for a
 * minute should not be able to leave themselves one.
 */
export default function AppLockPage() {
  const lock = useAppLock()
  const { showToast } = useToast()
  const config = lock.config
  const on = !!config
  const name = unlockName()
  const [flow, setFlow] = useState(/** @type {Flow | null} */ (null))
  /* Whether this device can make a passkey it unlocks with its own face or
     finger. Only asked where the API exists; elsewhere it cannot. */
  const [supported, setSupported] = useState(() =>
    typeof window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable === 'function' ? null : false)

  useEffect(() => {
    if (supported !== null) return
    let live = true
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then((v) => { if (live) setSupported(v) }, () => { if (live) setSupported(false) })
    return () => { live = false }
  }, [supported])

  return (
    <SubPage title="App lock">
      <div className="mt-2 mb-8">
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="green"><IconFaceId /></RowIcon>}
            label="App lock"
            sublabel={on
              ? `On · ${cap(name)}${config.pin ? ' or PIN' : ''}`
              : supported === false ? `${cap(name)} isn't available here` : 'Off'}
            right={(
              <Switch
                on={on}
                label="App lock"
                disabled={!on && supported === false}
                onChange={(v) => setFlow(v ? 'on' : 'off')}
              />
            )}
          />
        </SectionCard>
        <p className="mx-5 mt-2.5 text-12 leading-relaxed text-slate-500 dark:text-slate-400">
          A lock on the screen, not encryption. It keeps Spendr closed to anyone holding your phone, but doesn&apos;t encrypt what&apos;s saved on it.
        </p>
      </div>

      {config && (
        <>
          <div className="mb-8">
            <SectionHeader>Lock after</SectionHeader>
            <div className="mx-5">
              <Segmented
                options={DELAY_OPTIONS}
                value={config.delay}
                onChange={(/** @type {number} */ delay) => {
                  try { lock.save({ ...config, delay }) } catch (e) { showToast(/** @type {Error} */ (e).message, 'error') }
                }}
              />
            </div>
            <p className="mx-5 mt-2.5 text-12 leading-relaxed text-slate-500 dark:text-slate-400">
              How long Spendr can be away before it asks again. Either way, it&apos;s hidden in the app switcher.
            </p>
          </div>

          <div className="mb-8">
            <SectionHeader>{`If ${name} can't`}</SectionHeader>
            <SectionCard>
              <SettingsRow
                iconEl={<RowIcon color="violet"><IconPasscode /></RowIcon>}
                label="Backup PIN"
                sublabel={config.pin ? 'On' : 'Off'}
                right={(
                  <Button size="sm" variant="tint" className="px-4" onClick={() => setFlow('pin')}>
                    {config.pin ? 'Change' : 'Add'}
                  </Button>
                )}
              />
              {config.pin && config.accountId && (
                <>
                  <RowDivider />
                  <SettingsRow
                    iconEl={<RowIcon color="red"><IconTrash /></RowIcon>}
                    label="Remove PIN"
                    destructive
                    onTap={() => setFlow('unpin')}
                  />
                </>
              )}
              {config.accountId && (
                <>
                  <RowDivider />
                  <SettingsRow
                    iconEl={<RowIcon color="blue"><IconCloud /></RowIcon>}
                    label="Sign in again"
                    sublabel="On the lock screen, turns it off"
                  />
                </>
              )}
            </SectionCard>
            {!config.accountId && (
              <p className="mx-5 mt-2.5 text-12 leading-relaxed text-slate-500 dark:text-slate-400">
                {`You weren't signed in when you turned the lock on, so the PIN is the way back in if ${name} ever stops working.`}
              </p>
            )}
          </div>
        </>
      )}

      <LockSheet flow={flow} onClose={() => setFlow(null)} />
    </SubPage>
  )
}

/** @typedef {'on' | 'off' | 'pin' | 'unpin'} Flow */

/**
 * Every change to the lock, as one sheet in steps:
 *
 *   on     what it does, then Face ID makes the passkey, then a PIN - one
 *          you can skip only with an account to fall back on, since without
 *          one it is the only way back in
 *   off    Face ID (or the PIN), then off
 *   pin    Face ID (or the current PIN), then the new PIN twice
 *   unpin  Face ID (or the PIN), then gone
 *
 * Face ID is asked for from the button's own tap, before anything is
 * awaited, so it works on every iOS version that has passkeys.
 *
 * @param {{ flow: Flow | null, onClose: () => void }} props
 */
function LockSheet({ flow, onClose }) {
  const lock = useAppLock()
  const config = lock.config
  const { user } = useAuth()
  const { showToast } = useToast()
  const name = unlockName()
  const [kind, setKind] = useState(/** @type {Flow} */ ('on'))
  const [step, setStep] = useState(/** @type {'start'|'prove-pin'|'choose'|'confirm'} */ ('start'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState(/** @type {{credentialId: string, publicKey: string} | null} */ (null))
  const [first, setFirst] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [wrong, setWrong] = useState(false)

  /* The pause after a wrong or mismatched PIN belongs to the flow that set
     it. One still pending when the sheet closes and another opens must not
     move the new flow along - a "Turn off" must never land on "choose a
     PIN" without Face ID in that flow. */
  const timer = useRef(/** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined))
  const later = (/** @type {() => void} */ fn) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(fn, 450)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  /* Hydrate-on-open, as every sheet here does - it stays mounted through its
     exit - and before paint, so a sheet never shows the last flow's step. */
  useLayoutEffect(() => {
    if (!flow) return
    clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKind(flow); setStep('start'); setBusy(false); setError(''); setMade(null); setFirst(''); setAttempt(a => a + 1); setWrong(false)
  }, [flow])

  /* The app locked while the sheet was open: whatever it proved before goes
     with it. It will be opened again, from the start, once unlocked. */
  useEffect(() => {
    if (flow && lock.locked) onClose()
  }, [flow, lock.locked, onClose])

  /** Keep the lock, or say it could not be kept. @param {import('../../lib/appLock').LockConfig} next */
  const keep = (next) => {
    try {
      lock.save(next)
      return true
    } catch (e) {
      setError(/** @type {Error} */ (e).message)
      return false
    }
  }

  const finish = (/** @type {string} */ toast) => {
    showToast(toast, 'success')
    onClose()
  }

  // ── Proving it's you ──

  /** Face ID, from the tap. */
  function proveWithFaceId() {
    if (!config) return
    const answer = unlockWithPasskey(config)
    setBusy(true)
    setError('')
    answer
      .then((ok) => (ok ? proved() : setError("That wasn't this lock's passkey.")))
      .catch((e) => { if (e?.name !== 'AbortError') setError(`${cap(name)} didn't confirm it.`) })
      .finally(() => setBusy(false))
  }

  /** @param {string} pin */
  async function proveWithPin(pin) {
    if (!config) return
    setBusy(true)
    const result = await tryLockPin(pin, config)
    setBusy(false)
    if (result.ok) {
      proved()
      return
    }
    setError(result.wait > 0 ? `Too many tries. Try again in ${Math.ceil(result.wait / 1000)} seconds.` : 'Wrong PIN.')
    setWrong(true)
    later(() => { setWrong(false); setAttempt(a => a + 1) })
  }

  function proved() {
    if (!config) return
    setError('')
    if (kind === 'off') {
      lock.turnOff()
      finish('App lock is off')
    } else if (kind === 'unpin') {
      if (keep({ ...config, pin: null })) finish('Backup PIN removed')
    } else {
      setStep('choose')
      setAttempt(a => a + 1)
    }
  }

  // ── Turning it on ──

  /** Face ID makes the passkey, from the tap. */
  function makePasskey() {
    const making = makeLockPasskey()
    setBusy(true)
    setError('')
    making
      .then((m) => { setMade(m); setStep('choose'); setAttempt(a => a + 1) })
      .catch((e) => {
        setError(e?.name === 'NotAllowedError' ? `${cap(name)} was cancelled, so the lock is still off.`
          : e?.name === 'PasskeyCheckError' ? `That passkey didn't check out. ${PASSKEY_PROBLEMS[e.reason] ?? ''}`
            : `${cap(name)} isn't available here.`)
      })
      .finally(() => setBusy(false))
  }

  /** @param {import('../../lib/appLock').PinHash | null} pin */
  function saveNew(pin) {
    if (!made) return
    const kept = keep({
      credentialId: made.credentialId, publicKey: made.publicKey, delay: 0, pin,
      accountId: user?.id ?? null, since: new Date().toISOString(),
    })
    if (kept) finish('App lock is on')
  }

  // ── A PIN, twice ──

  /** @param {string} pin */
  function chose(pin) {
    setFirst(pin)
    setError('')
    setStep('confirm')
    setAttempt(a => a + 1)
  }

  /** @param {string} pin */
  async function confirmed(pin) {
    if (pin !== first) {
      setWrong(true)
      setError("Those didn't match. Choose a PIN again.")
      later(() => { setWrong(false); setFirst(''); setStep('choose'); setAttempt(a => a + 1) })
      return
    }
    setBusy(true)
    const kept = await hashPin(pin)
    setBusy(false)
    clearTries()
    if (kind === 'on') saveNew(kept)
    else if (config && keep({ ...config, pin: kept })) finish(config.pin ? 'Backup PIN changed' : 'Backup PIN added')
  }

  // ── What the sheet says, step by step ──

  const title = step === 'choose' ? (kind === 'on' ? 'Add a backup PIN' : 'Choose a new PIN')
    : step === 'confirm' ? 'Enter it again'
      : step === 'prove-pin' ? 'Enter your PIN'
        : kind === 'on' ? `Lock Spendr with ${name}`
          : kind === 'off' ? 'Turn off App lock?'
            : kind === 'unpin' ? 'Remove the backup PIN?'
              : config?.pin ? 'Change the backup PIN' : 'Add a backup PIN'

  const pinStep = step === 'choose' || step === 'confirm' || step === 'prove-pin'
  const canSkip = kind === 'on' && step === 'choose' && !!user

  let footer = null
  if (step === 'start') {
    footer = (
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
        {kind === 'on' ? (
          <Button className="flex-[2]" loading={busy} onClick={makePasskey}>Continue</Button>
        ) : (
          <Button className="flex-[2]" variant={kind === 'off' || kind === 'unpin' ? 'danger' : 'primary'} loading={busy} onClick={proveWithFaceId}>
            {kind === 'off' ? 'Turn off' : kind === 'unpin' ? 'Remove' : 'Continue'}
          </Button>
        )}
      </div>
    )
  } else if (canSkip) {
    footer = <Button variant="quiet" block onClick={() => saveNew(null)} disabled={busy}>Skip for now</Button>
  }

  return (
    <Sheet open={!!flow} onClose={onClose} title={title} footer={footer} dismissible={!busy}>
      {step === 'start' ? (
        <div className="flex flex-col items-center text-center pt-2 pb-1">
          <span className="w-14 h-14 rounded-2xl flex items-center justify-center bg-primary/[0.10] text-primary dark:bg-primary/[0.20] dark:text-white">
            <FaceId size={28} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <p className="mt-4 text-14 leading-relaxed text-slate-600 dark:text-slate-300 text-balance">
            {kind === 'on' ? `Spendr will ask for ${name} when you open it, and when you come back to it.`
              : kind === 'off' ? `Confirm it's you with ${name}, and Spendr will open without it.`
                : kind === 'unpin' ? `Signing in again still turns the lock off from the lock screen. Confirm it's you with ${name}.`
                  : `Confirm it's you with ${name} first.`}
          </p>
          {kind === 'on' && (
            <p className="mt-2 text-12 text-slate-500 dark:text-slate-400">A lock on the screen, not encryption.</p>
          )}
          {error && <p role="alert" className="mt-3 text-13 font-medium text-red-600 dark:text-red-400 text-balance">{error}</p>}
          {error && kind !== 'on' && config?.pin && (
            <Button variant="quiet" size="sm" className="mt-2 px-4" onClick={() => { setError(''); setStep('prove-pin'); setAttempt(a => a + 1) }}>
              Use PIN instead
            </Button>
          )}
        </div>
      ) : pinStep ? (
        <div className="flex flex-col items-center pb-2">
          <p className={`min-h-[40px] text-13 leading-snug text-center text-balance ${error ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
            {error || (step === 'choose'
              ? (kind === 'on' && !user
                ? `You're not signed in, so this PIN is your way back in if ${name} ever stops working.`
                : `Six digits for when ${name} can't. Spendr keeps only a scrambled copy.`)
              : step === 'confirm' ? 'The same six digits again.'
                : busy ? 'Checking…' : `The PIN you use when ${name} can't.`)}
          </p>
          <div className="mt-3">
            <PinPad
              key={attempt}
              label={step === 'confirm' ? 'Confirm PIN' : 'PIN'}
              onComplete={step === 'choose' ? chose : step === 'confirm' ? confirmed : proveWithPin}
              disabled={busy || wrong}
              invalid={wrong}
            />
          </div>
        </div>
      ) : null}
    </Sheet>
  )
}
