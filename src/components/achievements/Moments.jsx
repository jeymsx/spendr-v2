import { lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAchievements } from '../../context/AchievementContext'

/* The screen itself - glass, canvas, the share - loads only when something
   is actually being celebrated, so none of it rides in the first bundle. */
const Celebration = lazy(() => import('./Celebration'))

/**
 * Shows the head of the celebration queue, full screen, one at a time.
 *
 * Keyed by the achievement, so each arrives with its own entrance and its own
 * picture rather than inheriting the last one's finished animations.
 */
export default function Moments() {
  const { celebrating, dismissCelebration } = useAchievements()
  const navigate = useNavigate()
  if (!celebrating) return null
  return (
    <Suspense fallback={null}>
      <Celebration
        key={celebrating.id}
        item={celebrating}
        mode="earned"
        onClose={dismissCelebration}
        onHome={() => { dismissCelebration(); navigate('/') }}
      />
    </Suspense>
  )
}
