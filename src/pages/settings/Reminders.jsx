import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sheet from '../../components/ui/Sheet'
import Button from '../../components/ui/Button'
import { IconChevronRight } from '../../components/icons'
import { RowIcon, SettingsRow } from './shared'
import {
  disableReminders, enableReminders, isIos, pushSupport, remindersOn, sendTestReminder, serverKey,
} from '../../lib/push'

/**
 * Settings > Sync > Reminders: a row, and the sheet it opens.
 *
 * Two pieces sharing one hook rather than one component, because the row
 * lives inside a SectionCard and the sheet cannot: Sheet draws a fixed
 * overlay in place, and a card's backdrop-filter makes it the containing
 * block for anything fixed inside it - the sheet would open clipped to the
 * card. So Settings puts the row in the card and the sheet with its others.
 *
 * Most of the sheet is about the states a phone can be in before reminders
 * are possible at all, because on an iPhone that is the common case: a
 * Safari tab cannot receive them, only the Home Screen app can, and the fix
 * is a thing to do rather than a switch to flip.
 */

function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

/** @param {{id?: string}|null|undefined} user */
export function useReminderSettings(user) {
  const [open, setOpen] = useState(false)
  const [support, setSupport] = useState(() => pushSupport())
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(/** @type {{tone: 'ok'|'error', text: string}|null} */ (null))
  const [key, setKey] = useState(/** @type {string|null} */ (null))

  useEffect(() => {
    let live = true
    remindersOn().then(v => { if (live) setOn(v) })
    return () => { live = false }
  }, [user?.id])

  /* On the way in: permission may have changed in the phone's own Settings
     since the page loaded, and the server's key is fetched now so the tap
     that turns reminders on has nothing to wait for before it asks. */
  useEffect(() => {
    if (!open) return
    const now = pushSupport()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport(now)
    setNote(null)
    if (user?.id && now === 'ok') serverKey().then(setKey)
  }, [open, user?.id])

  async function turnOn() {
    if (!user?.id || busy) return
    setBusy(true)
    setNote(null)
    const r = await enableReminders(user.id, key)
    setBusy(false)
    if (r.ok) {
      setOn(true)
      setNote({ tone: 'ok', text: 'On. Send a test to see what they look like.' })
    } else if (r.reason === 'blocked') {
      setSupport('blocked')
    } else if (r.reason === 'dismissed') {
      setNote({ tone: 'error', text: 'Notifications were not allowed. Tap again to be asked.' })
    } else if (r.reason === 'server') {
      setNote({ tone: 'error', text: 'Could not reach the reminder server. Check your connection and try again.' })
    } else {
      setNote({ tone: 'error', text: r.message || 'Could not turn reminders on.' })
    }
  }

  async function turnOff() {
    if (!user?.id || busy) return
    setBusy(true)
    setNote(null)
    try {
      await disableReminders(user.id)
      setOn(false)
    } catch {
      setNote({ tone: 'error', text: 'Could not reach the server, so another device may still get reminders. Try again online.' })
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    if (busy) return
    setBusy(true)
    setNote(null)
    const r = await sendTestReminder()
    setBusy(false)
    setNote(r.ok
      ? { tone: 'ok', text: 'Sent. It should arrive in a few seconds.' }
      : { tone: 'error', text: r.message || 'Could not send a test.' })
  }

  return { user, open, setOpen, support, on, busy, note, turnOn, turnOff, test }
}

/** @param {ReturnType<typeof useReminderSettings>} r */
function sublabelFor(r) {
  if (!r.user) return 'Sign in to get them'
  if (r.on) return 'On for this device'
  if (r.support === 'ios-install') return 'Add Spendr to your Home Screen first'
  if (r.support === 'unsupported') return 'Not available on this device'
  if (r.support === 'blocked') return 'Notifications are turned off'
  return 'Card due dates and bills'
}

/** @param {{r: ReturnType<typeof useReminderSettings>}} props */
export function RemindersRow({ r }) {
  return (
    <SettingsRow
      iconEl={<RowIcon color="amber"><IconBell /></RowIcon>}
      label="Reminders"
      sublabel={sublabelFor(r)}
      right={<IconChevronRight size={14} strokeWidth="2" />}
      onTap={() => r.setOpen(true)}
    />
  )
}

const P = 'text-13 leading-relaxed text-slate-500 dark:text-slate-400'

/** @param {{r: ReturnType<typeof useReminderSettings>}} props */
export function RemindersSheet({ r }) {
  const navigate = useNavigate()
  const ios = isIos()

  let body = null
  let footer = <Button block variant="secondary" onClick={() => r.setOpen(false)}>Done</Button>

  if (!r.user) {
    body = <p className={P}>Reminders are sent from Spendr&apos;s server, so they only work while you are signed in.</p>
    footer = <Button block onClick={() => { r.setOpen(false); navigate('/login') }}>Sign in</Button>
  } else if (r.on) {
    footer = (
      <div className="flex gap-3">
        <Button variant="dangerTint" className="flex-1" onClick={r.turnOff} disabled={r.busy}>Turn off</Button>
        <Button variant="secondary" className="flex-[1.4]" onClick={r.test} loading={r.busy}>Send a test</Button>
      </div>
    )
  } else if (r.support === 'ios-install') {
    body = (
      <>
        <p className={P}>An iPhone only sends notifications to Spendr once it is on your Home Screen.</p>
        <ol className={`${P} mt-3 list-decimal pl-5 space-y-1`}>
          <li>Open Spendr in Safari.</li>
          <li>Tap Share, then Add to Home Screen.</li>
          <li>Open Spendr from the new icon and come back here.</li>
        </ol>
        <p className={`${P} mt-3`}>Needs iOS 16.4 or later.</p>
      </>
    )
  } else if (r.support === 'unsupported') {
    body = (
      <p className={P}>
        {ios
          ? 'This iPhone cannot receive notifications from web apps. Update to iOS 16.4 or later, then open Spendr from your Home Screen.'
          : 'This browser cannot receive notifications from web apps. Chrome, Edge, Firefox and Safari can.'}
      </p>
    )
  } else if (r.support === 'blocked') {
    body = (
      <p className={P}>
        {ios
          ? 'Notifications are turned off for Spendr. Open the Settings app, tap Notifications, then Spendr, and turn on Allow Notifications.'
          : 'Notifications are blocked for Spendr. Allow them in the browser’s site settings. On Android, press and hold the Spendr icon, then App info, then Notifications.'}
      </p>
    )
  } else {
    footer = <Button block onClick={r.turnOn} loading={r.busy}>Turn on reminders</Button>
  }

  return (
    <Sheet
      open={r.open}
      onClose={() => r.setOpen(false)}
      z={100}
      scrim={45}
      title="Reminders"
      dismissible={!r.busy}
      footer={footer}
    >
      <div className="pt-1 pb-2">
        <p className={P}>
          A notification at 9 in the morning, three days before and on the day a credit card
          payment is due, and on the day each bill is due.
        </p>
        {body && <div className="mt-4">{body}</div>}
        {r.note && (
          <p className={`mt-4 text-13 font-medium ${r.note.tone === 'ok'
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-amber-600 dark:text-amber-400'}`}
          >
            {r.note.text}
          </p>
        )}
        <p className="mt-5 text-12 leading-relaxed text-slate-500 dark:text-slate-400">
          Worked out on this device. The server only keeps each reminder&apos;s time and wording, so
          it can send them while Spendr is closed.
        </p>
      </div>
    </Sheet>
  )
}
