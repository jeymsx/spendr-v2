import { useState } from 'react'
import SubPage from '../components/SubPage'
import BadgeMark from '../components/BadgeMark'
import Card from '../components/ui/Card'
import Divider from '../components/ui/Divider'
import ProgressBar from '../components/ui/ProgressBar'
import SectionLabel from '../components/ui/SectionLabel'
import InfoButton from '../components/ui/InfoButton'
import Sheet from '../components/ui/Sheet'
import { SkeletonHero } from '../components/ui/Skeleton'
import { useBadges } from '../hooks/useBadges'

/** "12 Sep 2026" - the same shape the rest of the app dates things in. */
function fmtEarned(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * One tile.
 *
 * The whole tile is the target rather than the mark inside it: at 96px the
 * artwork is a small thing to hit, and there is nothing else in the cell to
 * press by accident.
 */
function BadgeTile({ badge, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(badge)}
      className="flex flex-col items-center gap-2 px-1 py-3 rounded-2xl
        active:bg-slate-100/70 dark:active:bg-white/[0.05] transition-colors"
    >
      <BadgeMark badge={badge} earned={badge.earned} size={62} />
      <span className={`text-[11.5px] font-semibold leading-tight text-center ${
        badge.earned
          ? 'text-slate-800 dark:text-white'
          : 'text-slate-400 dark:text-slate-500'
      }`}>
        {badge.name}
      </span>
    </button>
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
 * ── Why locked badges show their real shape ──
 *
 * A question mark would make this a puzzle, and a hidden badge is a badge
 * nobody can work toward. Each locked tile is its own silhouette, greyed, and
 * tapping it says exactly how it is earned. Nothing here is a secret; the
 * pleasure is in doing the thing, not in guessing what the thing is.
 */
export default function Badges() {
  const { badges, earnedCount, total, loading } = useBadges()
  const [open, setOpen] = useState(null)

  const earned = badges.filter(b => b.earned)
  const locked = badges.filter(b => !b.earned)

  return (
    <SubPage title="Badges">
      {loading ? (
        <div className="px-5 pt-2">
          <SkeletonHero />
        </div>
      ) : (
        <>
          {/* ── The count, as the page's one figure ── */}
          <section className="px-5">
            <p className="text-center text-[38px] leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
              {earnedCount}
              <span className="text-slate-300 dark:text-slate-600">{' / '}{total}</span>
            </p>
            <p className="mt-2 text-center text-[13px] text-slate-500 dark:text-slate-400">
              {earnedCount === 0
                ? 'Earned by using your money well, not by using the app.'
                : earnedCount === total
                  ? 'Every one of them. Nothing left to earn.'
                  : `${total - earnedCount} still to earn`}
            </p>
            <div className="mt-5">
              <ProgressBar value={(earnedCount / total) * 100} fillClass="bg-primary" />
            </div>
          </section>

          {/* ── Earned ── */}
          {earned.length > 0 && (
            <section className="mt-7">
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
              <div className="px-5">
                <Card padding="none" className="px-2 py-1">
                  <div className="grid grid-cols-3">
                    {earned.map(b => <BadgeTile key={b.key} badge={b} onOpen={setOpen} />)}
                  </div>
                </Card>
              </div>
            </section>
          )}

          {/* ── Still to earn ── */}
          {locked.length > 0 && (
            <section className="mt-7">
              <SectionLabel inset="gutter" gap="loose">
                {earned.length === 0 ? 'All ten' : 'Still to earn'}
              </SectionLabel>
              <div className="px-5">
                <Card padding="none" className="px-2 py-1">
                  <div className="grid grid-cols-3">
                    {locked.map(b => <BadgeTile key={b.key} badge={b} onOpen={setOpen} />)}
                  </div>
                </Card>
              </div>
            </section>
          )}

          <div className="h-4" />
        </>
      )}

      {/* ── One badge, in full ──
          Sheet stays mounted through its exit animation, so `open` is held
          rather than cleared on close - clearing it would blank the sheet
          halfway through the slide down. Every path that opens it sets it. */}
      <Sheet open={!!open} onClose={() => setOpen(null)} ariaLabel={open?.name ?? 'Badge'}>
        {open && (
          <div className="flex flex-col items-center text-center pb-2">
            <BadgeMark badge={open} earned={open.earned} size={104} />

            <h3 className="mt-4 text-[19px] font-semibold tracking-tight text-slate-900 dark:text-white">
              {open.name}
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 max-w-[16rem]">
              {open.earned ? open.blurb : open.how}
            </p>

            <div className="w-full mt-5">
              <Divider />
              <p className={`pt-3.5 text-[12px] font-semibold ${
                open.earned
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}>
                {open.earned
                  ? (fmtEarned(open.earnedAt) ? `Earned ${fmtEarned(open.earnedAt)}` : 'Earned')
                  : 'Not yet earned'}
              </p>
            </div>
          </div>
        )}
      </Sheet>
    </SubPage>
  )
}
