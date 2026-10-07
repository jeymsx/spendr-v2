/**
 * Your name and currency.
 *
 * Lifted out of Settings.jsx unchanged.
 */
import { useState, useEffect } from 'react'
import { useBack } from '../../hooks/useBack'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import db from '../../db/db'
import { useToast } from '../../context/ToastContext'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import SectionLabel from '../../components/ui/SectionLabel'
import { inputClass } from './shared'
import { fieldFrame } from '../../components/ui/Field'
import CurrencyPickerSheet from '../../components/CurrencyPickerSheet'
import { currencyOf, symbolOf } from '../../lib/currency'
import SubPage from '../../components/SubPage'
import { useLeaveGuard } from '../../hooks/useBackGuard'
import DiscardSheet from '../../components/DiscardSheet'

// ── Profile sheet ──────────────────────────────────────────────────────────────

/**
 * Your name and the ledger's currency.
 *
 * ── Why this is a page on the phone ──
 *
 * It opened the currency picker, and the picker is a sheet, so it was a sheet
 * on a sheet: two scrims, two panels, the one underneath showing a sliver of
 * itself at the top and nothing you could read. Stacking is supported - Sheet
 * keeps a stack so Escape only reaches the innermost - but supported is not
 * the same as good, and a form whose whole job is to open another surface is
 * the case where it reads worst.
 *
 * So `variant` decides the chrome and nothing else. The phone gets a page and
 * the picker opens cleanly over it; the desktop keeps the sheet, which
 * index.css already renders as a centred modal and where a full-page route
 * would be wrong. Exactly what AccountFormSheet does, for exactly the same
 * reason - see the note there.
 */
export function ProfileSheet({
  open, onClose, displayName: initName, currency: initCurrency, variant = 'sheet',
}) {
  const isPage = variant === 'page'
  const { showToast } = useToast()
  const [saving,   setSaving]   = useState(false)
  const [name,     setName]     = useState('')
  const [currency, setCurrency] = useState('PHP')
  const [pickerOpen, setPickerOpen] = useState(false)

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
    setPickerOpen(false)
  }, [open, initName, initCurrency])

  /* Whether leaving would lose something (hooks/useBackGuard.js): the name
     or the currency moved from what was saved. */
  const dirty = open && !saving
    && (name.trim() !== String(initName || '').trim() || currency !== (initCurrency || 'PHP'))
  const leaveGuard = useLeaveGuard(isPage && dirty, onClose)

  async function handleSave() {
    setSaving(true)
    try {
      /* Stamped, like every other preference write: pullPreferences takes
         the newer of the two sides and cannot do that without a time. */
      const now = new Date().toISOString()
      await db.meta.put({ key: 'displayName', value: name.trim(), updatedAt: now })
      await db.meta.put({ key: 'currency',    value: currency,    updatedAt: now })
      /* Straight to onClose rather than through the old close(), which
         opened with `if (saving) return`. That guard only ever passed here
         because it read the pre-click `saving` out of a stale closure;
         calling it with the current value would have refused to close the
         sheet it had just finished saving. */
      leaveGuard.leave(onClose)
    } catch (e) {
      console.error('[ProfileSheet] save failed:', e)
      showToast('Failed to save profile', 'error')
      setSaving(false)
    }
  }

  /* A page renders nothing when it is not open, the way the sheet does -
     the route mounts it with open={true}, so this only guards the moment
     after a save navigates away. */
  if (isPage && !open) return null

  const body = (
    <div className="pt-2">
        <SectionLabel>Display name</SectionLabel>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your name"
          maxLength={40}
          className={inputClass()}
        />

        {/* The preference has existed since the first sync and nothing ever
            offered a way to set it - every ledger in the wild says PHP because
            that is the literal the code wrote. This is that control.

            A row that opens a picker rather than an input: the frame is the
            same fieldFrame every other non-input "field" in this app wears
            (the account row, the date row, the category row), so it reads as
            part of the form and not as a button stuck under it. */}
        <SectionLabel className="mt-5">Currency</SectionLabel>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={saving}
          className={`${fieldFrame()} press press-fade w-full text-left active:bg-slate-50 dark:active:bg-primary/[0.12]`}
        >
          <span
            className="w-7 shrink-0 text-15 font-semibold text-slate-700 dark:text-white"
            aria-hidden="true"
          >
            {symbolOf(currency)}
          </span>
          <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 dark:text-white truncate">
            {currencyOf(currency).name}
          </span>
          <span className="shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">
            {currency}
          </span>
          <svg className="shrink-0 text-slate-300 dark:text-slate-600" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5,2 9,7 5,12" />
          </svg>
        </button>

        {/* What changing it does and does not do. Somebody switching to
            dollars is entitled to know their 1,036 rows are not being
            converted behind their back - the figures are the figures, and
            this is the mark drawn in front of them. */}
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-snug">
          The mark shown on every figure that is not tied to a particular
          account. It does not convert anything you have already recorded.
        </p>
    </div>
  )

  const footer = (
    <div className="flex gap-3">
      <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button className="flex-[2]" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save profile'}
      </Button>
    </div>
  )

  return (
    <>
    {isPage ? (
      <SubPage title="Edit profile" onBack={saving ? () => {} : leaveGuard.tryLeave}>
        <div className="px-5">
          {body}
          {/* On the page the actions are the last thing in the flow rather
              than pinned: there is one screenful here, so a fixed bar would
              reserve height for a scroll that never happens. */}
          <div className="mt-8">{footer}</div>
        </div>
      </SubPage>
    ) : (
      <Sheet
        open={open}
        onClose={onClose}
        z={100}
        scrim={45}
        title="Edit profile"
        /* The header's Cancel, in the slot built for it - outside the <h3>,
           so the word does not become part of the dialog's accessible name. */
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
           that is writing the profile must not be dismissed by the scrim or
           by Escape out from under the write. */
        dismissible={!saving}
        unsaved={dirty}
        footer={footer}
      >
        {body}
      </Sheet>
    )}
    {isPage && <DiscardSheet open={leaveGuard.asking} onKeep={leaveGuard.keep} onDiscard={leaveGuard.discard} />}

    {/* Outside both shells, so it is a sheet over a PAGE on the phone and the
        only stacked sheet on the desktop, where a centred modal over a
        centred modal is the layout that actually works. */}
    <CurrencyPickerSheet
      open={pickerOpen}
      onClose={() => setPickerOpen(false)}
      selected={currency}
      onSelect={setCurrency}
      z={isPage ? 100 : 140}
      hint="Your ledger's own currency. An account held in another one carries its own, set on the account."
    />
    </>
  )
}

/**
 * The route at /settings/profile.
 *
 * Reads its own initial values rather than taking them as props: it is
 * reached by URL, so there is no parent holding them - and a page that
 * depends on having been opened from somewhere in particular is a page that
 * breaks on a refresh or a back button.
 */
export function ProfilePage() {
  const back = useBack()
  const meta = useLiveQuery(() => db.meta.toArray(), [], undefined)
  // Undefined until Dexie answers. Rendering the form against defaults first
  // would flash "PHP" at somebody whose ledger is in dollars.
  if (meta === undefined) return <div className="pb-page" />

  const displayName = meta.find(m => m.key === 'displayName')?.value ?? ''
  const currency = meta.find(m => m.key === 'currency')?.value ?? 'PHP'

  return (
    <ProfileSheet
      variant="page"
      open
      onClose={back}
      displayName={displayName}
      currency={currency}
    />
  )
}
