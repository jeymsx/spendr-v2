import { forwardRef } from 'react'
import Button from '../../components/ui/Button'
import { fmt } from '../../lib/money'
import { nudgeLabel } from '../../lib/nudge'
import { Heading, StepBody, StepFooter } from './parts'

/**
 * You're all set: what setup made, in a line, and the way in.
 *
 * No confetti. The cards picked come back onto the stage with a tick in
 * front of them, which is the celebration: the thing you made, finished.
 */

/**
 * @param {{name: string, accounts: number, total: number, currency: string, nudge: string|null,
 *          onFinish: () => void, saving: boolean}} props
 */
export const StepDone = forwardRef(
  /** @param {any} props @param {import('react').Ref<HTMLHeadingElement>} ref */
  function StepDone({ name, accounts, total, currency, nudge, onFinish, saving }, ref) {
    const first = name.trim().split(/\s+/)[0]
    const facts = [
      `${accounts} ${accounts === 1 ? 'account' : 'accounts'}`,
      total > 0 ? fmt(total, currency) : null,
      nudge ? `nudge at ${nudgeLabel(nudge)}` : null,
    ].filter(Boolean)
    return (
      <>
        <StepBody className="justify-center text-center items-center">
          <Heading
            ref={ref}
            title={first ? `You’re all set, ${first}` : 'You’re all set'}
            sub={facts.join(' · ')}
          />
          <p className="-mt-2 text-13 leading-snug text-slate-500">
            Categories are set up for you. Change them anytime in Settings.
          </p>
        </StepBody>
        <StepFooter>
          <Button size="lg" block onClick={onFinish} loading={saving}>Start tracking</Button>
        </StepFooter>
      </>
    )
  },
)
