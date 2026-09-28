/**
 * The privacy policy and terms sheet in Settings.
 *
 * The text itself is lib/policy.js, which the website reads too, so the app
 * and the site can never tell two different stories.
 */
import Sheet from '../../components/ui/Sheet'
import Divider from '../../components/ui/Divider'
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from '../../lib/policy'

// ── Policy sheet ──────────────────────────────────────────────────────────────

export function PolicySheet({ open, type, onClose }) {
  /* No `closing` flag and no scroll lock: Sheet owns the overlay, the panel,
     the grab handle, the scroll lock, Escape, the focus trap and the 240ms
     exit.

     Nothing here guards on `type` either, even though the caller nulls it in
     the same breath as `open` - Sheet freezes the title and the body it was
     showing for the length of the exit, so the sheet slides away still
     reading "Privacy policy" rather than flipping to the terms on the way
     out. */
  const title    = type === 'privacy' ? 'Privacy policy' : 'Terms of use'
  const badge    = type === 'privacy' ? 'Privacy' : 'Legal'
  const sections = type === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS
  const intro    = sections.find(s => s.h === null)
  const body     = sections.filter(s => s.h !== null)

  return (
    /* The same z 100 and the same 45% scrim the hand-rolled overlay drew, and
       Sheet's default `bg-panel` surface is the one it already had.

       88vh through `maxHeight` rather than the old max-h utility: that prop is
       what sets --sheet-max, and an inline height would outrank
       `html.web .sheet-panel`, the rule that makes this a centred modal on
       desktop. It docks the panel too, which is where this one already sat,
       and the docked bottom pad replaces the max(32px, safe-area) it set by
       hand.

       The heading drops from 22px bold to Sheet's title, which is what makes
       it the dialog's accessible name via aria-labelledby - and the Privacy /
       Legal pill moves down into the body with it, because Sheet's title slot
       holds text only: a pill inside the h3 becomes part of that name. */
    <Sheet
      open={open}
      onClose={onClose}
      z={100}
      scrim={45}
      maxHeight="88vh"
      title={title}
      titleAction={(
        <button
          onClick={onClose}
          className="shrink-0 text-xs font-semibold
            text-slate-600 dark:text-slate-300
            px-3 py-1.5 rounded-xl
            bg-slate-100 dark:bg-white/[0.08]
            active:bg-slate-200 dark:active:bg-white/[0.14] transition-colors"
        >
          Done
        </button>
      )}
    >
        <div className="pt-2">
          <span className="inline-block text-xs font-bold
            px-2 py-0.5 rounded-full mb-4
            bg-primary/10 dark:bg-primary/20 text-primary">
            {badge}
          </span>

          {/* Intro callout */}
          {intro && (
            <div className="mb-6 px-4 py-3.5 rounded-2xl
              bg-slate-50 dark:bg-white/[0.04]
              border border-slate-200/60 dark:border-white/[0.07]">
              <p className="text-13 italic leading-relaxed text-slate-500 dark:text-slate-400">
                {intro.b}
              </p>
            </div>
          )}

          {/* Sections */}
          <div className="flex flex-col">
            {body.map((s, i) => {
              const isContact  = s.h === 'Contact'
              const emailMatch = s.b.match(/[\w.-]+@[\w.-]+\.\w+/)
              const beforeEmail = emailMatch ? s.b.slice(0, s.b.indexOf(emailMatch[0])) : s.b
              const afterEmail  = emailMatch ? s.b.slice(s.b.indexOf(emailMatch[0]) + emailMatch[0].length) : ''

              return (
                <div key={i}>
                  {i > 0 && <Divider className="my-4" />}
                  <div className="flex gap-3 items-start">
                    {/* Index badge */}
                    <div
                      className="w-[26px] h-[26px] rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: 'rgba(var(--color-primary-rgb), 0.12)' }}
                    >
                      <span className="text-11 font-bold tabular-nums text-primary">{i + 1}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-white mb-1.5 leading-snug">
                        {s.h}
                      </p>
                      <p className="text-13 text-slate-500 dark:text-slate-400 leading-relaxed">
                        {isContact && emailMatch ? (
                          <>
                            {beforeEmail}
                            <a
                              href={`mailto:${emailMatch[0]}`}
                              className="font-semibold text-primary underline underline-offset-2 decoration-primary/40"
                            >
                              {emailMatch[0]}
                            </a>
                            {afterEmail}
                          </>
                        ) : s.b}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="h-8 shrink-0" />
        </div>
    </Sheet>
  )
}
