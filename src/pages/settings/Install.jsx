import { useState } from 'react'
import Sheet from '../../components/ui/Sheet'
import InstallGuide from '../../components/InstallGuide'
import { GlassArt } from '../../components/glass/GlassArt'
import { promptInstall, useInstall } from '../../lib/install'
import { RowChevron, RowIcon, SettingsRow } from './shared'

/**
 * Settings > App > Install Spendr: a row, and the sheet it opens.
 *
 * Split like Reminders, for the same reason: the row lives in a SectionCard,
 * whose backdrop-filter would clip a fixed sheet opened inside it, so the
 * sheet is rendered with the page's others.
 *
 * The row is there only while there is something to do. Opened from the Home
 * Screen it is gone, and so it is on a computer whose browser has not offered
 * an install. Where the browser has offered one, the row IS the button - the
 * browser's own dialog opens straight away, with no sheet in between.
 */

function IconInstall() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="3" />
      <path d="M12 7.5v6M9.5 11l2.5 2.5 2.5-2.5M10.5 18.5h3" />
    </svg>
  )
}

export function useInstallSettings() {
  const context = useInstall()
  const [open, setOpen] = useState(false)
  const shown = context === 'prompt' || context === 'ios' || context === 'android' || context === 'in-app'

  async function tap() {
    if (context === 'prompt') {
      const r = await promptInstall()
      // Turned down: the prompt is spent, so the sheet's steps take over.
      if (r === 'dismissed') setOpen(true)
      return
    }
    setOpen(true)
  }

  return { context, shown, open, setOpen, tap }
}

/** @param {{s: ReturnType<typeof useInstallSettings>}} props */
export function InstallRow({ s }) {
  return (
    <SettingsRow
      iconEl={<RowIcon color="teal"><IconInstall /></RowIcon>}
      label="Install Spendr"
      sublabel={s.context === 'in-app' ? 'Open it in your browser first' : 'Add it to your Home Screen'}
      right={<RowChevron />}
      onTap={s.tap}
    />
  )
}

/** @param {{s: ReturnType<typeof useInstallSettings>}} props */
export function InstallSheet({ s }) {
  return (
    <Sheet open={s.open} onClose={() => s.setOpen(false)} z={100} scrim={45} ariaLabel="Install Spendr">
      <div className="pt-3 pb-2">
        <div className="text-center">
          <GlassArt name="phone" size={80} animate={s.open} className="mx-auto" />
          <h3 className="mt-3 text-18 font-semibold text-slate-900 dark:text-white">
            Spendr on your Home Screen
          </h3>
          <p className="mt-1 mx-auto max-w-[270px] text-13 leading-snug text-slate-500 dark:text-slate-400">
            It opens like an app, full screen, and works offline.
          </p>
        </div>
        <div className="mt-5">
          <InstallGuide onInstalled={() => s.setOpen(false)} />
        </div>
      </div>
    </Sheet>
  )
}
