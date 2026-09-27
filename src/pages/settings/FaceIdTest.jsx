import { Fragment, useEffect, useState } from 'react'
import SubPage from '../../components/SubPage'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import DetailRow from '../../components/ui/DetailRow'
import {
  ES256, PASSKEY_PROBLEMS, createPasskey, fromB64url, getAssertion, parseAuthData, readRegistration, toB64url,
  verifyAssertion,
} from '../../lib/passkey'
import { shareOrCopy } from '../../lib/share'
import { isStandalone } from '../../utils/platform'
import { APP_VERSION, RowDivider, SectionCard, SectionHeader } from './shared'

/*
 * TEMPORARY: phase 1 of the app lock, the check that Face ID works at all
 * inside the installed app. Delete this file, its route in App.jsx and its
 * row in Settings.jsx when the lock lands.
 *
 * It has to be a page inside the app rather than a link: the home-screen app
 * has no address bar, and a link out of it opens Safari, which is a different
 * browser with different rules - the one thing this must not test.
 *
 * Each test shows what the browser actually said: "Success", or the error's
 * name and message, untranslated. Registering keeps the passkey's id and
 * public key in this device's localStorage, so Unlock can ask for it and
 * check its signature the way the real lock will. Results survive the reload
 * test in sessionStorage, and Share results sends all of them in one go.
 */

const SAVED_KEY = 'spendr-faceid-test'
const RESULTS_KEY = 'spendr-faceid-test-results'
const ON_LOAD_KEY = 'spendr-faceid-test-on-load'

const TESTS = [
  ['register', 'Register'],
  ['unlock', 'Unlock'],
  ['load', 'After a reload'],
  ['return', 'When you come back'],
]

/**
 * @typedef {[label: string, value: string, bad?: boolean]} Fact
 * @typedef {{ ok: boolean, head: string, message?: string, ms: number, facts: Fact[] }} Outcome
 * @typedef {{ id: string, publicKey: string | null, userId: string }} Saved
 */

/** @param {'localStorage'|'sessionStorage'} store @param {string} key */
function readJson(store, key) {
  try { return JSON.parse(window[store].getItem(key) ?? 'null') } catch { return null }
}

/** @param {'localStorage'|'sessionStorage'} store @param {string} key @param {unknown} value */
function writeJson(store, key, value) {
  try { window[store].setItem(key, JSON.stringify(value)) } catch { /* private mode */ }
}

/* How many times the page has been hidden since this module loaded. A test
   compares it before and after its prompt: if the Face ID sheet itself hides
   the page, a lock that locks on "hidden" would lock again the moment it is
   answered - worth knowing before building one. */
let hides = 0
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hides++ })

/** @param {number} before hides when the prompt went up @returns {Fact} */
const hid = (before) => ['Page hid during it', hides > before ? 'Yes' : 'No']

/** @param {number} ms */
const took = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`)

/** What the browser threw, as it said it. @param {unknown} e @param {number} t0 @returns {Outcome} */
function failed(e, t0) {
  const err = /** @type {any} */ (e)
  return { ok: false, head: err?.name || 'Error', message: err?.message || String(e), ms: performance.now() - t0, facts: [] }
}

/**
 * Make the test passkey. The browser is asked before anything is awaited,
 * so the tap that called this is still the one it answers.
 */
function runRegister(/** @type {any} */ setResults, /** @type {any} */ setBusy, /** @type {any} */ setSaved) {
  const prior = /** @type {Saved | null} */ (readJson('localStorage', SAVED_KEY))
  /* The same user id every time, so registering again replaces the test
     passkey in the keychain instead of adding another beside it. */
  const userId = prior?.userId ? fromB64url(prior.userId) : crypto.getRandomValues(new Uint8Array(16))
  const t0 = performance.now()
  const h0 = hides
  const asking = createPasskey({ userId, name: 'Face ID test', displayName: 'Spendr Face ID test' })
  setBusy('register')
  asking
    .then(async (made) => {
      const ms = performance.now() - t0
      const reg = await readRegistration(made)
      if (reg.ok) {
        const next = { id: reg.id, publicKey: reg.publicKey, userId: toB64url(userId) }
        writeJson('localStorage', SAVED_KEY, next)
        setSaved(next)
      }
      const f = reg.flags
      const keyBytes = reg.publicKey ? fromB64url(reg.publicKey).length : 0
      /** @type {Outcome} */
      const outcome = {
        ok: true, head: 'Success', ms,
        facts: [
          ['Made by', reg.attachment === 'platform' ? 'This device' : reg.attachment ?? 'Not said'],
          ['Face ID or passcode', f ? (f.uv ? 'Used' : 'Not used') : 'Not said', !f?.uv],
          ['Key', keyBytes ? `${reg.alg === ES256 ? 'ES256' : `alg ${reg.alg}`} · ${keyBytes} bytes` : 'Not handed over', !keyBytes],
          ['Keychain', f ? (f.be ? (f.bs ? 'Synced' : 'Can sync') : 'This device only') : 'Not said'],
          ['Checks', reg.ok ? 'All passed' : PASSKEY_PROBLEMS[reg.reason] ?? reg.reason, !reg.ok],
          hid(h0),
        ],
      }
      setResults((/** @type {any} */ r) => ({ ...r, register: outcome }))
    })
    .catch((e) => setResults((/** @type {any} */ r) => ({ ...r, register: { ...failed(e, t0), facts: [hid(h0)] } })))
    .finally(() => setBusy(null))
}

/**
 * Ask Face ID for the test passkey and check the answer's signature. Reads
 * the passkey from storage rather than from React state, so a trigger fired
 * from an event listener cannot see an old one.
 *
 * @param {'unlock'|'load'|'return'} key
 * @param {Fact[]} [before] facts about how it was triggered
 */
function runUnlock(key, /** @type {any} */ setResults, /** @type {any} */ setBusy, before = []) {
  /** @param {Outcome} outcome */
  const record = (outcome) => setResults((/** @type {any} */ r) => ({ ...r, [key]: outcome }))
  const saved = /** @type {Saved | null} */ (readJson('localStorage', SAVED_KEY))
  if (!saved?.id) {
    record({ ok: false, head: 'No test passkey', message: 'Register first.', ms: 0, facts: before })
    return
  }
  const t0 = performance.now()
  const h0 = hides
  const asking = getAssertion({ credentialId: saved.id })
  setBusy(key)
  asking
    .then(async (answer) => {
      const ms = performance.now() - t0
      const res = /** @type {AuthenticatorAssertionResponse} */ (answer.credential.response)
      const auth = parseAuthData(new Uint8Array(res.authenticatorData))
      const check = saved.publicKey
        ? await verifyAssertion(answer, { credentialId: saved.id, publicKey: saved.publicKey })
        : null
      record({
        ok: true, head: 'Success', ms,
        facts: [
          ...before,
          ['Face ID or passcode', auth ? (auth.flags.uv ? 'Used' : 'Not used') : 'Not said', !auth?.flags.uv],
          ['Signature', !check ? 'No saved key to check' : check.ok ? 'Verified' : PASSKEY_PROBLEMS[check.reason] ?? check.reason, !check?.ok],
          hid(h0),
        ],
      })
    })
    .catch((e) => record({ ...failed(e, t0), facts: [...before, hid(h0)] }))
    .finally(() => setBusy(null))
}

/**
 * Face ID inside the installed app, tested four ways: making a passkey and
 * asking for it with a tap, and asking for it with no tap at all - after a
 * reload, and on coming back to the app - which is what a lock that asks by
 * itself will do.
 */
export default function FaceIdTest() {
  const [saved, setSaved] = useState(() => /** @type {Saved | null} */ (readJson('localStorage', SAVED_KEY)))
  const [results, setResults] = useState(() => /** @type {Record<string, Outcome>} */ (readJson('sessionStorage', RESULTS_KEY) ?? {}))
  const [busy, setBusy] = useState(/** @type {string | null} */ (null))
  const [armed, setArmed] = useState(false)
  const [note, setNote] = useState('')
  /* Whether this device has Face ID (or any user-verifying authenticator)
     for passkeys. Only asked where the API exists; elsewhere it is no. */
  const [platform, setPlatform] = useState(() =>
    typeof window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable === 'function' ? null : false)
  const standalone = isStandalone()

  useEffect(() => { writeJson('sessionStorage', RESULTS_KEY, results) }, [results])

  useEffect(() => {
    if (platform !== null) return
    let live = true
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then((v) => { if (live) setPlatform(v) }, () => { if (live) setPlatform(false) })
    return () => { live = false }
  }, [platform])

  /* After a reload: the page asks by itself, with no tap behind it. The
     flag is cleared first, so a second run of this effect finds nothing. */
  useEffect(() => {
    let pending = false
    try {
      pending = sessionStorage.getItem(ON_LOAD_KEY) === '1'
      sessionStorage.removeItem(ON_LOAD_KEY)
    } catch { /* private mode */ }
    if (pending) runUnlock('load', setResults, setBusy)
  }, [])

  /* When you come back: armed, the page notes when it was hidden and asks
     the moment it is shown again. */
  useEffect(() => {
    if (!armed) return
    let hiddenAt = 0
    const onChange = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = performance.now(); return }
      if (!hiddenAt) return
      setArmed(false)
      runUnlock('return', setResults, setBusy, [['Away for', took(performance.now() - hiddenAt)]])
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [armed])

  function reload() {
    try { sessionStorage.setItem(ON_LOAD_KEY, '1') } catch { /* the reload then asks nothing */ }
    location.reload()
  }

  async function share() {
    const lines = [
      `Spendr Face ID test · v${APP_VERSION}`,
      `Installed app: ${standalone ? 'yes' : 'no'}`,
      `Face ID or passkeys: ${platform ? 'available' : platform === false ? 'not available' : 'unknown'}`,
      `Site: ${location.hostname}`,
      navigator.userAgent,
    ]
    for (const [key, title] of TESTS) {
      const o = results[key]
      lines.push('', o ? `${title}: ${o.head} · ${took(o.ms)}` : `${title}: not run`)
      if (o?.message) lines.push(o.message)
      for (const [label, value] of o?.facts ?? []) lines.push(`${label}: ${value}`)
    }
    const outcome = await shareOrCopy('Spendr Face ID test', lines.join('\n'))
    setNote(outcome === 'copied' ? 'Copied. Paste it into a message.'
      : outcome === 'failed' ? 'Could not copy on this browser.' : '')
  }

  const idle = busy === null

  return (
    <SubPage title="Test Face ID">
      <p className="mx-5 mt-1 mb-6 text-13 leading-relaxed text-slate-500 dark:text-slate-400 text-center text-balance">
        A temporary check that Face ID works inside the installed app, before the app lock is built on it.
      </p>

      <div className="mb-8">
        <SectionHeader>This device</SectionHeader>
        <SectionCard>
          <DetailRow
            label="Installed app"
            value={standalone ? 'Yes' : 'No'}
            sub={standalone ? null : 'Open Spendr from the home screen'}
            tone={standalone ? '' : 'text-amber-600 dark:text-amber-400'}
          />
          <DetailRow
            label="Face ID or passkeys"
            value={platform === null ? 'Checking…' : platform ? 'Available' : 'Not available'}
            tone={platform === false ? 'text-amber-600 dark:text-amber-400' : ''}
          />
          <DetailRow label="Site" value={location.hostname} isLast />
        </SectionCard>
      </div>

      <div className="mb-8">
        <SectionHeader>With a tap</SectionHeader>
        <SectionCard>
          <TestRow
            title="Register"
            hint="Makes a passkey on this device. Face ID asks to save it."
            outcome={results.register}
            action={
              <Button size="sm" className="px-4 shrink-0" loading={busy === 'register'} disabled={!idle}
                onClick={() => runRegister(setResults, setBusy, setSaved)}>
                Register
              </Button>
            }
          />
          <RowDivider />
          <TestRow
            title="Unlock"
            hint={saved ? 'Asks Face ID for that passkey, then checks its signature.' : 'Register first.'}
            outcome={results.unlock}
            action={
              <Button size="sm" variant="tint" className="px-4 shrink-0" loading={busy === 'unlock'} disabled={!idle || !saved}
                onClick={() => runUnlock('unlock', setResults, setBusy)}>
                Unlock
              </Button>
            }
          />
        </SectionCard>
      </div>

      <div className="mb-8">
        <SectionHeader>Without a tap</SectionHeader>
        <SectionCard>
          <TestRow
            title="After a reload"
            hint="Reloads this page, which then asks for Face ID by itself, the way the lock will when Spendr opens."
            outcome={results.load}
            action={
              <Button size="sm" variant="tint" className="px-4 shrink-0" loading={busy === 'load'} disabled={!idle || !saved}
                onClick={reload}>
                Reload
              </Button>
            }
          />
          <RowDivider />
          <TestRow
            title="When you come back"
            hint={armed
              ? 'Ready. Go to the home screen, then come back to Spendr.'
              : 'Asks for Face ID by itself when you return to Spendr.'}
            outcome={results.return}
            action={
              <Button size="sm" variant="tint" className="px-4 shrink-0" loading={busy === 'return'} disabled={!saved || (!idle && !armed)}
                onClick={() => setArmed(a => !a)}>
                {armed ? 'Cancel' : 'Arm'}
              </Button>
            }
          />
        </SectionCard>
        <p className="mx-5 mt-3 text-12 leading-relaxed text-slate-500 dark:text-slate-400 text-balance">
          iOS spaces out prompts that come too close together. If one fails straight away, wait a few seconds and try again.
        </p>
      </div>

      <div className="mx-5 mb-8">
        <Button variant="secondary" block onClick={share}>Share results</Button>
        {note && <p className="mt-2 text-center text-12 font-medium text-emerald-600 dark:text-emerald-400">{note}</p>}
      </div>
    </SubPage>
  )
}

/**
 * One test: what it does, the button that runs it, and what happened last.
 *
 * @param {{ title: string, hint: string, action: import('react').ReactNode, outcome?: Outcome }} props
 */
function TestRow({ title, hint, action, outcome }) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-white">{title}</p>
          <p className="mt-0.5 text-12 leading-snug text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
        {action}
      </div>
      {outcome && <OutcomeBox outcome={outcome} />}
    </div>
  )
}

/**
 * What the browser said: green for an answer, red for an error, the time it
 * took - a failure in a few milliseconds means no prompt was ever shown -
 * and whatever else was learned.
 *
 * @param {{ outcome: Outcome }} props
 */
function OutcomeBox({ outcome }) {
  return (
    <Card surface="recessed" radius="xl" padding="sm" className="mt-3" role="status">
      <p className="flex items-center gap-2 text-13">
        <span className={`w-2 h-2 rounded-full shrink-0 ${outcome.ok ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden="true" />
        <span className={`min-w-0 font-semibold break-words ${outcome.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {outcome.head}
        </span>
        <span className="ml-auto shrink-0 text-12 tabular-nums text-slate-400 dark:text-slate-500">{took(outcome.ms)}</span>
      </p>
      {outcome.message && (
        <p className="mt-1 text-12 leading-relaxed text-slate-600 dark:text-slate-300 break-words">{outcome.message}</p>
      )}
      {outcome.facts.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-12">
          {outcome.facts.map(([label, value, bad]) => (
            <Fragment key={label}>
              <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className={`text-right font-medium break-words ${bad ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'}`}>
                {value}
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
    </Card>
  )
}
