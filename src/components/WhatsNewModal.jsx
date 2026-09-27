import db from '../db/db'
import { markRead } from '../db/notifications'
import {
  IconSparkle, IconBarChart, IconBell, IconTarget, IconTransferUI, IconTrophy, IconContrast, IconSettings, IconLock,
  IconTrash, IconCategories, IconMotion,
} from './icons'
import Button from './ui/Button'
import Divider from './ui/Divider'
import Sheet from './ui/Sheet'
import { APP_VERSION, RELEASE_NOTES } from '../lib/release'

/* The version is package.json's, through lib/release.js - one number for the
   whole app. */
const CURRENT_VERSION = APP_VERSION

/* ONE RELEASE AT A TIME. The notes are this release's (lib/release.js),
   shown once per version: somebody opening the app today is told what
   changed today. The whole history is the Changelog page in Settings, for
   whoever wants it - which is where a list that only grows belongs.

   What is NOT here: migrations, hooks, refactors and the tests that hold
   them. They are why the figures are right, and none of them is something
   the person using the app wants to read. */
const ICONS = /** @type {Record<string, import('react').ComponentType<{size?: number}>>} */ ({
  trophy: IconTrophy, sparkle: IconSparkle, contrast: IconContrast, chart: IconBarChart,
  settings: IconSettings, bell: IconBell, target: IconTarget, transfer: IconTransferUI, lock: IconLock,
  trash: IconTrash, categories: IconCategories, motion: IconMotion,
})
const WHATS_NEW = RELEASE_NOTES.map(n => ({ Icon: ICONS[n.icon] ?? IconSparkle, title: n.title, desc: n.desc }))

/** The first line of this release, for the notifications list. */
export const WHATS_NEW_HEADLINE = WHATS_NEW[0].title

/**
 * What changed in this version.
 *
 * ── It is a Sheet now ──
 *
 * It used to hand-roll the whole thing: a `fixed inset-0` overlay, its own
 * backdrop, its own 220ms hide animation, and `items-end sm:items-center` to
 * sit at the bottom on a phone and centred on a desktop.
 *
 * That last line is Sheet's job described exactly - Sheet docks to the bottom
 * and the `html.web .sheet-panel` rules centre it on desktop - so this was the
 * twenty-ninth hand-rolled sheet, which is the thing designcheck's overlay
 * rule exists to catch. It was right, and the conversion removes the backdrop,
 * the timer, the `hiding` state and the breakpoint, and gains a scroll lock,
 * Escape, a focus trap and a real dialog role that none of it had.
 *
 * The header stays in the body rather than using Sheet's `title`, because it
 * is an icon, a heading and a version line - and `title` is text only, on
 * purpose: it becomes the dialog's accessible name.
 */
export default function WhatsNewModal({ onClose }) {
  /* Acknowledging the version IS "don't show it again" - the list is keyed to
     one. Before, "Got it" dismissed without writing whatsNewSeen, so it came
     back on the very next launch and the only way to stop it was a small grey
     link below, which is not where anyone looks.

     Written before onClose, not after a timer: Sheet plays its own exit and
     calls onClose the moment you dismiss, so there is nothing left to wait
     for. */
  async function acknowledge() {
    try {
      await db.meta.put({ key: 'whatsNewSeen', value: CURRENT_VERSION })
      // Read here is read in the bell too: the same news, not twice.
      await markRead([`whats-new:${CURRENT_VERSION}`])
    } catch (e) { console.warn('[whatsnew] could not record', e) }
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      ariaLabel={`What's new in version ${CURRENT_VERSION}`}
      z={400}
      footer={<Button size="sm" block onClick={acknowledge}>Got it</Button>}
    >
      {/* Header. Not Sheet's `title`, which is text only - see the note. */}
      <div className="flex items-center gap-3 pb-4">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
          <span className="accent-ink"><IconSparkle size={20} /></span>
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">What&apos;s new</h2>
          <p className="text-11 font-semibold accent-ink">Version {CURRENT_VERSION}</p>
        </div>
      </div>

      <Divider />

      <div className="py-4 flex flex-col gap-3.5">
        {WHATS_NEW.map(({ Icon, title, desc }) => (
          <div key={title} className="flex items-start gap-3">
            {/* A tinted disc rather than a bare glyph. An 18px stroke icon on
                the card's own white sits too light next to a bold title and
                the column reads as unfinished; the disc gives it the same
                weight the emoji had.

                .accent-ink, not text-primary: the raw accent is a FILL colour
                and measures 2.85:1 on white at the default blue, 1.6:1 on
                Honey. The disc is primary at 10% over white, so the glyph is
                effectively accent-on-white and needs the shifted ink to clear
                3:1. */}
            <span className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-primary/20
              accent-ink flex items-center justify-center shrink-0 mt-0.5">
              <Icon size={17} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-white leading-snug">{title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

export { CURRENT_VERSION }
