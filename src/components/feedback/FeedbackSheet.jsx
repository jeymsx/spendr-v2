import Sheet from '../ui/Sheet'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Switch from '../ui/Switch'
import Segmented from '../ui/Segmented'
import { fieldSurface } from '../ui/Field'
import { cx } from '../ui/cx'
import { FEEDBACK_KINDS, MAX_MESSAGE, feedbackTitle } from '../../lib/feedback'

/**
 * Report a bug, on the phone: what kind, what happened, and Send - to the
 * person who makes Spendr, who reads it in their own Settings. The state and
 * the sending are useFeedback.js, beside this, shared with the computer's dialog.
 *
 * @param {{f: import('./useFeedback').FeedbackForm}} props
 */
export default function FeedbackSheet({ f }) {
  const errors = f.crashes.length
  return (
    <Sheet
      open={f.open}
      onClose={f.close}
      z={100}
      scrim={45}
      title={feedbackTitle(f.kind)}
      unsaved="typed"
      dismissible={!f.sending}
      footer={(
        <Button block onClick={f.send} loading={f.sending} disabled={!f.message.trim()}>
          {f.canSend ? 'Send' : 'Email it'}
        </Button>
      )}
    >
      <div className="pt-1 pb-2 flex flex-col gap-4">
        <Segmented
          options={FEEDBACK_KINDS.map(k => ({ value: k.value, label: k.label }))}
          value={f.kind}
          onChange={v => f.setKind(/** @type {any} */ (v))}
        />

        <textarea
          value={f.message}
          onChange={e => f.setMessage(e.target.value)}
          placeholder={f.placeholder}
          aria-label={feedbackTitle(f.kind)}
          rows={6}
          maxLength={MAX_MESSAGE}
          className={cx(
            'block w-full min-h-[148px] resize-none rounded-3xl px-5 py-4',
            fieldSurface(!!f.error),
            'text-sm leading-relaxed font-medium text-slate-800 dark:text-white',
            'placeholder-slate-400 dark:placeholder-slate-500 placeholder:font-normal outline-none',
          )}
        />

        {/* The errors this device noticed, with a bug only, and only if left on. */}
        {f.kind === 'bug' && errors > 0 && (
          <Card surface="recessed" className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex-1 min-w-0">
              <span className="block text-14 font-semibold text-slate-800 dark:text-white">Include the error log</span>
              <span className="block mt-0.5 text-12 text-slate-500 dark:text-slate-400">
                {errors} error{errors === 1 ? '' : 's'} this device noticed
              </span>
            </span>
            <Switch on={f.attachLog} onChange={f.setAttachLog} label="Include the error log" />
          </Card>
        )}

        {f.error && <p role="alert" className="px-1 text-13 font-medium text-red-600 dark:text-red-400">{f.error}</p>}

        <p className="px-1 text-12 leading-relaxed text-slate-500 dark:text-slate-400">
          {f.canSend
            ? 'Goes to the person who makes Spendr, with your name, the app version and your device. None of your money is included.'
            : 'You’re not signed in, so this opens as an email instead.'}
        </p>
      </div>
    </Sheet>
  )
}
