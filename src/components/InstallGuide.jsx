import { useEffect, useState } from 'react'
import Button from './ui/Button'
import { IconCheckCircle } from './icons'
import { prefersReducedMotion } from './ui/motion'
import {
  chromeIntentUrl, inAppBrowser, iosBrowser, isIpad, promptInstall, safariVersion, useInstall,
} from '../lib/install'
import { isAndroid } from '../utils/platform'

/**
 * How to put Spendr on this phone's Home Screen, whichever phone it is.
 *
 * The same guide in the last step of setup and in Settings, so there is one
 * wording of it to keep right. What it shows is lib/install.js's answer:
 *
 *   prompt     one button - the browser's own install dialog does the rest
 *   ios        three steps, with the glyphs Safari actually draws
 *   android    the menu, for a browser that has not offered its prompt
 *   in-app     the way out of Messenger's or Facebook's browser first
 *   installed  a line saying it is done
 *
 * Theme-aware. Onboarding's shell is `dark` whatever the theme, so the dark
 * half of every pair is what shows there.
 */

/** @param {{d: string, fill?: boolean}} props */
function Glyph({ d, fill = false }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"
      fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

/* The glyphs the browsers themselves draw, so the step shows the button to
   look for rather than a picture of an idea. */
const SHARE = 'M8 10H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1M12 3v11M8.5 6.5 12 3l3.5 3.5'
const ADD_SQUARE = 'M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3ZM12 8.5v7M8.5 12h7'
const MORE_H = 'M5 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z'
const MORE_V = 'M13.5 5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Zm0 7a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Zm0 7a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z'
const MENU = 'M4 7h16M4 12h16M4 17h16'
const INSTALL = 'M12 4v10M8 10.5l4 4 4-4M5 18.5h14'
const COMPASS = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.5 8.5l-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z'

/**
 * @typedef {{icon: import('react').ReactNode, title: string, sub?: string}} Step
 */

/** "Add", as the button in the corner of iOS's Add to Home Screen sheet says it. */
function AddPill() {
  return <span className="text-12 font-bold tracking-tight">Add</span>
}

/** @returns {Step[]} */
function iosSteps() {
  const browser = iosBrowser()
  const ipad = isIpad()
  const first = browser === 'safari'
    ? (ipad
        ? { icon: <Glyph d={SHARE} />, title: 'Tap Share', sub: 'Top right, next to the address' }
        : safariVersion() >= 26
          ? { icon: <Glyph d={MORE_H} fill />, title: 'Tap ••• then Share', sub: 'Bottom right of Safari' }
          : { icon: <Glyph d={SHARE} />, title: 'Tap Share', sub: 'At the bottom of Safari' })
    : browser === 'chrome'
      ? { icon: <Glyph d={SHARE} />, title: 'Tap Share', sub: 'In the address bar, top right' }
      : { icon: <Glyph d={MORE_H} fill />, title: 'Open the menu, then Share', sub: 'In the browser’s toolbar' }
  return [
    first,
    { icon: <Glyph d={ADD_SQUARE} />, title: 'Tap Add to Home Screen', sub: 'Scroll down if you don’t see it' },
    { icon: <AddPill />, title: 'Tap Add', sub: 'Then open Spendr from your Home Screen' },
  ]
}

/** @returns {Step[]} */
function androidSteps() {
  const samsung = /SamsungBrowser/.test(typeof navigator === 'undefined' ? '' : navigator.userAgent)
  return [
    samsung
      ? { icon: <Glyph d={MENU} />, title: 'Tap the menu', sub: 'The three lines, bottom right' }
      : { icon: <Glyph d={MORE_V} fill />, title: 'Tap the menu', sub: 'The three dots, top right' },
    { icon: <Glyph d={INSTALL} />, title: samsung ? 'Tap Add page to, then Home screen' : 'Tap Install app', sub: samsung ? undefined : 'Or Add to Home screen' },
    { icon: <Glyph d={ADD_SQUARE} />, title: 'Confirm', sub: 'Spendr joins your apps' },
  ]
}

/** @returns {Step[]} */
function inAppSteps() {
  return [
    { icon: <Glyph d={MORE_H} fill />, title: 'Tap the ••• menu', sub: 'In a corner of this screen' },
    { icon: <Glyph d={COMPASS} />, title: isAndroid() ? 'Open in Chrome' : 'Open in Safari', sub: 'Or Open in browser' },
  ]
}

/**
 * The numbered steps, with the one to do now picked out in turn - a slow
 * cycle that reads as "then this, then this", and stands still for reduced
 * motion.
 *
 * @param {{steps: Step[]}} props
 */
function Steps({ steps }) {
  const [active, setActive] = useState(0)
  useEffect(() => {
    if (prefersReducedMotion()) return
    const t = setInterval(() => setActive(i => (i + 1) % steps.length), 1700)
    return () => clearInterval(t)
  }, [steps.length])

  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s, i) => (
        <li
          key={s.title}
          className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-500 ${i === active
            ? 'bg-primary/[0.08] dark:bg-primary/[0.12]'
            : 'bg-slate-50 dark:bg-white/[0.04]'}`}
        >
          <span
            className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-colors duration-500 ${i === active
              ? 'bg-primary text-white'
              : 'bg-white text-primary dark:bg-white/[0.08] dark:text-primary'}`}
          >
            {s.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-14 font-semibold text-slate-900 dark:text-white leading-snug">
              <span className="text-slate-400 dark:text-slate-500 tabular-nums mr-1.5">{i + 1}</span>
              {s.title}
            </span>
            {s.sub && <span className="block text-12 text-slate-500 dark:text-slate-400 leading-snug mt-0.5">{s.sub}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * @param {{context?: import('../lib/install').InstallContext, onInstalled?: () => void, bare?: boolean}} props
 *   bare  leave out the in-app browser's explanation, for a screen whose
 *         heading already says it
 */
export default function InstallGuide({ context: forced, onInstalled, bare = false }) {
  const live = useInstall()
  const context = forced ?? live
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState(/** @type {'accepted'|'dismissed'|null} */ (null))
  const [copied, setCopied] = useState(false)

  async function install() {
    setBusy(true)
    const r = await promptInstall()
    setBusy(false)
    if (r === 'accepted') {
      setAnswer('accepted')
      onInstalled?.()
    } else if (r === 'dismissed') {
      setAnswer('dismissed')
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.origin)
      setCopied(true)
    } catch { /* no clipboard in this browser: the steps still say where to go */ }
  }

  if (context === 'installed' || answer === 'accepted') {
    return (
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5 bg-emerald-500/[0.08] dark:bg-emerald-500/[0.12]">
        <span className="text-emerald-600 dark:text-emerald-400 shrink-0"><IconCheckCircle size={22} /></span>
        <span className="min-w-0">
          <span className="block text-14 font-semibold text-slate-900 dark:text-white">Spendr is on your Home Screen</span>
          <span className="block text-12 text-slate-500 dark:text-slate-400 mt-0.5">Open it from there, like any app.</span>
        </span>
      </div>
    )
  }

  if (context === 'prompt') {
    return (
      <div className="flex flex-col gap-2">
        <Button size="lg" block onClick={install} loading={busy}>Install Spendr</Button>
        <p className="text-center text-12 text-slate-500 dark:text-slate-400">
          {answer === 'dismissed' ? 'No problem. It’s in Settings whenever you want it.' : 'Free, and it works offline.'}
        </p>
      </div>
    )
  }

  if (context === 'in-app') {
    const app = inAppBrowser()
    return (
      <div className="flex flex-col gap-3">
        {!bare && (
          <p className="text-13 leading-snug text-slate-600 dark:text-slate-300">
            {app ? `This is ${app}’s browser.` : 'This is another app’s browser.'} Open Spendr in {isAndroid() ? 'Chrome' : 'Safari'} so it can be installed, and so your data stays on your phone.
          </p>
        )}
        {isAndroid() && (
          <Button block onClick={() => { location.href = chromeIntentUrl() }}>Open in Chrome</Button>
        )}
        <Steps steps={inAppSteps()} />
        <Button block variant="secondary" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</Button>
      </div>
    )
  }

  if (context === 'ios') return <Steps steps={iosSteps()} />
  if (context === 'android') return <Steps steps={androidSteps()} />

  return (
    <p className="text-13 leading-snug text-slate-600 dark:text-slate-300">
      Look for the install button in your browser’s address bar. In Safari on a Mac, choose File, then Add to Dock.
    </p>
  )
}
