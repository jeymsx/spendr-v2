import { useState } from 'react'
import db from '../db/db'
import {
  IconSparkle, IconQuickLog, IconBell, IconBillHistory, IconDebt,
  IconCategories, IconDrawn, IconPalette, IconSettings, IconContrast,
} from './icons'
import Button from './ui/Button'
import Divider from './ui/Divider'

const CURRENT_VERSION = '0.3.0'

/* Written from the user's side of the change, not the code's: what is
   different when you open the app. Ordered by what you meet first - the +
   button, then the home screen, then the pages behind it, then settings - so
   reading the list walks the app rather than the changelog.

   What is NOT here: the 86 tests and the AST checks this release added. They
   are the reason the figures stay right, but a test count is something the
   person who wrote it wants to say, not something the person using it wants
   to read. That belongs in plan.md.

   `Icon` is a COMPONENT, not a string. This list held emoji until 0.3.0 -
   which is the release that took the emoji out of the app, so it could hardly
   keep rendering nine of them. */
const WHATS_NEW = [
  {
    Icon: IconQuickLog,
    title: 'Hold the + and just type it',
    desc: 'Say “150 jollibee” or “500 from gcash to bpi”. Spendr reads the amount, the merchant and the account, then opens the right form with it all filled in.',
  },
  {
    Icon: IconBell,
    title: 'You can tell at a glance',
    desc: 'A number appears on Bills, Debts and Goals the moment one of them needs you.',
  },
  {
    Icon: IconBillHistory,
    title: 'Every bill has its own page',
    desc: 'Tap one for what it costs you a year, when it last posted, and the button that posts the next charge.',
  },
  {
    Icon: IconDebt,
    title: 'Debts, rebuilt',
    desc: 'One list, or split by who owes whom. Recording a payment uses your keyboard now instead of a number pad of its own.',
  },
  {
    Icon: IconCategories,
    title: 'Pick a category with your thumb',
    desc: 'The category picker is a row you swipe, not a sheet that covers the form you were filling in. The filters use the same row.',
  },
  {
    Icon: IconDrawn,
    title: 'No more emoji',
    desc: 'Every glyph in the app is drawn now, at one weight, matching the bar along the bottom. Categories carry their own colour.',
  },
  {
    Icon: IconPalette,
    title: 'See the accent before you choose it',
    desc: 'Accent colour is its own page, and each colour arrives as a card you swipe through showing the app wearing it.',
  },
  {
    Icon: IconSettings,
    title: 'Categories and Budgets are pages',
    desc: 'Both open like everything else, with a back button - so editing one is no longer a sheet stacked on a sheet.',
  },
  {
    Icon: IconContrast,
    title: 'Readable in daylight',
    desc: 'Accent-coloured text, category tiles and the new badges were all measured against the background they sit on, and moved until they passed.',
  },
]

export default function WhatsNewModal({ onClose }) {
  const [hiding, setHiding] = useState(false)

  function dismiss(persist) {
    setHiding(true)
    setTimeout(async () => {
      if (persist) {
        await db.meta.put({ key: 'whatsNewSeen', value: CURRENT_VERSION })
      }
      onClose()
    }, 220)
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-4"
      style={{ touchAction: 'none' }}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-220 ${hiding ? 'opacity-0' : 'opacity-100'}`}
        onClick={() => dismiss(false)}
      />

      {/* Card */}
      <div className={[
        'relative w-full max-w-sm rounded-3xl overflow-hidden',
        'bg-white dark:bg-[#111820]',
        'border border-slate-100 dark:border-white/[0.07]',
        'shadow-[0_24px_64px_rgba(0,0,0,0.4)]',
        'transition-all duration-220',
        hiding ? 'opacity-0 translate-y-4 scale-[0.97]' : 'opacity-100 translate-y-0 scale-100',
      ].join(' ')}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
              <span className="accent-ink"><IconSparkle size={20} /></span>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">What's new</h2>
              <p className="text-[11px] font-semibold accent-ink">Version {CURRENT_VERSION}</p>
            </div>
          </div>
        </div>

        <Divider />

        {/* Feature list */}
        <div className="px-5 py-4 flex flex-col gap-3.5 max-h-[55vh] overflow-y-auto no-scrollbar">
          {WHATS_NEW.map(({ Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3">
              {/* A tinted disc rather than a bare glyph. An 18px stroke icon
                  on the card's own white sits too light next to a bold title
                  and the column reads as unfinished; the disc gives it the
                  same weight the emoji had.

                  .accent-ink, not text-primary: the raw accent is a FILL
                  colour and measures 2.85:1 on white at the default blue,
                  1.6:1 on Honey. The disc is primary at 10% over white, so
                  the glyph is effectively accent-on-white and needs the
                  shifted ink to clear 3:1. */}
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

        {/* Actions.

            One button, and it persists. Before, "Got it" dismissed without
            writing whatsNewSeen, so the modal came back on the very next app
            load and the only way to stop it was a small grey link below -
            which is not where anyone looks. This list is keyed to a version,
            so acknowledging the version IS "don't show it again". */}
        <Divider />

        <div className="px-5 pb-5 pt-3">
          <Button size="sm" block onClick={() => dismiss(true)}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  )
}

export { CURRENT_VERSION }
