import { useCallback, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { clearCrashes, readCrashes } from '../../lib/crashLog'
import { canSendFeedback, emailLink, FEEDBACK_KINDS, sendFeedback } from '../../lib/feedback'
import { CONTACT_EMAIL } from '../../lib/contact'

/**
 * Report a bug: whether the form is open, what is in it, and sending it - for
 * the phone's sheet (FeedbackSheet, beside this) and the computer's
 * dialog (web/ui/FeedbackDialog) alike, so the two cannot disagree about what
 * a report holds.
 *
 * Signed in, it goes to the cloud (lib/feedback.js). Signed out, or with no
 * cloud set up, there is no account to send it as, so the same words open in
 * an email instead.
 *
 * @typedef {ReturnType<typeof useFeedback>} FeedbackForm
 */
export function useFeedback() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState(/** @type {import('../../lib/feedback').FeedbackKind} */ ('bug'))
  const [message, setMessage] = useState('')
  const [attachLog, setAttachLog] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  // Read when the form opens: localStorage, not Dexie, and the errors that matter happened before.
  const [crashes, setCrashes] = useState(/** @type {import('../../lib/crashLog').CrashEntry[]} */ ([]))

  const canSend = canSendFeedback() && !!user

  /** Open it, fresh, on a kind. @param {import('../../lib/feedback').FeedbackKind} [startOn] */
  const show = useCallback((startOn = 'bug') => {
    setKind(startOn)
    setMessage('')
    setAttachLog(true)
    setError('')
    setCrashes(readCrashes())
    setOpen(true)
  }, [])

  const close = useCallback(() => { if (!sending) setOpen(false) }, [sending])

  const send = useCallback(async () => {
    setError('')
    if (!message.trim()) { setError('Write something first.'); return }
    if (!canSend) {
      window.location.href = emailLink({ kind, message }, CONTACT_EMAIL)
      setOpen(false)
      return
    }
    setSending(true)
    try {
      const withLog = kind === 'bug' && attachLog && crashes.length > 0
      await sendFeedback({ kind, message, crashes, attachLog })
      // Sent with this one, so the next report carries only what is new.
      if (withLog) clearCrashes()
      setOpen(false)
      showToast(kind === 'idea' ? 'Thanks for the idea' : 'Thanks, it’s sent')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send it. Try again.')
    } finally {
      setSending(false)
    }
  }, [message, canSend, kind, attachLog, crashes, showToast])

  const placeholder = FEEDBACK_KINDS.find(k => k.value === kind)?.placeholder ?? ''

  return {
    open, show, close, send,
    kind, setKind, message, setMessage, attachLog, setAttachLog,
    crashes, sending, error, canSend, placeholder,
  }
}
