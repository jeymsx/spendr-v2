import { useState } from 'react'
import db from '../db/db'
import { IconSparkle } from './icons'

const CURRENT_VERSION = '0.2.0'

/* Written from the user's side of the change, not the code's: what is
   different when you open the app, and - for a money app - which numbers
   were wrong before. The fixes are last but they are not filler; a wrong
   figure on a statement matters more than a nicer card. */
const WHATS_NEW = [
  {
    icon: '\u{1F4B3}',
    title: 'Your accounts look like your cards',
    desc: 'Real bank logos and true card proportions, stacked like a wallet so a whole group fits on one screen.',
  },
  {
    icon: '\u{270B}',
    title: 'Drag to reorder',
    desc: 'Hold any card and drag it up or down. The order sticks.',
  },
  {
    icon: '\u{1F4C4}',
    title: 'Every account has its own page',
    desc: 'Tap a card for its balance, a 30-day trend line and its full history - instead of a half-height sheet.',
  },
  {
    icon: '\u{2728}',
    title: 'Guided account setup',
    desc: 'Adding an account shows the card you are making as you make it, and skips the credit fields for accounts that cannot have a statement.',
  },
  {
    icon: '\u{1F3AF}',
    title: 'Budget, on the home screen',
    desc: 'One line for how much of the month is gone. Tap through for the breakdown, including what you are spending with no limit set at all.',
  },
  {
    icon: '\u{1F522}',
    title: 'Two figures were wrong',
    desc: 'Next Statement counted every future installment instead of just the next bill, and the Credit group total read zero. Both fixed.',
  },
  {
    icon: '\u{1F441}',
    title: 'Easier to read',
    desc: 'Card and text colours now meet contrast standards in both light and dark themes.',
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
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-primary"><IconSparkle size={20} /></span>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">What's New</h2>
              <p className="text-[11px] font-semibold text-primary">Version {CURRENT_VERSION}</p>
            </div>
          </div>
        </div>

        {/* Feature list */}
        <div className="px-5 py-4 flex flex-col gap-3.5 max-h-[55vh] overflow-y-auto no-scrollbar">
          {WHATS_NEW.map(({ icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3">
              <span className="text-xl leading-none mt-0.5 shrink-0">{icon}</span>
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
        <div className="px-5 pb-5 pt-3 border-t border-slate-100 dark:border-white/[0.06]">
          <button
            onClick={() => dismiss(true)}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-white
              bg-primary shadow-[0_4px_16px_rgba(var(--color-primary-rgb),0.35)]
              active:scale-[0.98] transition-all duration-100">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

export { CURRENT_VERSION }
