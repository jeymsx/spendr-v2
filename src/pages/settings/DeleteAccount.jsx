import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import { deleteMyAccount, eraseThisDevice } from '../../lib/eraseDevice'
import { IconTrash, inputClass } from './shared'

/**
 * Delete my account: the cloud copy and the sign-in, for good, and this device
 * with them (035_public_readiness.sql delete_my_account, lib/eraseDevice.js).
 *
 * Two steps, as Reset app has, because nothing brings it back: what goes, then
 * the word typed. Erasing the device too is not a choice offered: an account
 * deleted with its data still on the phone is an account half deleted, and
 * Backup & restore is one tap away for anyone who wants a copy first.
 *
 * @param {{open: boolean, onClose: () => void}} props
 */
export function DeleteAccountSheet({ open, onClose }) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [step, setStep] = useState(1)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    // Fresh each time it opens - reset on the way in, as ResetConfirmModal does.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(1); setInput(''); setBusy(false); setError('')
  }, [open])

  async function remove() {
    setBusy(true)
    setError('')
    try {
      await deleteMyAccount()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete your account.')
      setBusy(false)
      return
    }
    /* The account is gone; what is left is this device. Signing out after the
       account has gone can itself fail (the session it would end is gone too),
       and that is no reason to stop. */
    try { await eraseThisDevice() } catch (e) { console.error('[DeleteAccount] erase failed:', e) }
    try { await signOut() } catch { /* already gone */ }
    window.location.replace('/')
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={200}
      scrim={60}
      handle={false}
      dismissible={!busy}
      ariaLabel="Delete my account"
      footer={(
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {step === 1 ? (
            <Button variant="danger" size="sm" className="flex-1" onClick={() => setStep(2)}>
              Continue
            </Button>
          ) : (
            <Button variant="danger" size="sm" className="flex-1" loading={busy} disabled={input !== 'DELETE'} onClick={remove}>
              Delete for good
            </Button>
          )}
        </div>
      )}
    >
      <div className="pt-6 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-500/15 flex items-center justify-center mx-auto text-red-500 dark:text-red-400">
          <IconTrash />
        </div>

        {step === 1 ? (
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Delete your account?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Your Spendr account and everything synced to it are deleted from the cloud: transactions, accounts, budgets, bills, goals, debts and reminders. This device is erased too, and your other devices stop syncing. It can&apos;t be undone.
            </p>
            <button
              type="button"
              onClick={() => { onClose(); navigate('/settings/backup') }}
              className="mt-3 text-13 font-semibold accent-ink"
            >
              Save a backup first
            </button>
          </div>
        ) : (
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Are you sure?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Type <span className="font-bold text-red-500">DELETE</span> to confirm.
            </p>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="DELETE"
              aria-label="Type DELETE to confirm"
              className={inputClass()}
              autoFocus
            />
            {error && <p role="alert" className="mt-3 text-13 font-medium text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}
      </div>
    </Sheet>
  )
}
