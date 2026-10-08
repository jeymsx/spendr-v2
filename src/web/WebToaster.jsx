import { useEffect } from 'react'
import { Toaster, toast } from 'sonner'
import { setToastPresenter } from '../context/ToastContext'
import { useTheme } from '../context/ThemeContext'
import { IconTick, IconWarning, IconX } from '../components/icons'

/**
 * Toasts on the desktop: cards in the bottom right corner, the way a web app
 * shows them - a list, newest at the bottom, each one whole, with its icon,
 * its button when it has one (Undo), and a close that is always there.
 *
 * ── A list, not a deck ──
 *
 * sonner's own stack folds the older toasts behind the newest and fans them
 * out under the pointer. Unstyled (the look is the app's own, web.css
 * `.web-toast`), the folded ones were never hidden: their words showed round
 * the edges of the one in front, which read as toasts drawn over each other.
 * `expand` lays them out one under another, three at most; a fourth waits
 * for a place.
 *
 * ── The same news twice is once ──
 *
 * A toast without a button is keyed by its words, so saving three
 * transactions in a row is one "Transaction saved" that stays a moment
 * longer, not three. A toast with an Undo is never folded into another: each
 * one undoes its own thing.
 *
 * Every page still calls the one showToast() - ToastContext hands each toast
 * here while this is mounted, and the phone keeps its bar. While this is not
 * mounted (the lock screen draws before the app) the phone's bar shows in its
 * place, so a toast is never shown nowhere.
 */
export default function WebToaster() {
  const { theme } = useTheme()

  useEffect(() => {
    const root = document.documentElement
    root.classList.add('web-toaster')
    const stop = setToastPresenter({
      show({ message, type, actionLabel, onAction, duration }) {
        const show = type === 'error' ? toast.error : type === 'warning' ? toast.warning : toast.success
        show(message, {
          ...(actionLabel ? {} : { id: `${type}:${message}` }),
          // Long enough to read and reach: longer still with a button on it.
          duration: duration ?? (actionLabel ? 7000 : type === 'error' ? 5000 : 3500),
          action: actionLabel ? { label: actionLabel, onClick: () => onAction?.() } : undefined,
        })
      },
      dismiss() { toast.dismiss() },
    })
    return () => { stop(); root.classList.remove('web-toaster') }
  }, [])

  return (
    <Toaster
      position="bottom-right"
      theme={theme === 'dark' ? 'dark' : 'light'}
      expand
      offset={24}
      gap={8}
      visibleToasts={3}
      closeButton
      icons={{
        success: <span className="web-toast-mark web-toast-mark-success"><IconTick size={12} /></span>,
        warning: <span className="web-toast-mark web-toast-mark-warning"><IconWarning size={12} /></span>,
        error: <span className="web-toast-mark web-toast-mark-error"><IconX size={12} /></span>,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'web-toast',
          title: 'web-toast-title',
          icon: 'web-toast-icon',
          actionButton: 'web-toast-action',
          closeButton: 'web-toast-close',
        },
      }}
    />
  )
}
