import { previewInstall } from '../../lib/install'

/**
 * Every version of setup, on one computer, in the dev server.
 *
 * Setup is different on an iPhone in Safari, on Android, in Messenger's
 * browser, signed in or not - and the dev server runs on a laptop with no
 * cloud configured, where most of those never appear. So in development the
 * address can say which phone to be:
 *
 *   /onboarding?as=ios            the iPhone, in Safari (install first)
 *   /onboarding?as=android        Android, before its install prompt
 *   /onboarding?as=prompt         Android, with the prompt handed over
 *   /onboarding?as=in-app         inside Messenger's browser
 *   /onboarding?as=installed      opened from the Home Screen
 *   &cloud=1                      as if cloud sync were set up
 *   &signedin=1                   ... and already signed in
 *   &push=ios-install|blocked|unsupported   notifications not possible yet
 *   &ph=0                         outside the Philippines (asks the currency)
 *   &step=accounts                start at a step
 *
 * A production build ignores all of it: `import.meta.env.DEV` is false there
 * and the whole function folds to the empty answer.
 *
 * @returns {{cloud?: boolean, signedIn?: boolean, push?: string, ph?: boolean, step?: string} | null}
 */
export function readPreview() {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null
  const q = new URLSearchParams(location.search)
  if (![...q.keys()].some(k => ['as', 'cloud', 'signedin', 'push', 'ph', 'step'].includes(k))) return null
  const as = q.get('as')
  if (as) previewInstall(/** @type {any} */ (as))
  return {
    cloud: q.has('cloud') ? q.get('cloud') === '1' : undefined,
    signedIn: q.get('signedin') === '1' || undefined,
    push: q.get('push') ?? undefined,
    ph: q.has('ph') ? q.get('ph') !== '0' : undefined,
    step: q.get('step') ?? undefined,
  }
}
