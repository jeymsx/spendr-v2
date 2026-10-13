import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import SubPage from '../components/SubPage'
import IconButton from '../components/ui/IconButton'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Divider from '../components/ui/Divider'
import SectionLabel from '../components/ui/SectionLabel'
import EmptyState from '../components/ui/EmptyState'
import { SkeletonHero, SkeletonList } from '../components/ui/Skeleton'
import { useBaseCurrency } from '../context/CurrencyContext'
import useRates from '../hooks/useRates'
import { fmt } from '../lib/money'
import { sortWishes, keptTotal } from '../lib/wishes'
import { IconPlus } from './goals/shared'
import { Answers } from './wishlist/WishActions'
import WishDetailSheet from './wishlist/WishDetailSheet'
import { useWishActions } from './wishlist/useWishActions'
import { IconGift, waitWords, waitedWords, decidedWords } from './wishlist/shared'

/**
 * The wishlist: things you want, parked for a while before you buy them.
 *
 * What a wish is and why it waits are lib/wishes.js; what can be done to one
 * is wishlist/useWishActions.js, shared with the computer's page. This page is
 * the three places a wish can be, in the order they want you:
 *
 *   Ready to decide   its wait is over: Skip or Buy, right on the row
 *   Cooling off       still waiting, with when it will ask
 *   Decided           what you did, the latest first
 *
 * Above them, the one figure the page is for: what waiting has kept - every
 * skipped wish's price. A wish tapped opens its details (WishDetailSheet),
 * with Edit and Buy, the way a transaction does.
 */

const DECIDED_SHOWN = 5

export default function Wishlist() {
  const navigate = useNavigate()
  const base = useBaseCurrency()
  const { table: rates } = useRates()
  const wishes = useLiveQuery(() => db.wishes.toArray(), [], undefined)
  const [allDecided, setAllDecided] = useState(false)
  const actions = useWishActions({ base })

  /* The wish in the details sheet. Kept after it closes, so the sheet has
     something to show on its way out. */
  const [shownId, setShownId] = useState(/** @type {number|null} */ (null))
  const [detailOpen, setDetailOpen] = useState(false)
  const shown = (wishes ?? []).find(w => w.id === shownId) ?? null
  /** @param {WishRow} w */
  const openWish = (w) => { setShownId(w.id ?? null); setDetailOpen(true) }
  const newWish = () => navigate('/wishlist/new')

  // Sorted again whenever the list changes; the words read the clock each render.
  const { ready, cooling, decided } = useMemo(() => sortWishes(wishes ?? [], new Date()), [wishes])
  const now = new Date()
  const kept = useMemo(() => keptTotal(wishes ?? [], base, rates), [wishes, base, rates])
  const skipped = (wishes ?? []).filter(w => w.status === 'skipped').length
  const loading = wishes === undefined
  const shownDecided = allDecided ? decided : decided.slice(0, DECIDED_SHOWN)

  return (
    <SubPage
      title="Wishlist"
      action={
        <IconButton label="New wish" variant="primary" onClick={newWish}>
          <IconPlus />
        </IconButton>
      }
    >
      {loading ? (
        <div className="mt-2 px-5 flex flex-col gap-7">
          <SkeletonHero />
          <SkeletonList rows={3} />
        </div>
      ) : (wishes ?? []).length === 0 ? (
        <EmptyState
          art="gift"
          title="Nothing on your wishlist"
          body="Want something? Park it here with its price. Spendr asks if you still want it in a few days, and what you skip counts as kept."
          action={<Button className="px-4" onClick={newWish}>Add a wish</Button>}
        />
      ) : (
        <>
          {/* ── What waiting kept ── */}
          <section className="px-5">
            <SectionLabel className="text-center">Kept by waiting</SectionLabel>
            <p className="text-center text-38 leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
              {fmt(kept)}
            </p>
            <p className="mt-2 text-center text-13 text-slate-500 dark:text-slate-400">
              {skipped > 0
                ? `${skipped} wish${skipped === 1 ? '' : 'es'} skipped`
                : 'Skip a wish and its price counts here'}
            </p>
          </section>

          {ready.length > 0 && (
            <section className="mt-8">
              <SectionLabel inset="gutter" gap="loose">Ready to decide</SectionLabel>
              <div className="px-5">
                <Card clip>
                  {ready.map((w, i) => (
                    <Fragment key={w.id}>
                      <div className="px-4 py-3">
                        <WishLine wish={w} sub={waitedWords(w, now)} tone="ready" onOpen={() => openWish(w)} />
                        <div className="mt-3">
                          <Answers wish={w} onSkip={actions.skip} onBuy={actions.buy} />
                        </div>
                      </div>
                      {i < ready.length - 1 && <Divider />}
                    </Fragment>
                  ))}
                </Card>
              </div>
            </section>
          )}

          {cooling.length > 0 && (
            <section className="mt-8">
              <SectionLabel inset="gutter" gap="loose">Cooling off</SectionLabel>
              <div className="px-5">
                <Card clip>
                  {cooling.map((w, i) => (
                    <Fragment key={w.id}>
                      <div className="px-4 py-3">
                        <WishLine wish={w} sub={waitWords(w, now)} tone="waiting" onOpen={() => openWish(w)} />
                      </div>
                      {i < cooling.length - 1 && <Divider inset="row" />}
                    </Fragment>
                  ))}
                </Card>
              </div>
            </section>
          )}

          {decided.length > 0 && (
            <section className="mt-8">
              <SectionLabel
                inset="gutter"
                gap="loose"
                action={decided.length > DECIDED_SHOWN ? (
                  <button
                    type="button"
                    onClick={() => setAllDecided(v => !v)}
                    className="text-13 font-semibold accent-ink active:opacity-60"
                  >
                    {allDecided ? 'Show fewer' : `Show all ${decided.length}`}
                  </button>
                ) : null}
              >
                Decided
              </SectionLabel>
              <div className="px-5">
                <Card clip>
                  {shownDecided.map((w, i) => (
                    <Fragment key={w.id}>
                      <div className="px-4 py-3">
                        <WishLine wish={w} sub={decidedWords(w)} tone="decided" onOpen={() => openWish(w)} />
                      </div>
                      {i < shownDecided.length - 1 && <Divider inset="row" />}
                    </Fragment>
                  ))}
                </Card>
              </div>
            </section>
          )}
        </>
      )}

      <WishDetailSheet
        wish={shown}
        open={detailOpen && !!shown}
        onClose={() => setDetailOpen(false)}
        onEdit={(w) => { setDetailOpen(false); navigate(`/wishlist/${w.id}`) }}
        onBuy={(w) => { setDetailOpen(false); actions.buy(w) }}
      />
    </SubPage>
  )
}

/**
 * One wish: its gift, its name and where it is, and its price - in green
 * once skipped, since that is money kept.
 *
 * @param {{wish: WishRow, sub: string, tone: 'ready'|'waiting'|'decided', onOpen: () => void}} props
 */
function WishLine({ wish, sub, tone, onOpen }) {
  const kept = wish.status === 'skipped'
  return (
    <button type="button" onClick={onOpen} className="w-full flex items-center gap-3 text-left active:opacity-70">
      <span
        className={`cat-tile w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center ${tone === 'decided' ? 'opacity-60' : ''}`}
        style={/** @type {import('react').CSSProperties} */ ({ '--cat-color': tone === 'waiting' ? '#64748b' : 'var(--color-primary)' })}
      >
        <span className="cat-glyph flex"><IconGift /></span>
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-semibold truncate ${tone === 'decided' ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>
          {wish.name}
        </span>
        <span className="block mt-0.5 text-12 text-slate-500 dark:text-slate-400 truncate">{sub}</span>
      </span>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${
        kept ? 'text-emerald-600 dark:text-emerald-400'
          : tone === 'decided' ? 'text-slate-400 dark:text-slate-500'
          : 'text-slate-900 dark:text-white'
      }`}
      >
        {fmt(wish.price, wish.currency || undefined)}
      </span>
    </button>
  )
}
