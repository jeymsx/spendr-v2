import { useState, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PH_ACCOUNTS, PH_GROUPS, POPULAR_ACCOUNTS } from '../../lib/phAccounts'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import Divider from '../../components/ui/Divider'
import { AccountCard, STACK_STRIP } from './ListCard'
import Rail from '../../components/ui/Rail'
import SearchField from '../../components/ui/SearchField'

// ── Quick-add sheet helpers ────────────────────────────────────────────────────

/**
 * Pin a drag to the vertical axis.
 *
 * A stack is a vertical list, so sideways movement means nothing here - and
 * it caused a real bug rather than just looking odd. <main> is the scroll
 * container and its overflow-x computes to `auto`, so a card dragged
 * sideways extended the scrollable width (measured: 725px inside a 500px
 * viewport) and the whole page could be panned to the right. Pinning x
 * removes the cause instead of clipping the symptom.
 */
export const lockToVerticalAxis = ({ transform }) => ({ ...transform, x: 0 })

/**
 * How far each card shifts while another is dragged past it.
 *
 * dnd-kit's built-in vertical strategy measures the gap between item rects
 * and shifts by a whole item height. These cards OVERLAP - each is pulled up
 * so only STACK_STRIP of it shows - so a whole-height shift sends them
 * flying off in both directions. The pitch of this stack is the strip, not
 * the card, and that is the only thing this changes.
 *
 * It is an approximation at the ends, because the last card in a stack is the
 * only one showing its full height: drop something into that slot and the
 * heights swap, which a translation cannot express. It settles correctly on
 * drop, which is what dnd-kit strategies are for.
 */
export function stackSortingStrategy({ activeIndex, overIndex, index }) {
  if (activeIndex === -1 || overIndex === -1) return null
  if (index === activeIndex) {
    return { x: 0, y: (overIndex - activeIndex) * STACK_STRIP, scaleX: 1, scaleY: 1 }
  }
  if (activeIndex < overIndex && index > activeIndex && index <= overIndex) {
    return { x: 0, y: -STACK_STRIP, scaleX: 1, scaleY: 1 }
  }
  if (activeIndex > overIndex && index < activeIndex && index >= overIndex) {
    return { x: 0, y: STACK_STRIP, scaleX: 1, scaleY: 1 }
  }
  return null
}

/**
 * A card you can pick up and reorder in place.
 *
 * The card is still a button that opens the account, so drag has to be told
 * apart from tap: a pointer must travel 8px, and a finger must rest 180ms,
 * before a drag begins. Anything shorter stays a tap.
 */
export function SortableAccountCard(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isSorting, newIndex } =
    useSortable({ id: props.acct.id })

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    // While held, `transform` must NOT be transitioned or the card lags
    // behind the pointer - so the transition is narrowed to the tilt
    // properties, which are `rotate` and `scale` rather than `transform`
    // precisely so they can carry their own timing. Idle cards fall back to
    // dnd-kit's own transform transition for the reflow.
    transition: isDragging
      ? 'rotate 200ms cubic-bezier(0.2, 0.7, 0.3, 1), scale 200ms cubic-bezier(0.2, 0.7, 0.3, 1)'
      : transition,
  }

  // While a drag is in progress the WHOLE stack layers as it will be once
  // dropped - newIndex is the post-move index of every card, not just the
  // held one - so a card slid into the middle goes behind the card in front
  // of it, the way it would if you pushed it into a real deck. Floating the
  // held card over everything on a fixed z-index looked like it was being
  // carried above the stack rather than into it.
  //
  // Set only while sorting, and as a key that is absent otherwise: this
  // object is spread over the card's base style, and an explicit `undefined`
  // would override the base `zIndex: depth + 1` rather than defer to it -
  // which it silently did, leaving the whole stack on `z-index: auto`.
  if (isSorting) dragStyle.zIndex = newIndex + 1

  return (
    <AccountCard
      {...props}
      ref={setNodeRef}
      isDragging={isDragging}
      isSorting={isSorting}
      dragProps={{ ...attributes, ...listeners }}
      dragStyle={dragStyle}
    />
  )
}

export const RECENT_PRESETS_KEY = 'recentAccountPresets'

function getRecentPresets() {
  try { return JSON.parse(localStorage.getItem(RECENT_PRESETS_KEY) ?? '[]') } catch { return [] }
}
function pushRecentPreset(name) {
  const next = [name, ...getRecentPresets().filter(n => n !== name)].slice(0, 5)
  try { localStorage.setItem(RECENT_PRESETS_KEY, JSON.stringify(next)) } catch {}
}

export const TYPE_LABEL_SHORT = { ewallet: 'E-wallet', bank: 'Bank', credit: 'Credit card', cash: 'Cash', savings: 'Savings' }

export function QASectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <span className="text-xs font-bold text-slate-400 dark:text-slate-500 shrink-0">
        {children}
      </span>
      <Divider className="flex-1" />
    </div>
  )
}

export function AccountChip({ acct, onPick }) {
  return (
    <button
      onClick={() => onPick(acct)}
      className="flex items-center gap-2 px-3 py-2 rounded-2xl border text-sm font-medium
        bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-200
        active:scale-[0.94] transition-all duration-75"
      style={{ borderColor: `${acct.color}40` }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: acct.color }} />
      {acct.name}
    </button>
  )
}

export function PopularCard({ acct, onPick }) {
  return (
    <button
      onClick={() => onPick(acct)}
      className="shrink-0 flex flex-col gap-0.5 px-4 py-3 rounded-2xl border text-left
        bg-white dark:bg-white/[0.05] min-w-[108px]
        active:scale-[0.96] transition-all duration-75"
      style={{ borderColor: `${acct.color}45` }}
    >
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: acct.color }} />
      <span className="text-sm font-semibold text-slate-800 dark:text-white mt-2 leading-tight">{acct.name}</span>
      <span className="text-10 text-slate-400 dark:text-slate-500 mt-0.5">{TYPE_LABEL_SHORT[acct.type]}</span>
    </button>
  )
}

// ── Quick-add sheet ────────────────────────────────────────────────────────────

export function QuickAddSheet({ open, onClose, onPickPreset, onCustom }) {
  const [query,       setQuery]       = useState('')
  const [recentNames, setRecentNames] = useState([])

  useEffect(() => {
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) { setQuery(''); setRecentNames(getRecentPresets()) }
  }, [open])

  /* Sheet owns the overlay, the panel, the handle, the scroll lock, Escape,
     the focus trap and the exit animation, so picking just closes it the
     ordinary way. The 260ms stays: the preset opens the form sheet next, and
     two sheets crossing over each other reads as a glitch. */
  function pick(acct) {
    pushRecentPreset(acct.name)
    onClose()
    setTimeout(() => onPickPreset(acct), 260)
  }

  const q        = query.toLowerCase().trim()
  const filtered = q ? PH_ACCOUNTS.filter(a => a.name.toLowerCase().includes(q)) : null
  const recents  = recentNames.map(n => PH_ACCOUNTS.find(a => a.name === n)).filter(Boolean)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add Account"
      maxHeight="88dvh"
      footer={(
        /* The hairline it used to carry is gone with the migration: at
           slate-200/60 over a slate-100 fill it was a rounding error, and
           no other secondary button in the app has one. */
        <Button
          variant="secondary"
          block
          onClick={() => { onClose(); setTimeout(onCustom, 260) }}
        >
          <span className="w-5 h-5 rounded-full bg-slate-300 dark:bg-white/[0.15]
            flex items-center justify-center text-11 font-bold text-slate-600 dark:text-white">
            +
          </span>
          Custom account
        </Button>
      )}
    >
      {/* Search */}
      <div className="pt-3 pb-3">
        <SearchField
          value={query}
          onChange={e => setQuery(e.target.value)}
          onClear={() => setQuery('')}
          placeholder="Search accounts…"
        />
      </div>

      {filtered ? (
        /* ── Search results ── */
        <div className="pb-4">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-400 dark:text-slate-500">No results for "{query}"</p>
              <button
                onClick={() => { onClose(); setTimeout(onCustom, 260) }}
                className="mt-3 text-xs font-semibold text-primary active:opacity-70"
              >
                + Create custom account
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filtered.map(acct => <AccountChip key={acct.name} acct={acct} onPick={pick} />)}
            </div>
          )}
        </div>
      ) : (
        /* ── Browse ── */
        <div className="pb-4 space-y-5">
          {recents.length > 0 && (
            <div>
              <QASectionLabel>Recent</QASectionLabel>
              <div className="flex flex-wrap gap-2">
                {recents.map(acct => <AccountChip key={acct.name} acct={acct} onPick={pick} />)}
              </div>
            </div>
          )}

          <div>
            <QASectionLabel>Popular</QASectionLabel>
            <Rail
              className="gap-2.5 pb-1 -mx-5 px-5"
            >
              {POPULAR_ACCOUNTS.map(acct => <PopularCard key={acct.name} acct={acct} onPick={pick} />)}
            </Rail>
          </div>

          {PH_GROUPS.map(group => (
            <div key={group}>
              <QASectionLabel>{group}</QASectionLabel>
              <div className="flex flex-wrap gap-2">
                {PH_ACCOUNTS.filter(a => a.group === group).map(acct => (
                  <AccountChip key={acct.name} acct={acct} onPick={pick} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}
