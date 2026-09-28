import { useEffect } from 'react'
import { Toaster, toast } from 'sonner'
import { setToastPresenter } from '../context/ToastContext'
import { useTheme } from '../context/ThemeContext'
import { IconTick, IconWarning, IconX } from '../components/icons'

/**
 * Toasts on the desktop: cards in the bottom right corner, the newest on
 * top of a stack that fans out under the pointer, each with its icon, its
 * button when it has one (Undo), and a close.
 *
 * sonner draws and stacks them; the look is the app's own (web.css,
 * `.web-toast`). Every page still calls the one showToast() - ToastContext
 * hands each toast here while this is mounted, and the phone keeps its bar.
 *
 * On the phone there is one slot, and news that can wait is dropped rather
 * than shown over a toast with an Undo on it. Stacked, nothing pushes the
 * Undo away, so that rule has nothing to guard here.
 */
export default function WebToaster() {
  const { theme } = useTheme()

  useEffect(() => setToastPresenter({
    show({ message, type, actionLabel, onAction, duration }) {
      const show = type === 'error' ? toast.error : type === 'warning' ? toast.warning : toast.success
      show(message, {
        // Long enough to read and reach: longer still with a button on it.
        duration: duration ?? (actionLabel ? 7000 : type === 'error' ? 5000 : 3500),
        action: actionLabel ? { label: actionLabel, onClick: () => onAction?.() } : undefined,
      })
    },
    dismiss() { toast.dismiss() },
  }), [])

  return (
    <Toaster
      position="bottom-right"
      theme={theme === 'dark' ? 'dark' : 'light'}
      offset={24}
      gap={10}
      visibleToasts={4}
      closeButton
      icons={{
        success: <span className="web-toast-mark web-toast-mark-success"><IconTick size={14} /></span>,
        warning: <span className="web-toast-mark web-toast-mark-warning"><IconWarning size={14} /></span>,
        error: <span className="web-toast-mark web-toast-mark-error"><IconX size={14} /></span>,
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
