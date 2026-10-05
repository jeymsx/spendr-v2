import PreferencesPage from '../../pages/settings/Preferences'
import { AppLockSections } from '../../pages/settings/AppLock'
import { SectionHeader } from '../../pages/settings/shared'

/**
 * Preferences on a computer: the phone's page (settings/Preferences) with
 * App lock under it, as a section rather than a page of its own - on a
 * computer it is mostly one switch, and Settings' column is shorter for it.
 * Accent colour still opens from its row here (WebSettingsAccent), with this
 * page lit in the column.
 */
export default function WebSettingsPreferences() {
  return (
    <>
      <PreferencesPage />
      <section id="app-lock" aria-label="Security">
        <SectionHeader>Security</SectionHeader>
        <AppLockSections />
      </section>
    </>
  )
}
