import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sheet from '../../components/ui/Sheet'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import Switch from '../../components/ui/Switch'
import { REMINDER_HOUR } from '../../lib/reminders'
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
 * The sheet is one switch, the time, and a test. Everything a phone can be
 * before reminders are possible at all - signed out, a Safari tab on an
 * iPhone, notifications refused - disables the switch and says, in a line,
 * what to do about it, rather than replacing the sheet with an explanation.
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
  /* Which action is in flight, not just whether one is: the switch and the
     test button each show their own wait, and neither should spin for the
     other's. */
  const [pending, setPending] = useState(/** @type {'on'|'off'|'test'|null} */ (null))
  const [note, setNote] = useState(/** @type {{tone: 'ok'|'error', text: string}|null} */ (null))
  const [key, setKey] = useState(/** @type {string|null} */ (null))
  const busy = pending !== null

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
    setPending('on')
    setNote(null)
    const r = await enableReminders(user.id, key)
    setPending(null)
    if (r.ok) setOn(true)
    else if (r.reason === 'blocked') setSupport('blocked')
    else if (r.reason === 'dismissed') setNote({ tone: 'error', text: 'Allow notifications to turn this on.' })
    else if (r.reason === 'server') setNote({ tone: 'error', text: 'Couldn’t reach the server. Try again.' })
    else setNote({ tone: 'error', text: r.message || 'Couldn’t turn reminders on.' })
  }

  async function turnOff() {
    if (!user?.id || busy) return
    setPending('off')
    setNote(null)
    try {
      await disableReminders(user.id)
      setOn(false)
    } catch {
      setNote({ tone: 'error', text: 'Couldn’t reach the server. Try again when you’re online.' })
    } finally {
      setPending(null)
    }
  }

  async function test() {
    if (busy) return
    setPending('test')
    setNote(null)
    const r = await sendTestReminder()
    setPending(null)
    setNote(r.ok
      ? { tone: 'ok', text: 'Test sent. Check your notifications.' }
      : { tone: 'error', text: r.message || 'Couldn’t send a test.' })
  }

  return { user, open, setOpen, support, on, busy, pending, note, turnOn, turnOff, test }
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


/** "9:00 AM", from the one hour every reminder is sent at. */
const REMINDER_TIME = new Date(2000, 0, 1, REMINDER_HOUR)
  .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

/** The bell at the top of the sheet: the row's glyph, grown into a badge. */
function BellBadge() {
  return (
    <span
      className="mx-auto w-16 h-16 rounded-full flex items-center justify-center text-white"
      style={{
        background: 'linear-gradient(145deg, #fcd34d, #f59e0b)',
        boxShadow: '0 10px 24px -10px rgba(245, 158, 11, 0.7)',
      }}
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    </span>
  )
}

/**
 * Why the switch cannot be used here, and what to do about it. Null when it
 * can. Short on purpose: each one is a thing to do, not an explanation.
 *
 * @param {ReturnType<typeof useReminderSettings>} r
 * @param {boolean} ios
 */
function blocker(r, ios) {
  if (!r.user) return { text: 'Sign in to turn on reminders.' }
  if (r.on) return null
  if (r.support === 'ios-install') {
    return {
      text: 'Add Spendr to your Home Screen first.',
      steps: ['In Safari, tap Share, then Add to Home Screen.', 'Open Spendr from the new icon and come back here.'],
    }
  }
  if (r.support === 'unsupported') {
    return {
      text: ios
        ? 'Needs iOS 16.4 or later, with Spendr opened from the Home Screen.'
        : 'This browser can’t show notifications from web apps.',
    }
  }
  if (r.support === 'blocked') {
    return {
      text: ios
        ? 'Notifications are off for Spendr. Turn them on in Settings, then Notifications, then Spendr.'
        : 'Notifications are blocked for Spendr. Allow them in your browser’s site settings.',
    }
  }
  return null
}

/** @param {{r: ReturnType<typeof useReminderSettings>}} props */
export function RemindersSheet({ r }) {
  const navigate = useNavigate()
  const block = blocker(r, isIos())
  const canSwitch = !!r.user && (r.on || !block)

  return (
    <Sheet
      open={r.open}
      onClose={() => r.setOpen(false)}
      z={100}
      scrim={45}
      ariaLabel="Reminders"
      dismissible={!r.busy}
    >
      <div className="pt-3 pb-2">
        <div className="text-center">
          <BellBadge />
          <h3 className="mt-4 text-18 font-semibold text-slate-900 dark:text-white">
            Never miss a due date
          </h3>
          <p className="mt-1 mx-auto max-w-[260px] text-13 leading-snug text-slate-500 dark:text-slate-400">
            A heads-up before your card payments and bills are due.
          </p>
        </div>

        <Card surface="recessed" clip className="mt-5">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex-1 text-15 font-semibold text-slate-800 dark:text-white">Remind me</span>
            <Switch
              on={r.on}
              onChange={next => (next ? r.turnOn() : r.turnOff())}
              label="Remind me"
              disabled={!canSwitch}
              busy={r.pending === 'on' || r.pending === 'off'}
            />
          </div>
          <Divider inset="row" />
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex-1 text-14 text-slate-600 dark:text-slate-300">Reminder time</span>
            <span className="text-13 font-semibold tabular-nums px-2.5 py-1 rounded-lg
              bg-white dark:bg-white/[0.07] text-slate-700 dark:text-slate-200"
            >
              {REMINDER_TIME}
            </span>
          </div>
          <div className="px-4 pb-4 pt-1">
            {r.user ? (
              <Button
                block
                variant="tint"
                onClick={r.test}
                disabled={!r.on}
                loading={r.pending === 'test'}
              >
                Send a test
              </Button>
            ) : (
              <Button block onClick={() => { r.setOpen(false); navigate('/login') }}>
                Sign in
              </Button>
            )}
          </div>
        </Card>

        {block && r.user && (
          <div className="mt-3 px-1 text-13 leading-snug text-amber-700 dark:text-amber-400">
            <p className="font-semibold">{block.text}</p>
            {block.steps && (
              <ol className="mt-1.5 list-decimal pl-5 space-y-0.5 font-normal">
                {block.steps.map(s => <li key={s}>{s}</li>)}
              </ol>
            )}
          </div>
        )}

        {r.note && (
          <p className={`mt-3 text-center text-13 font-medium ${r.note.tone === 'ok'
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-amber-700 dark:text-amber-400'}`}
          >
            {r.note.text}
          </p>
        )}

        <p className="mt-4 text-center text-12 leading-snug text-slate-500 dark:text-slate-400">
          Cards: 3 days before and on the day. Bills: on the day.
        </p>
      </div>
    </Sheet>
  )
}
