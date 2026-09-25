import { useState } from 'react'
import Divider from '../../components/ui/Divider'
import Skeleton from '../../components/ui/Skeleton'
import { CARD_RATIO, STACK_STRIP } from './ListCard'

/**
 * The accounts page, before its two queries land.
 *
 * It used to open on "No accounts yet" and a zero net worth, then fill in.
 * And because the page waited only for accounts, a credit card could draw
 * for a moment at nothing owed - what a card owes is worked out from its
 * statement's transactions, and those are the slower of the two reads - so
 * net worth showed high and then corrected itself. The page waits for both
 * now, and this stands in until they arrive.
 *
 * ── The stacks are remembered, not guessed ──
 *
 * A stack of n cards is n - 1 strips and one whole card, so a group of five
 * is about twice the height of a group of two, and a skeleton of the wrong
 * shape moves everything under it the instant the real page lands. So the
 * page records how many cards each section held the last time it drew
 * (rememberStacks, called from Accounts.jsx) and this draws that, the way
 * the dashboard remembers its wallet's height. A device that has never
 * drawn the page gets FALLBACK.
 *
 * ── Strips rather than overlapping cards ──
 *
 * The skeleton grey is translucent, so cards overlapped the way the real
 * ones are would darken wherever two of them cross - a stack of five would
 * shade from light to dark down the page. Every card but the last is drawn
 * as the strip of it that shows, its top corners rounded and a hairline of
 * page left under it where the next card's edge would be. The height comes
 * out the same: (n - 1) x STACK_STRIP, plus one card.
 */

const STACKS_KEY = 'accountsStacks'
const FALLBACK = [2, 1]
/** The page ground left showing between one strip and the next card. */
const STRIP_GAP = 3

/** @param {number[]} counts  cards per section, in the order drawn */
export function rememberStacks(counts) {
  try { localStorage.setItem(STACKS_KEY, JSON.stringify(counts)) } catch { /* private mode */ }
}

function rememberedStacks() {
  try {
    const v = JSON.parse(localStorage.getItem(STACKS_KEY) ?? 'null')
    if (Array.isArray(v) && v.length > 0 && v.length <= 20 &&
        v.every(n => Number.isInteger(n) && n > 0 && n <= 50)) return v
  } catch { /* private mode, or not JSON */ }
  return FALLBACK
}

/**
 * SummaryBar's three lines at their exact heights: a 16px caption, the 38px
 * figure 2px under it, and a 19.5px line of context 8px under that. Not
 * SkeletonHero, which is sized for the heroes with a gap under the caption
 * and would come out 6px taller than this one.
 */
function SummarySkeleton() {
  return (
    <section className="px-5 mb-6 flex flex-col items-center">
      <div className="h-4 flex items-center">
        <Skeleton className="h-[11px] w-16 rounded-md" />
      </div>
      <div className="mt-0.5 h-[38px] flex items-center">
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>
      <div className="mt-2 h-[19.5px] flex items-center">
        <Skeleton className="h-[11px] w-44 rounded-md" />
      </div>
    </section>
  )
}

function StackSkeleton({ count }) {
  return (
    <div className="mx-5 flex flex-col">
      {Array.from({ length: count - 1 }, (_, i) => (
        <Skeleton
          key={i}
          className="rounded-t-2xl rounded-b-none"
          style={{ height: STACK_STRIP - STRIP_GAP, marginBottom: STRIP_GAP }}
        />
      ))}
      <Skeleton className="w-full rounded-2xl" style={{ aspectRatio: String(CARD_RATIO) }} />
    </div>
  )
}

export default function AccountsSkeleton() {
  const [stacks] = useState(rememberedStacks)
  return (
    <div>
      {/* The shapes are hidden from a screen reader; what they mean is not.
          sr-only is absolutely placed, so it moves nothing. */}
      <p className="sr-only" role="status">Loading accounts</p>
      <div aria-hidden="true">
        <SummarySkeleton />
        {stacks.map((count, s) => (
          <section key={s} className="mb-3">
            {/* The group heading's py-2 around its text-11 total, which
                inherits the body's 1.5 - 16.5px, not text-xs's 16. */}
            <div className="flex items-center gap-3 px-5 h-[32.5px]">
              <Skeleton className="h-3 w-16 rounded-md" />
              <Divider className="flex-1" />
              <Skeleton className="h-[11px] w-12 rounded-md" />
            </div>
            <StackSkeleton count={count} />
          </section>
        ))}
      </div>
    </div>
  )
}
