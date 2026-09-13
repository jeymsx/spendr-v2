/**
 * The accent picker, and the privacy and terms text.
 *
 * Lifted out of Settings.jsx unchanged. Two unrelated things in one file
 * because both are short, static and read-only - the alternative is two
 * modules of a hundred lines each.
 */
import Sheet from '../../components/ui/Sheet'
import Divider from '../../components/ui/Divider'

// ── Policy sheet ──────────────────────────────────────────────────────────────

export const PRIVACY_SECTIONS = [
  { h: null,                  b: 'Last updated: May 2026' },
  { h: 'What We Store',       b: 'Your financial data (transactions, accounts, categories and budgets) is stored locally on your device. Nothing leaves it unless you turn on cloud sync.' },
  { h: 'Cloud sync',          b: 'If you sign in with Google and enable Supabase sync, your data is stored in Supabase under your own credentials. The developer has no access to your cloud data.' },
  { h: 'What We Don\'t Collect', b: 'We collect no analytics, usage telemetry, advertising identifiers, or personal information beyond what you voluntarily enter in the app.' },
  { h: 'How Data Is Used',    b: 'All data exists solely to provide the app\'s budgeting and tracking functionality. Your data is never sold, shared, or transmitted to any third party.' },
  { h: 'Data Deletion',       b: 'You can permanently delete all local data at any time via Settings → Reset app. To remove cloud-synced data, contact us at jamesandgen111@gmail.com and we will delete your data from our servers.' },
  { h: 'Security',            b: 'Local data security depends on your device\'s own security settings. Cloud-synced data is protected by Supabase\'s infrastructure and your Google account credentials.' },
  { h: 'Changes',             b: 'This policy may be updated from time to time. Continued use of the app after changes are posted constitutes acceptance of the updated policy.' },
  { h: 'Contact',             b: 'Questions or concerns? Email us at jamesandgen111@gmail.com' },
]

export const TERMS_SECTIONS = [
  { h: null,                         b: 'Last updated: May 2026. By using Spendr, you agree to these Terms. If you do not agree, please stop using the app.' },
  { h: 'Permitted Use',              b: 'Spendr is intended for personal, non-commercial financial tracking only. You are solely responsible for the accuracy of any data you enter.' },
  { h: 'No Financial Advice',        b: 'Spendr does not provide financial, investment, tax, or legal advice. All figures and summaries are derived solely from data you enter and are for informational purposes only. Do not make financial decisions based solely on this app.' },
  { h: 'No Institutional Affiliations', b: 'Spendr is an independent tool. It is not affiliated with, endorsed by, sponsored by, or officially connected to GCash, Maya, BPI, BDO, or any other bank, e-wallet, or financial institution whose name appears in the app. Institution names are used only as labels for your own organizational convenience.' },
  { h: 'Intellectual Property',      b: 'The Spendr application, its design, interface, and source code are the intellectual property of James Sablay. All rights reserved.' },
  { h: 'Disclaimer of Warranties',   b: 'The app is provided "as is" and "as available" without warranties of any kind. The developer makes no guarantees regarding accuracy, reliability, uptime, or fitness for a particular purpose.' },
  { h: 'Limitation of Liability',    b: 'To the fullest extent permitted by law, James Sablay shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of or inability to use the app, including any loss of data.' },
  { h: 'Changes to Terms',           b: 'These terms may be revised at any time. Your continued use of the app after changes are posted constitutes acceptance of the revised terms.' },
  { h: 'Governing Law',              b: 'These terms are governed by the laws of the Republic of the Philippines.' },
  { h: 'Contact',                    b: 'Questions? Email us at jamesandgen111@gmail.com' },
]

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
