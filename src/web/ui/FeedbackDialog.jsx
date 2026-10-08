import Dialog from './Dialog'
import Btn from './Button'
import { Segmented } from './controls'
import Switch from '../../components/ui/Switch'
import { FEEDBACK_KINDS, MAX_MESSAGE, feedbackTitle } from '../../lib/feedback'

/**
 * Report a bug, on a computer: the phone's form (components/feedback/
 * FeedbackSheet) as a dialog, over the same state and sending
 * (components/feedback/useFeedback.js).
 *
 * @param {{f: import('../../components/feedback/useFeedback').FeedbackForm}} props
 */
export default function FeedbackDialog({ f }) {
  const errors = f.crashes.length
  return (
    <Dialog
      open={f.open}
      onClose={f.close}
      title={feedbackTitle(f.kind)}
      width={500}
      actions={(
        <>
          <Btn onClick={f.close} disabled={f.sending}>Cancel</Btn>
          <Btn variant="primary" onClick={f.send} disabled={f.sending || !f.message.trim()}>
            {f.sending ? 'Sending…' : f.canSend ? 'Send' : 'Email it'}
          </Btn>
        </>
      )}
    >
      <div className="flex flex-col gap-3 pt-1">
        <Segmented
          label="What you are sending"
          options={FEEDBACK_KINDS.map(k => ({ value: k.value, label: k.label }))}
          value={f.kind}
          onChange={v => f.setKind(/** @type {any} */ (v))}
        />
        <textarea
          data-autofocus
          value={f.message}
          onChange={e => f.setMessage(e.target.value)}
          placeholder={f.placeholder}
          aria-label={feedbackTitle(f.kind)}
          rows={7}
          maxLength={MAX_MESSAGE}
          className="d-input d-textarea"
        />
        {f.kind === 'bug' && errors > 0 && (
          <label className="flex items-center gap-3 text-13 text-[var(--d-text)]">
            <span className="flex-1 min-w-0">
              Include the error log
              <span className="text-[var(--d-text-3)]"> · {errors} error{errors === 1 ? '' : 's'} this device noticed</span>
            </span>
            <Switch on={f.attachLog} onChange={f.setAttachLog} label="Include the error log" />
          </label>
        )}
        {f.error && <p role="alert" className="font-medium d-neg">{f.error}</p>}
        <p className="text-12 text-[var(--d-text-3)]">
          {f.canSend
            ? 'Goes to the person who makes Spendr, with your name, the app version and your device. None of your money is included.'
            : 'You’re not signed in, so this opens as an email instead.'}
        </p>
      </div>
    </Dialog>
  )
}
