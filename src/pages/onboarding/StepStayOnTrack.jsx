import PickSelect from '../../components/ui/PickSelect'
import { forwardRef, useState } from 'react'
import Button from '../../components/ui/Button'
import { NUDGE_TIMES, nudgeLabel } from '../../lib/nudge'
import { GoogleG, Heading, StepBody, StepFooter } from './parts'

/**
 * Keep it safe, then keep it up: a Google backup, and the daily check-in.
 *
 * One step, two halves, because the second needs the first. Reminders are
 * sent by the server to a signed-in account (lib/push.js), so the check-in
 * cannot be offered to someone who has not signed in - and signing in is
 * worth asking for on its own: without it, everything lives in this one
 * browser, and a phone cleaner or a lost phone takes it all.
 *
 * Signed out, it offers Google, or "Not now". Signed in - straight back from
 * Google's page, or already - it offers the nudge and a time. Where the
 * phone cannot show a notification yet (an iPhone still in Safari), it says
 * so and moves on; the switch is in Settings for later.
 */

/** The times offered as buttons. Any quarter hour is under "Other". */
const QUICK = ['19:00', '20:00', '21:00', '22:00']

/**
 * @param {{signedIn: boolean, onSignIn: () => void, signingIn: boolean, push: string,
 *          time: string, onTime: (t: string) => void, onEnable: () => Promise<{ok: boolean, reason?: string}>,
 *          onNext: () => void}} props
 */
export const StepStayOnTrack = forwardRef(
  /** @param {any} props @param {import('react').Ref<HTMLHeadingElement>} ref */
  function StepStayOnTrack({ signedIn, onSignIn, signingIn, push, time, onTime, onEnable, onNext }, ref) {
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState(/** @type {string|null} */ (null))

    if (!signedIn) {
      return (
        <>
          <StepBody>
            <Heading
              ref={ref}
              title="Keep your money safe"
              sub="Back it up to your Google account, see it on your other devices, and get a daily nudge to log. Only you can see it."
            />
          </StepBody>
          <StepFooter>
            <Button size="lg" block onClick={onSignIn} loading={signingIn}>
              {!signingIn && <GoogleG />}
              Continue with Google
            </Button>
            <Button size="lg" block variant="quiet" onClick={onNext}>Not now</Button>
          </StepFooter>
        </>
      )
    }

    if (push !== 'ok') {
      const why = push === 'ios-install'
        ? 'For a daily nudge, add Spendr to your Home Screen, then turn it on in Settings.'
        : push === 'blocked'
          ? 'Notifications are off for Spendr here. Allow them, then turn the nudge on in Settings.'
          : 'This browser can’t show reminders, so the daily nudge will have to wait.'
      return (
        <>
          <StepBody>
            <Heading ref={ref} title="You’re backed up" sub="Everything you add is saved to your Google account." />
            <p className="text-14 leading-snug text-slate-400">{why}</p>
          </StepBody>
          <StepFooter>
            <Button size="lg" block onClick={onNext}>Continue</Button>
          </StepFooter>
        </>
      )
    }

    async function enable() {
      setBusy(true)
      setNote(null)
      const r = await onEnable()
      setBusy(false)
      if (r.ok) return onNext()
      setNote(r.reason === 'blocked'
        ? 'Notifications are blocked for Spendr. Allow them in your settings, or skip this for now.'
        : r.reason === 'dismissed'
          ? 'Allow notifications to get the nudge.'
          : 'Couldn’t turn it on just now. You can do it later in Settings.')
    }

    const other = !QUICK.includes(time)
    return (
      <>
        <StepBody>
          <Heading
            ref={ref}
            title="Want a daily nudge?"
            sub="One reminder to log what you spent. It skips days you’ve already logged."
          />
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Nudge time">
            {QUICK.map(t => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={time === t}
                onClick={() => onTime(t)}
                className="onb-choice press rounded-2xl py-3 text-14 font-semibold text-white tabular-nums"
              >
                {nudgeLabel(t).replace(':00', '')}
              </button>
            ))}
          </div>
          <label className={`onb-choice rounded-2xl flex items-center gap-3 px-4 py-3 ${other ? '' : 'opacity-80'}`} data-on={other ? '' : undefined}>
            <span className="flex-1 text-14 text-slate-300">Another time</span>
            {/* The phone's own picker, quarter hours only: reminders go out
                on the quarter (lib/nudge.js). */}
            <PickSelect
              value={time}
              onChange={e => onTime(e.target.value)}
              aria-label="Check-in time"
              className="bg-transparent text-14 font-semibold text-white tabular-nums text-right appearance-none outline-none"
              options={NUDGE_TIMES.map(t => ({ value: t, label: nudgeLabel(t), className: 'text-slate-900' }))}
              menuWidth={160}
              align="end"
            />
          </label>
          {note && <p className="text-13 leading-snug text-amber-400" role="status">{note}</p>}
        </StepBody>
        <StepFooter>
          <Button size="lg" block onClick={enable} loading={busy}>Remind me at {nudgeLabel(time)}</Button>
          <Button size="lg" block variant="quiet" onClick={onNext}>Not now</Button>
        </StepFooter>
      </>
    )
  },
)
