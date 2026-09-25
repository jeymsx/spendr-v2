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

/*
 * Rewritten September 2026 against what the code actually does, not what it
 * was meant to do. Four statements in the previous version were untrue by
 * then, and one of them seriously:
 *
 *   "Nothing leaves it unless you turn on cloud sync"
 *       Google Fonts loads on every launch; exchange rates are fetched for a
 *       ledger holding a foreign account; the Sheets export sends the whole
 *       ledger. None of them was mentioned.
 *   "never ... transmitted to any third party"
 *       Same three.
 *   "The developer has no access to your cloud data"
 *       Row-level security stops OTHER USERS reading your data. It does not
 *       stop the database operator, who can read every row. A policy that
 *       says otherwise is a promise nobody can keep.
 *   Terms: figures "derived solely from data you enter"
 *       Converted amounts use a third party's exchange rates.
 *
 * Every service named below was found by searching the source for the hosts
 * the app contacts. Keep it that way: add a network call, add it here.
 *
 * Revised again the same month: Inter is bundled now, so Google Fonts is no
 * longer contacted and its section went; push reminders arrived and have
 * theirs; and the cloud sync section says the developer does not access
 * synced data - James's statement of practice, in his words, which is his to
 * make and to keep.
 */
export const PRIVACY_SECTIONS = [
  { h: null, b: 'Last updated: September 2026' },
  { h: 'What is stored, and where', b: 'Everything you enter - transactions, accounts, budgets, goals, bills, templates, the people in your debts, and any account QR images - is stored on your device. It stays there unless you use one of the features listed below.' },
  { h: 'What we do not collect', b: 'No analytics, no usage tracking, no advertising identifiers. The app does not report what you do in it to anyone.' },
  { h: 'Services the app contacts', b: 'Some features need to reach another service. Each one receives your device’s IP address, the way any website does, and nothing more unless stated.' },
  { h: 'Hosting', b: 'The app is served by Vercel. Loading it is an ordinary web request.' },
  { h: 'Exchange rates', b: 'Only if you hold an account in a currency other than your main one. The app asks fxratesapi.com, or open.er-api.com if that fails, for current rates. The request contains your main currency code (for example "PHP") and nothing else about you or your money. Rates are stored on your device.' },
  { h: 'Cloud sync', b: 'Only if you sign in with Google. Your data is then stored in a Supabase database so it can reach your other devices. Row-level security means no other user can read it, and the developer does not access it.' },
  { h: 'Reminders', b: 'Only if you turn them on, which needs cloud sync. Your device works out which card payments and bills are coming up, and stores a short reminder for each in the same database: when to send it, and its text, such as "BPI Credit payment due today, ₱3,000.00 left to pay". It also stores your device’s push address. When a reminder is due, Spendr’s server sends it through your device’s push service (Apple, Google or Mozilla), encrypted so that service cannot read it. The server reads only these reminders, never your transactions or balances. Turning reminders off, or signing out, removes the device’s push address.' },
  { h: 'Google Sheets export', b: 'Only if you connect it. When you run it, the app sends all of your transactions and account balances to the Google Apps Script address you entered. What happens to them there is governed by Google and by that script.' },
  { h: 'Error reports', b: 'If the app crashes, a description of the error is kept on your device. It is only sent anywhere if you choose Send in Settings.' },
  { h: 'Deleting your data', b: 'Delete everything on this device at any time with Settings, Reset app. To have cloud-synced data removed, email jamesandgen111@gmail.com and it will be deleted.' },
  { h: 'Security', b: 'Data on your device is as secure as the device itself. Synced data is protected by Supabase and by your Google account.' },
  { h: 'Changes', b: 'This policy will be updated when what the app does changes. Continued use after an update means you accept it.' },
  { h: 'Contact', b: 'Questions or concerns? Email jamesandgen111@gmail.com' },
]

export const TERMS_SECTIONS = [
  { h: null, b: 'Last updated: September 2026. By using Spendr, you agree to these terms. If you do not agree, please stop using the app.' },
  { h: 'Permitted use', b: 'Spendr is for personal, non-commercial financial tracking. You are responsible for the accuracy of what you enter.' },
  { h: 'Not financial advice', b: 'Spendr does not give financial, investment, tax or legal advice. Its figures are for information only. Do not make financial decisions based on this app alone.' },
  { h: 'Converted amounts', b: 'Where an amount is converted between currencies, it uses mid-market rates from a third-party provider. They may be delayed or unavailable, and they are not the rate your bank will give you. Treat converted figures as estimates.' },
  { h: 'Credit card due dates', b: 'Due dates are worked out from the statement and due days you enter. Always check the due date printed on your statement - the app cannot see it, and paying late is between you and your bank. Reminders, if you turn them on, can arrive late or not at all, and are not a substitute for your bank’s own notices.' },
  { h: 'No institutional affiliation', b: 'Spendr is independent. It is not affiliated with, endorsed by, or connected to GCash, Maya, BPI, BDO, or any other bank, e-wallet or financial institution named in the app. Those names are labels for your own convenience.' },
  { h: 'Intellectual property', b: 'The Spendr app, its design, interface and source code are the intellectual property of James Sablay. All rights reserved.' },
  { h: 'No warranty', b: 'The app is provided "as is" and "as available", without warranties of any kind. No guarantee is made about accuracy, reliability, availability or fitness for a particular purpose.' },
  { h: 'Limitation of liability', b: 'To the fullest extent the law allows, James Sablay is not liable for any direct, indirect, incidental or consequential damages from using or being unable to use the app, including loss of data or charges from a missed payment.' },
  { h: 'Changes to these terms', b: 'These terms may be revised. Continued use after a revision means you accept it.' },
  { h: 'Governing law', b: 'These terms are governed by the laws of the Republic of the Philippines.' },
  { h: 'Contact', b: 'Questions? Email jamesandgen111@gmail.com' },
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
