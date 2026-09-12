import { useNavigate } from 'react-router-dom'
import BadgeCard from './BadgeCard'
import Button from './ui/Button'
import { useBadges } from '../context/BadgeContext'

/**
 * The card you get the moment a badge lands.
 *
 * All the presentation is BadgeCard's - this supplies only the words, the
 * buttons and the queue. Tapping a badge on the badges page opens the same
 * card, and it has to be the same card: a badge that looked like one object
 * when you earned it and a different one when you went back to look at it
 * would be two badges as far as anyone can tell.
 *
 * ── One at a time ──
 *
 * The provider hands over a queue and this shows its head. Two cards at once
 * would stack, and the tap meant for the first would dismiss the second.
 *
 * ── Keyed by badge ──
 *
 * BadgeCard owns the timers for the flip and the burst. Mounting it with the
 * badge's key starts those clean for each one, rather than the second badge
 * inheriting the first's already-finished animations.
 */
export default function BadgeUnlocked() {
  const { celebrating, dismissCelebration } = useBadges()
  const navigate = useNavigate()

  if (!celebrating) return null

  return (
    <BadgeCard
      key={celebrating.key}
      badge={celebrating}
      eyebrow="Badge unlocked"
      body={celebrating.blurb}
      celebrate
      onClose={dismissCelebration}
      actions={
        <>
          <Button onClick={dismissCelebration} block>Nice</Button>
          {/* Quiet, because the reward is the point and the collection is the
              follow-up - not the other way round. */}
          <Button
            variant="quiet"
            block
            onClick={() => { dismissCelebration(); navigate('/badges') }}
          >
            See all badges
          </Button>
        </>
      }
    />
  )
}
