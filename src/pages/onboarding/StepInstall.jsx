import { forwardRef, useState } from 'react'
import Button from '../../components/ui/Button'
import InstallGuide from '../../components/InstallGuide'
import { inAppBrowser, useInstall } from '../../lib/install'
import { Heading, StepBody, StepFooter } from './parts'

/**
 * The Home Screen, three ways - which one depends on the phone (flow.js):
 *
 *   StepInstallFirst   an iPhone in Safari, before anything is set up, since
 *                      the icon keeps storage of its own
 *   StepOpenInBrowser  inside Messenger's or Facebook's browser: out first
 *   StepInstall        Android, at the end: the browser's own install
 *
 * The how-to itself is components/InstallGuide.jsx, the same one Settings
 * shows.
 */

/** @param {{onNext: () => void}} props */
export const StepInstallFirst = forwardRef(
  /** @param {{onNext: () => void}} props @param {import('react').Ref<HTMLHeadingElement>} ref */
  function StepInstallFirst({ onNext }, ref) {
    return (
      <>
        <StepBody>
          <Heading
            ref={ref}
            title="First, put Spendr on your Home Screen"
            sub="On iPhone the Home Screen app keeps its own data, so set it up there. It takes a few seconds."
          />
          <InstallGuide />
        </StepBody>
        <StepFooter>
          <Button size="lg" block variant="quiet" onClick={onNext}>Set up here in Safari instead</Button>
        </StepFooter>
      </>
    )
  },
)

/** @param {{onNext: () => void}} props */
export const StepOpenInBrowser = forwardRef(
  /** @param {{onNext: () => void}} props @param {import('react').Ref<HTMLHeadingElement>} ref */
  function StepOpenInBrowser({ onNext }, ref) {
    const app = inAppBrowser()
    return (
      <>
        <StepBody>
          <Heading
            ref={ref}
            title="Open Spendr in your browser"
            sub={`${app ? `${app}’s browser` : 'This app’s browser'} can’t install Spendr, and it may not keep your data.`}
          />
          <InstallGuide bare />
        </StepBody>
        <StepFooter>
          <Button size="lg" block variant="quiet" onClick={onNext}>Continue here anyway</Button>
        </StepFooter>
      </>
    )
  },
)

/** @param {{onNext: () => void}} props */
export const StepInstall = forwardRef(
  /** @param {{onNext: () => void}} props @param {import('react').Ref<HTMLHeadingElement>} ref */
  function StepInstall({ onNext }, ref) {
    const context = useInstall()
    const [done, setDone] = useState(false)
    const installed = done || context === 'installed'
    return (
      <>
        <StepBody>
          <Heading
            ref={ref}
            title="Add Spendr to your home screen"
            sub="Open it in one tap, full screen, even offline."
          />
          <InstallGuide onInstalled={() => setDone(true)} />
        </StepBody>
        <StepFooter>
          {/* The guide's own button installs; this one moves on - "Continue"
              once it is done, "Maybe later" until then. */}
          <Button size="lg" block variant={installed ? 'primary' : 'quiet'} onClick={onNext}>
            {installed ? 'Continue' : 'Maybe later'}
          </Button>
        </StepFooter>
      </>
    )
  },
)
