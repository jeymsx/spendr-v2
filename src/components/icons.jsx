/**
 * Shared inline icons.
 *
 * Inline rather than files in public/ on purpose: these are drawn with
 * stroke="currentColor", so they inherit the accent colour and dark-mode text
 * colour from whatever renders them. An <img src="...svg"> cannot do that.
 *
 * Sizes and stroke weights that used to vary between copies are props, so each
 * call site keeps exactly the icon it had before.
 */

export function IconChevronRight({ size = 16, strokeWidth = '1.8', stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export function IconChevronLeft({ size = 18, strokeWidth = '2', stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

export function IconCalendar({ size = 16, strokeWidth = '1.8', stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

export function IconPlus({ size = 18, strokeWidth = '2.5', stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function IconCheck({ size = 14, strokeWidth = '2.5', stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function IconUpload({ size = 18, strokeWidth = '1.8', stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

export function IconBank({ size = 16, strokeWidth = '2', stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 20 7 4 7" fill="currentColor" fillOpacity="0.3" />
    </svg>
  )
}

export function IconCard({ size = 16, strokeWidth = '2', stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="3" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

export function IconPhone({ size = 16, strokeWidth = '2', stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="3" />
      <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" />
    </svg>
  )
}

export function IconWallet({ size = 16, strokeWidth = '2', stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
      <path d="M16 13a1 1 0 100 2 1 1 0 000-2z" fill="currentColor" />
      <path d="M20 7V5a2 2 0 00-2-2H6a2 2 0 00-2 2v2" />
    </svg>
  )
}

// ── Untitled UI Icons, renamed to what this app calls things ──────────────────
//
// Re-exported here rather than imported from '@untitledui/icons' at each call
// site, for two reasons.
//
// One: the choice of glyph is a design decision, and design decisions belong
// somewhere you can find them. "Which icon means overdue?" is answerable by
// reading this block; it is not answerable by grepping forty files for
// `<AlertTriangle>`.
//
// Two: swapping a glyph becomes a one-line change. `Stars01` for "celebrate"
// is the compromise in this list - Untitled UI has no confetti or party
// popper, and a gift box would have read as the Gifts category - so if it ever
// looks wrong it changes here and every site follows.
//
// ── Why this pack, and at 1.8 ──
//
// The set is 24x24 with round caps and joins, which is the same family the
// bottom navbar was drawn in. The navbar is NOT a pack: it is hand-drawn at
// 1.8 inactive / 2.2 active, with a duotone fill on the active tab that no
// stroke-only pack offers. So the pack is matched TO the navbar rather than
// the other way round, and the five navbar icons stay bespoke - their
// outline-to-filled active state is real tab-bar behaviour worth keeping.
//
// Untitled UI ships at strokeWidth 2. Stock 2 sitting next to the navbar's 1.8
// reads as two different sets, so `uui` overrides it once, here. It also sets
// the default size to 18, which is what most call sites in this app want; a
// call site can still pass either prop, because the spread comes last.
import {
  AlertTriangle, X as XClose, Check, Trash01, Download01, Scales02, Stars01,
  Bell01, Zap, Bank, Wallet01, CreditCard01, Phone01, BankNote01,
} from '@untitledui/icons'

function uui(Cmp, defaultSize = 18) {
  const Wrapped = ({ size = defaultSize, ...rest }) => (
    <Cmp size={size} strokeWidth={1.8} {...rest} />
  )
  Wrapped.displayName = `Icon(${Cmp.displayName ?? 'uui'})`
  return Wrapped
}

export const IconWarning   = uui(AlertTriangle)  // overdue, over budget, overdrawn
export const IconX         = uui(XClose)         // dismiss, and the error toast
export const IconTick      = uui(Check)          // distinct from IconCheck above, hand-drawn
export const IconTrash     = uui(Trash01)
export const IconImport    = uui(Download01)     // the import wizard's own affordance
export const IconBalance   = uui(Scales02)       // reconciling two sides, in the import wizard
export const IconSparkle   = uui(Stars01)        // "this row is new / unmatched", and celebrate
export const IconBell      = uui(Bell01)         // a bill falling due
export const IconTemplate  = uui(Zap)            // templates
export const IconBankUI    = uui(Bank)           // account types, replacing the emoji map
export const IconWalletUI  = uui(Wallet01)
export const IconCardUI    = uui(CreditCard01)
export const IconPhoneUI   = uui(Phone01)
export const IconCashUI    = uui(BankNote01)

/**
 * An account type's icon.
 *
 * This lived in lib/phAccounts.js as a map of emoji strings, next to the bank
 * lists and the colour palette. It has moved here because which glyph stands
 * for "savings" is a presentation decision and phAccounts.js is data - and
 * because a component map cannot live in a .js file without dragging
 * presentation imports into the data layer.
 *
 * bank and savings deliberately share a glyph, as they did before: the
 * distinction is what the money is FOR, not where it is, and inventing a
 * second building would imply a difference the app does not model.
 */
export const ACCOUNT_TYPE_ICON = {
  cash:    IconCashUI,
  ewallet: IconPhoneUI,
  bank:    IconBankUI,
  savings: IconBankUI,
  credit:  IconCardUI,
}
