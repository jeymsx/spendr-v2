import { useLayoutEffect, useState } from 'react'
import Popover from './Popover'
import { AccountChip } from '../../components/AccountPickerSheet'
import { TYPE_LABEL } from '../../lib/accountMeta'
import { fmt } from '../../lib/money'
import { ICheck } from './icons'

/**
 * Picking an account on a computer: a menu dropping from the field that
 * opened it, as every other choice on the desktop is (PickSelect, the date
 * fields), rather than the phone's sheet in the middle of the window
 * (components/AccountPickerSheet, which hands over to this on a computer).
 *
 * The same list as the sheet's: each account's card face, its name and
 * kind, what it holds (what is available, on a card), parents with their
 * sub-accounts under them, in the order you gave them. The one in use is
 * ticked, and has the focus as it opens; the arrows, Home and End move,
 * Enter picks, Escape closes.
 *
 * Its callers open it with a flag, not from a trigger of their own, so the
 * field it drops from is the one last pressed (useOpener).
 *
 * @param {{open: boolean, anchor: HTMLElement, onClose: () => void, accounts: any[], selected: any,
 *          onSelect: (acct: any) => void, exclude?: Array<string|number>, creditAvailMap: Record<string, number>}} props
 */
export default function AccountMenu({ open, anchor, onClose, accounts, selected, onSelect, exclude = [], creditAvailMap }) {
  const items = pickerItems(accounts, exclude)
  const width = Math.round(Math.min(560, Math.max(320, anchor.getBoundingClientRect().width)))
  return (
    <Popover
      role="menu"
      anchor={anchor}
      open={open}
      onOpenChange={(v) => { if (!v) onClose() }}
      width={width}
      label="Select account"
    >
      <div className="max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain flex flex-col gap-0.5">
        {items.map(({ acct, children }) => (
          <div key={acct.id} className="flex flex-col gap-0.5">
            <Item acct={acct} selected={selected} creditAvailMap={creditAvailMap} onPick={(a) => { onSelect(a); onClose() }} />
            {children.map(c => (
              <Item key={c.id} child acct={c} selected={selected} creditAvailMap={creditAvailMap} onPick={(a) => { onSelect(a); onClose() }} />
            ))}
          </div>
        ))}
      </div>
    </Popover>
  )
}

/** @param {{acct: any, selected: any, creditAvailMap: Record<string, number>, onPick: (a: any) => void, child?: boolean}} props */
function Item({ acct, selected, creditAvailMap, onPick, child = false }) {
  const credit = acct.type === 'credit'
  const on = selected?.id === acct.id
  return (
    <button type="button" role="menuitemradio" aria-checked={on} className={`d-acct-item${child ? ' is-child' : ''}`} onClick={() => onPick(acct)}>
      <AccountChip acct={acct} size={child ? 'sm' : 'md'} />
      <span className="flex-1 min-w-0">
        <span className="d-acct-name truncate">{acct.name}</span>
        <span className="d-acct-sub truncate">{TYPE_LABEL[acct.type] ?? acct.type}</span>
      </span>
      <span className="shrink-0">
        <span className="d-acct-bal">{fmt(credit ? (creditAvailMap?.[acct.name] ?? 0) : acct.balance, acct.currency)}</span>
        <span className="d-acct-sub text-right">{credit ? 'available' : 'balance'}</span>
      </span>
      <span className="w-4 shrink-0 text-[var(--d-accent)]" aria-hidden="true">{on && <ICheck size={16} />}</span>
    </button>
  )
}

/**
 * The accounts to list, in order: each top-level account (a parent, or one
 * with none) with its sub-accounts under it - the sheet's own grouping
 * (components/AccountPickerSheet).
 *
 * @param {any[]} accounts @param {Array<string|number>} exclude
 */
export function pickerItems(accounts, exclude) {
  const all = accounts ?? []
  const parentNames = new Set(all.filter(a => a.parentName).map(a => a.parentName))
  const selectable = all.filter(a => !exclude.includes(a.id))
  const byOrder = (/** @type {any[]} */ arr) => [...arr].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
  const parents = selectable.filter(a => parentNames.has(a.name))
  const parentSet = new Set(parents.map(a => a.name))
  const flat = selectable.filter(a => !parentNames.has(a.name) && (!a.parentName || !parentSet.has(a.parentName)))
  return byOrder([...parents, ...flat]).map(acct => ({
    acct,
    children: parentNames.has(acct.name) ? byOrder(selectable.filter(a => a.parentName === acct.name)) : [],
  }))
}

/* The element last pressed, so a picker opened by a flag knows where to drop
   from. A press is a pointer's; a key's is whatever has the focus. */
/** @type {Element|null} */
let pressed = null
let pressedAt = 0
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => { pressed = /** @type {Element} */ (e.target); pressedAt = performance.now() }, true)
}

/**
 * On a computer, the control that opened a picker as `open` turns true -
 * the button last pressed, or the focused one when it was opened by key.
 * Null on a phone, and null when there is none to drop from, so the caller
 * keeps its sheet. Undefined for the moment between `open` turning true and
 * the opener being found - before the first paint - when the caller draws
 * nothing, so its sheet never starts to open in the menu's place.
 *
 * @param {boolean} open
 * @returns {HTMLElement|null|undefined}
 */
export function useOpener(open) {
  const [desktop] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('web'))
  const [seen, setSeen] = useState(/** @type {{open: boolean, el: HTMLElement|null}} */ ({ open: false, el: null }))
  useLayoutEffect(() => {
    if (!desktop) return
    /* Kept as it closes, so the menu closes where it opened. Set in a layout
       effect, before the browser paints: the press it reads has happened,
       and nothing of the sheet is drawn in between. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!open) { setSeen(s => (s.open ? { open: false, el: s.el } : s)); return }
    const recent = pressed && performance.now() - pressedAt < 1500 ? pressed : null
    const from = /** @type {Element|null} */ (recent ?? document.activeElement)
    const el = /** @type {HTMLElement|null} */ (from?.closest?.('button, [role="button"], a') ?? null)
    setSeen({ open: true, el: el && el.isConnected ? el : null })
  }, [desktop, open])
  if (!desktop) return null
  if (open && !seen.open) return undefined
  return seen.el
}
