/**
 * Your name and currency, and the Google Sheets connection.
 *
 * Lifted out of Settings.jsx unchanged.
 */
import { useState, useEffect } from 'react'
import db from '../../db/db'
import { useToast } from '../../context/ToastContext'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import SectionLabel from '../../components/ui/SectionLabel'
import { inputClass } from './shared'

// ── Profile sheet ──────────────────────────────────────────────────────────────

export function SheetsConfigSheet({ open, onClose, onSync, syncing }) {
  const [url,      setUrl]      = useState('')
  const [saving,   setSaving]   = useState(false)
  const [lastSync, setLastSync] = useState(null)

  /* No `closing` flag, no scroll lock and no local close(): Sheet owns the
     overlay, the panel, the grab handle, the scroll lock, Escape, the focus
     trap and the exit animation, and `open` is the only thing that decides
     any of it. */

  useEffect(() => {
    if (!open) return
    db.meta.get('sheetsUrl').then(r => setUrl(r?.value ?? ''))
    db.meta.get('sheetsLastSynced').then(r => setLastSync(r?.value ?? null))
  }, [open])

  async function handleSave() {
    setSaving(true)
    await db.meta.put({ key: 'sheetsUrl', value: url.trim() })
    setSaving(false)
  }

  async function handleSync() {
    await handleSave()
    await onSync(url.trim())
    db.meta.get('sheetsLastSynced').then(r => setLastSync(r?.value ?? null))
  }

  const fmtLast = lastSync
    ? new Date(lastSync).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  return (
    /* The same z and the same 45% scrim it drew by hand, and Sheet's default
       `bg-panel` surface is the one it already had.

       No maxHeight: this panel never asked for a height, so it keeps floating
       while it fits and lets Sheet dock it when it does not. The line under
       the heading moves into the body rather than staying in the header -
       Sheet's title slot holds text only, so a second paragraph cannot leak
       into the dialog's accessible name. */
    <Sheet
      open={open}
      onClose={onClose}
      z={100}
      scrim={45}
      title="Google Sheets Sync"
      footer={(
        <Button size="lg" block onClick={handleSync} disabled={syncing || !url.trim()}>
          {syncing
            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Syncing…</>
            : 'Sync Now'}
        </Button>
      )}
    >
      <div className="pt-1 flex flex-col gap-4">
        <p className="text-[12px] text-slate-400 dark:text-slate-500">
          Paste your Apps Script Web App URL to enable syncing.
        </p>

        <div>
          <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2 block">
            Apps Script URL
          </label>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/…/exec"
            className="w-full h-[48px] rounded-xl px-4 text-[13px]
              bg-slate-50 dark:bg-white/[0.05]
              border border-slate-200 dark:border-white/[0.10]
              text-slate-800 dark:text-white
              placeholder:text-slate-400 dark:placeholder:text-slate-600
              focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={handleSave}
            disabled={saving || !url.trim()}
            className="mt-2 text-[12px] font-medium text-primary disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save URL'}
          </button>
        </div>

        {fmtLast && (
          <p className="text-[12px] text-slate-400 dark:text-slate-500">
            Last synced: {fmtLast}
          </p>
        )}
      </div>
    </Sheet>
  )
}

export function ProfileSheet({ open, onClose, displayName: initName, currency: initCurrency }) {
  const { showToast } = useToast()
  const [saving,   setSaving]   = useState(false)
  const [name,     setName]     = useState('')
  const [currency, setCurrency] = useState('PHP')

  /* No `closing` flag and no scroll lock: Sheet owns the overlay, the panel,
     the grab handle, the scroll lock, Escape, the focus trap and the exit
     animation. Closing is just onClose now. */

  useEffect(() => {
    if (!open) return
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaving(false)
    setName(initName || '')
    setCurrency(initCurrency || 'PHP')
  }, [open, initName, initCurrency])

  async function handleSave() {
    setSaving(true)
    try {
      await db.meta.put({ key: 'displayName', value: name.trim() })
      await db.meta.put({ key: 'currency',    value: currency })
      /* Straight to onClose rather than through the old close(), which
         opened with `if (saving) return`. That guard only ever passed here
         because it read the pre-click `saving` out of a stale closure;
         calling it with the current value would have refused to close the
         sheet it had just finished saving. */
      onClose()
    } catch (e) {
      console.error('[ProfileSheet] save failed:', e)
      showToast('Failed to save profile', 'error')
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={100}
      scrim={45}
      title="Edit Profile"
      /* The header's Cancel, in the slot built for it - outside the <h3>, so
         the word does not become part of the dialog's accessible name. */
      titleAction={(
        <button
          onClick={onClose}
          disabled={saving}
          className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60"
        >
          Cancel
        </button>
      )}
      /* The other half of the old close()'s `if (saving) return`: a sheet
         that is writing the profile must not be dismissed by the scrim or by
         Escape out from under the write. */
      dismissible={!saving}
      footer={(
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-[2]" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </Button>
        </div>
      )}
    >
      <div className="pt-2">
        <SectionLabel>Display name</SectionLabel>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your name"
          maxLength={40}
          className={inputClass()}
        />
      </div>
    </Sheet>
  )
}
