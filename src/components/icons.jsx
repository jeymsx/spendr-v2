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

/**
 * Downward arrow, for the connector between a transfer's two accounts.
 *
 * It was a local function in Transfer.jsx and a second, differently drawn one
 * in AddActionSheet.jsx - which is how the template form ended up importing a
 * name from here that this file had never exported. AddActionSheet keeps its
 * own: that sheet's icons are a 20x20 family at stroke 2.2, and pulling one
 * of them onto this 24x24 grid would leave it the odd weight in its own row.
 */
export function IconArrowDown({ size = 16, strokeWidth = '2', stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
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

/* Settings had its own copy at a fixed 18px. The dot is a 0.01-long line
   with a round cap rather than a <circle>, which is how Feather draws it -
   one shape, and it takes the same stroke width so it cannot drift out of
   weight with the stem above it. */
/* A rosette: the disc, and two ribbon tails crossing behind it. The tails are
   what separate it from a plain circle at 16px, which is why they are drawn
   long enough to break the disc's silhouette rather than tucked under it. */
export function IconAward({ size = 18, strokeWidth = '1.8', stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="6" />
      <path d="M8.2 13.9 7 22l5-3 5 3-1.2-8.1" />
    </svg>
  )
}

export function IconInfo({ size = 18, strokeWidth = '1.8', stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
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
  Receipt, SwitchHorizontal01,
  CalendarCheck01, CoinsHand, Grid01, Brush01, Palette, Settings01,
  Contrast01, ZapFast,
  Trophy01, Target04, CoinsStacked01, TrendUp01, BarChart10, Calculator,
  AlertCircle, CheckCircle,
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
export const IconReceipt   = uui(Receipt)            // a dated debt in Upcoming
export const IconTransferUI = uui(SwitchHorizontal01) // a transfer template

// Release-notes glyphs. Only What's New uses these, and only one row each -
// which is why they are the vaguest names in this block. They stand for a
// CHANGE ("bills got a page", "the colours are readable now") rather than for
// a thing in the app, so there is nothing more concrete to call them.
export const IconBillHistory = uui(CalendarCheck01)  // a bill and its posted charges
export const IconDebt        = uui(CoinsHand)        // money owed, in either direction
export const IconCategories  = uui(Grid01)
export const IconDrawn       = uui(Brush01)          // the icon set replacing the emoji
export const IconPalette     = uui(Palette)          // accent colour
export const IconSettings    = uui(Settings01)
export const IconContrast    = uui(Contrast01)       // the light-mode contrast pass
export const IconQuickLog    = uui(ZapFast)          // hold the + and type a line

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

/* Insight watermarks.
 *
 * The trivia card carries one of these big and clipped off its bottom-right
 * corner, the way an account card carries its brand mark - so they are read as
 * texture at 30% opacity rather than as glyphs, and only need to be the right
 * IDEA rather than legible at 18px.
 *
 * They replaced emoji. An OS emoji is a different colour, a different weight
 * and a different level of detail on every platform, which is fine at 20px
 * beside text and falls apart at 96px behind it - and there is no way to make
 * one white. */
export const IconTrophy    = uui(Trophy01)
export const IconTarget    = uui(Target04)
export const IconCoins     = uui(CoinsStacked01)
export const IconTrendUp   = uui(TrendUp01)
export const IconBarChart  = uui(BarChart10)
export const IconCalc      = uui(Calculator)
export const IconAlert     = uui(AlertCircle)
export const IconCheckCircle = uui(CheckCircle)

/* ── Empty-state glyphs ──────────────────────────────────────────────────────
 *
 * The one that goes in <EmptyState>'s 56px disc. A separate family from the
 * icons above and drawn to its own contract, which is worth writing down
 * because five of these already existed and were being drawn from memory:
 *
 *     viewBox 0 0 24 24, fill none, stroke currentColor
 *     strokeWidth 1.6, round caps and joins
 *     rendered at 28-34px, aria-hidden
 *
 * 1.6 is a fractional weight, which is normally a mistake - no coordinate
 * puts both edges of a 1.6px stroke on a pixel boundary, so every edge is
 * antialiased. It is right HERE because these never render at icon size:
 * inside a 56px disc at 32px the softness is invisible, and the five that
 * already exist are all 1.6. Matching eight icons beats matching a rule.
 *
 * Sub-shapes that want to be solid take fill="currentColor" stroke="none",
 * which is what IconQr already does.
 *
 * They live here only when more than one screen uses them. A glyph with one
 * caller stays beside its caller - see IconNoDebts in pages/debts/shared.jsx.
 */

/** @param {{size?: number}} props */
function emptyProps({ size }) {
  return {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: '1.6',
    strokeLinecap: /** @type {const} */ ('round'),
    strokeLinejoin: /** @type {const} */ ('round'),
    'aria-hidden': true, focusable: 'false',
  }
}

/**
 * No goals yet: a target with its bullseye, at empty-state weight.
 *
 * The app has already decided that a goal is a target - it is the glyph on
 * the home screen's Goals tile - and inventing a second metaphor for the same
 * noun is how two screens stop looking like one app. Concentric at r=9.5/5.2,
 * overshooting the 18x18 box the square-ish glyphs here use, because a circle
 * drawn to the same box reads smaller than one.
 *
 * @param {{size?: number}} props
 */
export function IconNoGoals({ size = 32 }) {
  return (
    <svg {...emptyProps({ size })}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="5.2" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

/**
 * No budgets set: a dial with its needle at the start of the scale.
 *
 * The budget page headlines with an arc of ticks, so a dial is what the empty
 * state should promise. The needle resting at the low end is the whole point -
 * the instrument is there and nothing is being measured on it yet.
 *
 * 270 degrees rather than a semicircle, which was the first attempt and was
 * the wrong shape for the box: a half arc is 9 units tall in a 24-unit
 * square, so it floated in the middle with dead space above and below and
 * read as an arch rather than an instrument. Opening it only at the bottom
 * fills the frame the way the other glyphs here do.
 *
 * @param {{size?: number}} props
 */
export function IconNoBudget({ size = 32 }) {
  return (
    <svg {...emptyProps({ size })}>
      <path d="M5.3 19.2A9.5 9.5 0 1 1 18.7 19.2" />
      <path d="M12 12.5 7.4 17.1" />
      <circle cx="12" cy="12.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

/**
 * The thing you followed a link to is not here.
 *
 * Not an empty list - a dead reference, which happens more in a PWA than in a
 * normal app: a deep link, a notification, or a reload after the account or
 * goal it named was deleted. Three screens answer it (account, goal, bill) and
 * all three should answer it the same way.
 *
 * An empty dashed frame - the outline of the thing that should be here, with
 * nothing in it. Dashed-for-absent is already this app's idiom: it is
 * IconEmptyLedger's third line, IconFlatChart's level series, and the dashed
 * placeholder the Goals page draws where an account would be.
 *
 * It was a magnifying glass with a rule in it first, on the reasoning that
 * "looked, found nothing" is milder than an error. Drawn and looked at beside
 * the rest of the set, a minus inside a lens is the universal zoom-out
 * control and read as exactly that. Worth the detour to find out.
 *
 * @param {{size?: number}} props
 */
export function IconNotFound({ size = 32 }) {
  return (
    <svg {...emptyProps({ size })}>
      <rect x="3" y="5.5" width="18" height="13" rx="3" strokeDasharray="3.2 2.8" />
      <path d="M9.5 12h5" />
    </svg>
  )
}

/**
 * Empty-ledger glyph: a page with two ruled lines and a third left blank.
 *
 * The missing third line is the whole idea - the rows that would be here.
 *
 * Moved from pages/accounts/Trend.jsx when the dashboard wanted it too.
 * Importing it from there would have pulled recharts into the home screen's
 * bundle, and the home screen is the one route that is not lazy-loaded.
 *
 * @param {{size?: number}} props
 */
export function IconEmptyLedger({ size = 32 }) {
  return (
    <svg {...emptyProps({ size })} strokeWidth="2">
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M8 9h8M8 13h5" />
      <path d="M8 17h3" strokeDasharray="2 2" />
    </svg>
  )
}

/**
 * Nothing was charged: a receipt with its torn edge and two short lines.
 *
 * A ledger is a list of things that happened; a receipt is one statement's
 * worth, which is the distinction between this and IconEmptyLedger. The bill
 * page uses it for a bill that has never been charged, and the account page
 * for a statement with nothing on it.
 *
 * Moved out of RecurringDetail.jsx when the second caller turned up.
 *
 * @param {{size?: number}} props
 */
export function IconEmptyReceipt({ size = 30 }) {
  return (
    <svg {...emptyProps({ size })}>
      <path d="M5 3.5h14v17l-2.33-1.6-2.34 1.6-2.33-1.6-2.34 1.6L7.33 18.9 5 20.5Z" />
      <path d="M9 8.5h6M9 12.5h4" />
    </svg>
  )
}
