import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BoardSkeleton } from '../ui/Skeletons'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import useRates from '../../hooks/useRates'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { fmt } from '../../lib/money'
import { sortWishes, keptTotal } from '../../lib/wishes'
import { Answers } from '../../pages/wishlist/WishActions'
import WishDetailSheet from '../../pages/wishlist/WishDetailSheet'
import { useWishActions } from '../../pages/wishlist/useWishActions'
import { IconGift, fmtDay, waitWords, waitedWords, decidedWords } from '../../pages/wishlist/shared'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import { Stat, Empty } from '../ui/display'
import { IPlus } from '../ui/icons'

/**
 * The wishlist on a computer: what waiting has kept across the top, the wishes
 * ready to decide and those still cooling off in the main column, and what was
 * decided beside them.
 *
 * Everything a wish can do is the phone's (pages/wishlist/useWishActions.js):
 * a wish opens the phone's details sheet, and its form is the phone's page
 * (pages/WishForm.jsx), in a drawer over this one as Add expense is.
 */
export default function WebWishlist() {
  const base = useBaseCurrency()
  const { table: rates } = useRates()
  const wishes = useLiveQuery(() => db.wishes.toArray(), [], undefined)
  const navigate = useNavigate()
  const actions = useWishActions({ base })
  const [shownId, setShownId] = useState(/** @type {number|null} */ (null))
  const [detailOpen, setDetailOpen] = useState(false)
  const shown = (wishes ?? []).find(w => w.id === shownId) ?? null
  /** A wish's details. @param {WishRow} w */
  const openWish = (w) => { setShownId(w.id ?? null); setDetailOpen(true) }
  const newWish = () => navigate('/wishlist/new')

  const { ready, cooling, decided } = useMemo(() => sortWishes(wishes ?? [], new Date()), [wishes])
  const now = new Date()
  const kept = useMemo(() => keptTotal(wishes ?? [], base, rates), [wishes, base, rates])
  const skipped = (wishes ?? []).filter(w => w.status === 'skipped').length
  const bought = (wishes ?? []).filter(w => w.status === 'bought').length
  const loading = wishes === undefined
  const waitingCount = ready.length + cooling.length

  return (
    <Page
      title="Wishlist"
      subtitle={loading ? ' ' : `${waitingCount} waiting${ready.length ? ` · ${ready.length} ready to decide` : ''}`}
      actions={<Btn variant="primary" icon={<IPlus size={15} />} onClick={newWish}>New wish</Btn>}
    >
      {loading ? <BoardSkeleton /> : (wishes ?? []).length === 0 ? (
        <Panel>
          <Empty
            art="gift"
            title="Nothing on your wishlist"
            body="Want something? Park it here with its price. Spendr asks if you still want it in a few days, and what you skip counts as kept."
            action={<Btn variant="primary" onClick={newWish}>Add a wish</Btn>}
          />
        </Panel>
      ) : (
        <>
          <div className="d-stats grid grid-cols-4 gap-5 mb-8">
            <Stat label="Kept by waiting" value={fmt(kept)} tone={kept > 0 ? 'pos' : null} note={skipped ? `${skipped} skipped` : 'Skip a wish to count it here'} />
            <Stat label="Ready to decide" value={String(ready.length)} note={ready.length ? 'Still want them?' : 'Nothing to decide yet'} />
            <Stat label="Cooling off" value={String(cooling.length)} note={cooling.length ? `Next asks ${fmtDay(cooling[0].coolUntil) ?? 'soon'}` : 'Nothing waiting'} />
            <Stat label="Bought" value={String(bought)} note="After waiting" />
          </div>

          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-8 d-main min-w-0 flex flex-col gap-5">
              {ready.length > 0 && (
                <Panel title="Ready to decide" flush>
                  {ready.map((w, i) => (
                    <Fragment key={w.id}>
                      {i > 0 && <div className="mx-6 border-t border-[var(--d-line)]" />}
                      <div className="px-6 py-4 flex items-center gap-5">
                        <WishLine wish={w} sub={waitedWords(w, now)} tone="ready" onOpen={() => openWish(w)} />
                        <div className="w-[220px] shrink-0">
                          <Answers wish={w} onSkip={actions.skip} onBuy={actions.buy} />
                        </div>
                      </div>
                    </Fragment>
                  ))}
                </Panel>
              )}
              <Panel title="Cooling off" flush>
                {cooling.length === 0 ? (
                  <Empty art="calendar" size="sm" title="Nothing cooling off" body="A new wish waits here until Spendr asks about it." />
                ) : cooling.map((w, i) => (
                  <Fragment key={w.id}>
                    {i > 0 && <div className="mx-6 border-t border-[var(--d-line)]" />}
                    <div className="px-6 py-3.5">
                      <WishLine wish={w} sub={waitWords(w, now)} tone="waiting" onOpen={() => openWish(w)} />
                    </div>
                  </Fragment>
                ))}
              </Panel>
            </div>

            <Panel className="col-span-4 d-side self-start" title="Decided" flush>
              {decided.length === 0 ? (
                <Empty art="sparkles" size="sm" title="Nothing decided yet" />
              ) : (
                <div className="pb-2">
                  {decided.map(w => (
                    <div key={w.id} className="px-6 py-3">
                      <WishLine wish={w} sub={decidedWords(w)} tone="decided" onOpen={() => openWish(w)} />
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}

      <WishDetailSheet
        wish={shown}
        open={detailOpen && !!shown}
        onClose={() => setDetailOpen(false)}
        onEdit={(w) => { setDetailOpen(false); navigate(`/wishlist/${w.id}`) }}
        onBuy={(w) => { setDetailOpen(false); actions.buy(w) }}
      />
    </Page>
  )
}

/**
 * One wish, in the desktop's type: gift, name and where it is, price.
 *
 * @param {{wish: WishRow, sub: string, tone: 'ready'|'waiting'|'decided', onOpen: () => void}} props
 */
function WishLine({ wish, sub, tone, onOpen }) {
  const kept = wish.status === 'skipped'
  return (
    <button type="button" onClick={onOpen} className="flex-1 min-w-0 w-full flex items-center gap-3.5 text-left hover:opacity-80">
      <span
        className={`cat-tile w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${tone === 'decided' ? 'opacity-60' : ''}`}
        style={/** @type {import('react').CSSProperties} */ ({ '--cat-color': tone === 'waiting' ? '#64748b' : 'var(--color-primary)' })}
      >
        <span className="cat-glyph flex"><IconGift size={18} /></span>
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block truncate text-14 font-semibold ${tone === 'decided' ? 'text-[var(--d-text-2)]' : 'text-[var(--d-text)]'}`}>{wish.name}</span>
        <span className="block mt-0.5 truncate text-12 text-[var(--d-text-3)]">{sub}</span>
      </span>
      <span className={`shrink-0 text-14 font-semibold d-num ${kept ? 'd-pos' : tone === 'decided' ? 'text-[var(--d-text-3)]' : 'text-[var(--d-text)]'}`}>
        {fmt(wish.price, wish.currency || undefined)}
      </span>
    </button>
  )
}
