import { useState } from 'react'
import SubPage from '../components/SubPage'
import BadgeMark from '../components/BadgeMark'
import BadgeCard from '../components/BadgeCard'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
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
 * One badge, on its own card.
 *
 * ── Why each badge gets a surface ──
 *
 * The grid ran bare on the page for a while, which fixed the real problem -
 * two big panels that made the page read as boxes of stuff - and introduced a
 * smaller one: twenty hexagons floating on a flat background with nothing
 * holding them, so the eye had no cell to rest in and the labels drifted
 * toward whichever badge they were nearest.
 *
 * A card each is the opposite trade from a card around each SECTION. It groups
 * a badge with its own name rather than grouping twenty badges with each
 * other, which is the grouping that was actually missing.
 *
 * ── The whole card is the target ──
 *
 * At 72px the artwork is still a small thing to hit and there is nothing else
 * in the cell to press by accident, so the card is the button. `interactive` gives it
 * Button's own 2% press, because a surface that does nothing when touched
 * reads as broken before it reads as decorative.
 */
function BadgeTile({ badge, onOpen }) {
  return (
    <Card
      as="button"
      interactive
      onClick={() => onOpen(badge)}
      className="flex flex-col items-center gap-2 px-1.5 pt-3.5 pb-3"
    >
      <BadgeMark badge={badge} earned={badge.earned} size={72} />
      <span className={`text-11 font-semibold leading-[1.25] text-center ${
        badge.earned
          ? 'text-slate-700 dark:text-slate-200'
          : 'text-slate-400 dark:text-slate-500'
      }`}>
        {badge.name}
      </span>
    </Card>
  )
}

/** Three cards across. `items-stretch` so a wrapped name does not leave its
 *  card shorter than the two beside it. */
function BadgeGrid({ badges, onOpen }) {
  return (
    <div className="px-4 grid grid-cols-3 gap-2 items-stretch">
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
 * ── It opens on the badges ──
 *
 * There was a dial at the top counting the collection, and it went. On a page
 * whose entire content is twenty pictures, a twenty-first graphic above them
 * is the thing standing between you and what you came for - and the grid
 * already answers "how many" better than a number does, because you can see
 * both halves of it at once.
 *
 * ── One card per badge, not one card per section ──
 *
 * The two arrangements sound alike and are opposites. A panel around each
 * SECTION groups twenty badges with each other, which they did not need - they
 * are already obviously a set - while adding an edge and a background
 * competing with twenty backgrounds. A card around each BADGE groups a badge
 * with its own name, which is the grouping that was missing: bare on the page
 * the labels drifted toward whichever hexagon they sat nearest.
 *
 * ── Three across ──
 *
 * Four fits the collection in five rows instead of seven, which sounds like
 * the right trade and is not: it puts the badge at 56px, and the badge is the
 * whole point of the page. These are detailed little objects - facets, a
 * bevel, sparkles - and below about 64px that detail turns to mush.
 *
 * ── Why locked badges show their real shape ──
 *
 * A question mark would make this a puzzle, and a hidden badge is one nobody
 * can work toward. Each locked tile is its own silhouette, greyed, and tapping
 * it says exactly how it is earned. Nothing here is a secret; the pleasure is
 * in doing the thing, not in guessing what the thing is.
 */
export default function Badges() {
  const { badges, loading } = useBadges()
  const [open, setOpen] = useState(null)

  const earned = badges.filter(b => b.earned)
  const locked = badges.filter(b => !b.earned)

  return (
    <SubPage title="Badges">
      {loading ? (
        <div className="px-4 grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }, (_, i) => <SkeletonBadge key={i} />)}
        </div>
      ) : (
        <>
          {earned.length > 0 && (
            <section className="mt-8">
              <SectionLabel
                inset="gutter"
                gap="loose"
                action={
                  <InfoButton title="How badges work">
                    Badges unlock on their own as you track your spending.
                    Nothing to claim, and nothing to lose. Once you&apos;ve earned
                    one, it&apos;s yours for good.
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
