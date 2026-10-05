import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import PreferencesPage from '../../pages/settings/Preferences'
import { AppLockSections } from '../../pages/settings/AppLock'
import { SectionHeader } from '../../pages/settings/shared'

/**
 * Preferences on a computer: the phone's page (settings/Preferences) with
 * App lock under it, as a section rather than a page of its own - on a
 * computer it is mostly one switch, and Settings' column is shorter for it.
 * Accent colour still opens from its row here (WebSettingsAccent), with this
 * page lit in the column.
 *
 * #app-lock - where the old App lock address, the overview's App lock line
 * and the command palette land - scrolls the section into view.
 */
export default function WebSettingsPreferences() {
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#app-lock') document.getElementById('app-lock')?.scrollIntoView({ block: 'start' })
  }, [hash])
  return (
    <>
      <PreferencesPage />
      <section id="app-lock" aria-label="Security" className="scroll-mt-6">
        <SectionHeader>Security</SectionHeader>
        <AppLockSections />
      </section>
    </>
  )
}
