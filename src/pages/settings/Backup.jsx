/**
 * Restoring from a backup file, and wiping the device.
 *
 * Lifted out of Settings.jsx unchanged. The two destructive flows kept
 * together because they are the two screens where being careful matters most,
 * and they should be read side by side.
 */
import { useState, useEffect, useRef } from 'react'
import db from '../../db/db'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { inspectBackup, restoreBackup } from '../../lib/backup'
import { IconUpload } from '../../components/icons'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import SectionLabel from '../../components/ui/SectionLabel'
import { IconTrash, inputClass } from './shared'

// ── Restore-from-backup sheet ──────────────────────────────────────────────────

export function RestoreBackupSheet({ open, onClose }) {
  const { showToast } = useToast()
  const [step,    setStep]    = useState(1) // 1=pick file, 2=typed confirm
  const [info,    setInfo]    = useState(null)
  const [raw,     setRaw]     = useState(null)
  const [error,   setError]   = useState('')
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const fileRef = useRef(null)

  /* No scroll lock and no `closing` flag: Sheet owns the overlay, the panel,
     the scroll lock, Escape, the focus trap and the exit animation. */

  useEffect(() => {
    if (!open) return
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // Resetting on the way IN rather than on the way out also keeps the
    // panel intact for the 240ms the exit animation runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(1); setInfo(null); setRaw(null); setError(''); setInput(''); setLoading(false)
  }, [open])

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    if (!file.name.toLowerCase().endsWith('.json')) {
      setError('Pick the .json backup file.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result)
        setInfo(inspectBackup(text))
        setRaw(text)
        setStep(2)
      } catch (err) {
        setError(err.message)
      }
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
  }

  async function handleRestore() {
    setLoading(true)
    try {
      const res = await restoreBackup(raw)
      showToast(`Restored ${res.counts.transactions} transactions`)
      // Reload so every live query re-reads from scratch rather than
      // reconciling a wholesale table replacement.
      window.location.replace('/')
    } catch (err) {
      console.error('[Restore] failed:', err)
      showToast('Restore failed', 'error')
      setLoading(false)
    }
  }

  const c = info?.counts ?? {}
  const summary = [
    [c.transactions, 'transactions'], [c.accounts, 'accounts'],
    [c.categories, 'categories'], [c.recurring, 'recurring'],
    [c.debts, 'debts'], [c.templates, 'templates'],
  ].filter(([n]) => n > 0)

  return (
    /* Was a hand-rolled centred card. It stays centred on desktop - that is
       what `html.web .sheet-panel` does to every sheet - so the geometry is
       the primitive's now, and only the z-index and the scrim depth of the
       old overlay are carried across by hand. */
    <Sheet
      open={open}
      onClose={onClose}
      z={200}
      scrim={60}
      /* It had no grab handle as a centred card, and gains none here. */
      handle={false}
      /* The headings stay in the body, centred under the icon, so the dialog
         is named here rather than through Sheet's title slot. */
      ariaLabel="Restore backup"
      footer={step === 1 ? (
        <div className="flex flex-col gap-2.5">
          <Button block onClick={() => fileRef.current?.click()}>
            Choose file
          </Button>
          <Button variant="secondary" block onClick={onClose}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <Button
            variant="danger"
            block
            onClick={handleRestore} disabled={input.trim().toUpperCase() !== 'RESTORE' || loading}
          >
            {loading ? 'Restoring…' : 'Replace my data'}
          </Button>
          <Button variant="secondary" block onClick={onClose} disabled={loading}>
            Cancel
          </Button>
        </div>
      )}
    >
      {/* pt-6 for the old card's p-6 top edge: with no handle and no title
          there is nothing above the icon to hold it off the panel edge. */}
      <div className="pt-6 space-y-4">

        <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-500/15
          flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
          <IconUpload />
        </div>

        {step === 1 && (
          <>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Restore backup</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Pick a <span className="font-semibold">.json</span> backup. Its contents replace
                what's on this device — anything not in the file is removed.
              </p>
            </div>
            {error && (
              <p className="text-xs text-red-500 dark:text-red-400 text-center px-2">{error}</p>
            )}
            {/* The `hidden` ATTRIBUTE as well as the class, because Sheet's
                Tab trap skips nodes by the attribute: a display:none input
                left in the ring is focusable to querySelectorAll but not to
                focus(), and Tab dead-ends on it. */}
            <input ref={fileRef} type="file" accept=".json,application/json"
              onChange={handleFile} className="hidden" hidden />
          </>
        )}

        {step === 2 && (
          <>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Replace all data?</h3>
              {info?.exportedAt && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
                  Backup from {new Date(info.exportedAt).toLocaleString('en-PH', {
                    dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 dark:bg-white/[0.04] px-4 py-3 flex flex-col gap-1.5">
              {summary.map(([n, label]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
                  <span className="text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">{n}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 text-center px-1">
              Your name, currency and theme are kept. If you're signed in, the next
              sync pushes this state to the cloud.
            </p>

            <div>
              <SectionLabel>Type RESTORE to confirm</SectionLabel>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="RESTORE"
                autoCapitalize="characters"
                className="w-full px-4 py-3 rounded-2xl text-sm font-semibold tracking-wide
                  bg-slate-50 dark:bg-white/[0.05] text-slate-800 dark:text-white
                  border border-slate-200 dark:border-white/[0.09] outline-none
                  focus:border-primary dark:focus:border-primary"
              />
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

// ── Reset confirm modal ────────────────────────────────────────────────────────

export function ResetConfirmModal({ open, onClose }) {
  const { showToast } = useToast()
  const [step,    setStep]    = useState(1) // 1=warn 2=typing-confirm
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const { signOut } = useAuth()

  /* No scroll lock and no `closing` flag: Sheet owns the overlay, the panel,
     the scroll lock, Escape, the focus trap and the exit animation. */

  useEffect(() => {
    if (!open) return
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // Resetting on the way IN rather than on the way out also keeps the
    // panel intact for the 240ms the exit animation runs - a confirmation
    // that snaps back to step 1 mid-slide reads as a glitch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(1); setInput(''); setLoading(false)
  }, [open])

  async function handleReset() {
    setLoading(true)
    try {
      await db.transaction('rw', [
        db.transactions, db.balances, db.accounts,
        db.categories, db.debts, db.recurring, db.templates, db.meta,
      ], async () => {
        await db.transactions.clear()
        await db.balances.clear()
        await db.accounts.clear()
        await db.categories.clear()
        await db.debts.clear()
        await db.recurring.clear()
        await db.templates.clear()
        await db.meta.clear()
      })
      // Sign out so the Onboarding auto-sign-in effect doesn't fire on reload
      await signOut()
      window.location.replace('/')
    } catch (e) {
      console.error('[Settings] reset failed:', e)
      showToast('Reset failed', 'error')
      setLoading(false)
    }
  }

  return (
    /* Same story as RestoreBackupSheet: a hand-rolled centred card, which is
       what `html.web .sheet-panel` already makes of every sheet on desktop.
       Only the z-index and the scrim depth carry across by hand. */
    <Sheet
      open={open}
      onClose={onClose}
      z={200}
      scrim={60}
      /* It had no grab handle as a centred card, and gains none here. */
      handle={false}
      /* Both headings live in the body, centred under the icon, so the
         dialog is named here rather than through Sheet's title slot. */
      ariaLabel="Reset app"
      footer={step === 1 ? (
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="flex-1"
            onClick={() => setStep(2)}
          >
            Continue
          </Button>
        </div>
      ) : (
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={onClose} disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="flex-1"
            onClick={handleReset} disabled={loading || input !== 'RESET'}
          >
            {loading ? 'Resetting…' : 'Reset app'}
          </Button>
        </div>
      )}
    >
      {/* pt-6 for the old card's p-6 top edge: with no handle and no title
          there is nothing above the icon to hold it off the panel edge. */}
      <div className="pt-6 space-y-4">

        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-500/15
          flex items-center justify-center mx-auto text-red-500 dark:text-red-400">
          <IconTrash />
        </div>

        {step === 1 && (
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Reset app?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This will permanently delete all transactions, accounts, categories, debts, and recurring payments. This cannot be undone.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Are you sure?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Type <span className="font-bold text-red-500">RESET</span> to confirm.
            </p>
            {/* Still autoFocus rather than Sheet's initialFocus: the field
                only exists once Continue has been pressed, so the keyboard
                is wanted at that moment and not when the sheet opens. */}
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="RESET"
              className={inputClass()}
              autoFocus
            />
          </div>
        )}
      </div>
    </Sheet>
  )
}
