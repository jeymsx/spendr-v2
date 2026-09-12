import { useMemo, useState } from 'react'
import SubPage from '../components/SubPage'
import BadgeMark from '../components/BadgeMark'
import BadgeCard from '../components/BadgeCard'
import Button from '../components/ui/Button'
import SectionLabel from '../components/ui/SectionLabel'
import InfoButton from '../components/ui/InfoButton'
import { SkeletonBadge } from '../components/ui/Skeleton'
import { useBadges } from '../context/BadgeContext'

/** "12 Sep 2026" - the same shape the rest of the app dates things in. */
function fmtEarned(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * The collection, as a dial.
 *
 * ── Why not a progress bar ──
 *
 * A bar says "you are 30% through a task", and a collection is not a task -
 * there is no finishing it on a schedule and no reason to feel behind. A ring
 * of twenty ticks says something a bar cannot: that there are exactly twenty of
 * these, that they are discrete things, and precisely which share you hold. You
 * can count the dark ones.
 *
 * It is also the language this app already speaks. BudgetGauge draws the
 * month's spending as a fan of ticks for the same reason - a scale you are
 * somewhere on rather than a smooth quantity - so the headline figure on the
 * two pages reads as the same kind of object.
 *
 * ── One colour, not twenty ──
 *
 * The obvious idea is to light each tick in its own badge's hue. BudgetGauge
 * settled that already and its note says why: a rainbow made the one big graph
 * on the page the only thing ignoring the accent preset. The badges below are
 * as colourful as they should be; the dial that measures them is the accent.
 */
function BadgeDial({ earned, total, size = 168 }) {
  const ticks = useMemo(() => {
    const c = size / 2
    const outer = c - 4
    const inner = outer - 13
    return Array.from({ length: total }, (_, i) => {
      /* Start at twelve o'clock and run clockwise, which is the direction a
         dial is read. -90 puts index 0 at the top. */
      const a = ((i / total) * 360 - 90) * (Math.PI / 180)
      return {
        i,
        x1: c + Math.cos(a) * inner, y1: c + Math.sin(a) * inner,
        x2: c + Math.cos(a) * outer, y2: c + Math.sin(a) * outer,
      }
    })
  }, [size, total])

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        {ticks.map(t => (
          <line
            key={t.i}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            strokeWidth="4"
            strokeLinecap="round"
            className={t.i < earned
              ? 'stroke-primary'
              : 'stroke-slate-200 dark:stroke-white/[0.10]'}
          />
        ))}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[44px] leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
          {earned}
        </span>
        <span className="mt-1.5 text-[12px] font-medium tabular-nums text-slate-400 dark:text-slate-500">
          of {total}
        </span>
      </div>
    </div>
  )
}

/**
 * One tile.
 *
 * The whole tile is the target rather than the mark inside it: at 56px the
 * artwork is a small thing to hit, and there is nothing else in the cell to
 * press by accident.
 *
 * At three across every name fits on one line - "Budget Master" and
 * "No-Spend Week" are the longest and both clear it - so there is no reserved
 * second line. Four across needed one, because a wrapping name there pushed
 * its neighbours' badges out of alignment.
 */
function BadgeTile({ badge, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(badge)}
      className="flex flex-col items-center gap-2 py-2 rounded-2xl
        active:bg-slate-100/70 dark:active:bg-white/[0.05] transition-colors"
    >
      <BadgeMark badge={badge} earned={badge.earned} size={72} />
      <span className={`text-[11.5px] font-semibold leading-[1.25] text-center ${
        badge.earned
          ? 'text-slate-700 dark:text-slate-200'
          : 'text-slate-400 dark:text-slate-500'
      }`}>
        {badge.name}
      </span>
    </button>
  )
}

/** Three across, on the page rather than in a card - see the page note. */
function BadgeGrid({ badges, onOpen }) {
  return (
    <div className="px-4 grid grid-cols-3 gap-x-2 gap-y-4">
      {badges.map(b => <BadgeTile key={b.key} badge={b} onOpen={onOpen} />)}
    </div>
  )
}

/**
 * Badges.
 *
 * ── What this page is not ──
 *
 * It is not a scoreboard and it is not a to-do list. There is no ranking, no
 * points total, no comparison with anybody, and nothing here nags. It opens on
 * what you have earned, because that is the reward, and the ones you have not
 * are visible underneath at low contrast so the set still reads as a set - and
 * so there is an answer to "what is next" for anyone who wants one.
 *
 * ── No cards behind the grids ──
 *
 * The badges used to sit in `.card` panels, which was one container too many. A
 * card is a surface that groups things which would otherwise float, and twenty
 * saturated hexagons in a grid are already the most present thing on the
 * screen. The panel added an edge, a shadow, and a background competing with
 * twenty backgrounds, and it made the page read as two boxes of stuff rather
 * than as a collection. The section labels do the grouping now, which is all
 * the grouping there was ever any need for.
 *
 * ── Three across ──
 *
 * Four fits the collection in five rows instead of seven, which sounds like
 * the right trade and is not: it puts the badge at 56px, and the badge is the
 * whole point of the page. These are detailed little objects - facets, a
 * bevel, sparkles - and below about 64px that detail turns to mush and they
 * stop being worth looking at. Three across gives them 72px and the extra
 * scrolling is the cheaper cost.
 *
 * ── Why locked badges show their real shape ──
 *
 * A question mark would make this a puzzle, and a hidden badge is one nobody
 * can work toward. Each locked tile is its own silhouette, greyed, and tapping
 * it says exactly how it is earned. Nothing here is a secret; the pleasure is
 * in doing the thing, not in guessing what the thing is.
 */
export default function Badges() {
  const { badges, earnedCount, total, loading } = useBadges()
  const [open, setOpen] = useState(null)

  const earned = badges.filter(b => b.earned)
  const locked = badges.filter(b => !b.earned)

  /* The most recent one, for the line under the dial. A collection page with
     no news on it is a page you visit once; the last thing you earned is the
     one piece of news it always has. */
  const latest = useMemo(() => {
    const dated = earned.filter(b => b.earnedAt)
    if (!dated.length) return null
    return dated.reduce((a, b) => (new Date(b.earnedAt) > new Date(a.earnedAt) ? b : a))
  }, [earned])

  return (
    <SubPage title="Badges">
      {loading ? (
        <>
          {/* The dial's own footprint, so the grid below does not jump when the
              real one arrives. */}
          <div className="mx-auto skeleton rounded-full" style={{ width: 168, height: 168 }} />
          <div className="mt-10 px-4 grid grid-cols-3 gap-x-2 gap-y-4">
            {Array.from({ length: 6 }, (_, i) => <SkeletonBadge key={i} />)}
          </div>
        </>
      ) : (
        <>
          {/* ── The collection, as one figure ── */}
          <section className="px-5">
            <BadgeDial earned={earnedCount} total={total} />

            <p className="mt-4 text-center text-[13px] text-slate-500 dark:text-slate-400">
              {earnedCount === 0
                ? 'Earned by using your money well, not by using the app.'
                : earnedCount === total
                  ? 'Every one of them. Nothing left to earn.'
                  : latest
                    ? <>
                        Latest:{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{latest.name}</span>
                        {fmtEarned(latest.earnedAt) ? `, ${fmtEarned(latest.earnedAt)}` : ''}
                      </>
                    : `${total - earnedCount} still to earn`}
            </p>
          </section>

          {earned.length > 0 && (
            <section className="mt-8">
              <SectionLabel
                inset="gutter"
                gap="loose"
                action={
                  <InfoButton title="How badges work">
                    Badges come from what is already in your ledger, so they
                    arrive on their own - there is nothing to claim. They are
                    worked out on this device, which means they keep counting
                    with no signal, and once one is earned it stays earned even
                    if the numbers behind it change later.
                  </InfoButton>
                }
              >
                Earned
              </SectionLabel>
              <BadgeGrid badges={earned} onOpen={setOpen} />
            </section>
          )}

          {locked.length > 0 && (
            <section className="mt-8">
              <SectionLabel inset="gutter" gap="loose">
                {earned.length === 0 ? 'All twenty' : 'Still to earn'}
              </SectionLabel>
              <BadgeGrid badges={locked} onOpen={setOpen} />
            </section>
          )}

          <div className="h-4" />
        </>
      )}

      {/* ── One badge, in full ──
          The same card you get the moment a badge is earned, not a sheet of
          its own. A badge that looked like one object when you earned it and a
          different one when you came back to look at it would read as two
          different badges.

          Keyed, so the flip and the burst start clean each time rather than
          the second badge you open inheriting the first's finished animations.
          Earned ones celebrate; locked ones do not - there is nothing to throw
          paper at, and doing it anyway would say the opposite of what the card
          says. */}
      {open && (
        <BadgeCard
          key={open.key}
          badge={open}
          eyebrow={open.earned
            ? (fmtEarned(open.earnedAt) ? `Earned ${fmtEarned(open.earnedAt)}` : 'Earned')
            : 'Not yet earned'}
          body={open.earned ? open.blurb : open.how}
          celebrate={open.earned}
          onClose={() => setOpen(null)}
          actions={<Button variant="quiet" block onClick={() => setOpen(null)}>Done</Button>}
        />
      )}
    </SubPage>
  )
}
