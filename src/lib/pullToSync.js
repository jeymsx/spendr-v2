import { matchPath } from 'react-router-dom'

/**
 * Where pulling down syncs, and where it does not.
 *
 * ── The rule ──
 *
 * Pull to sync belongs to screens that SHOW your data - the tabs, the lists,
 * an account or a goal - because that is where "is this up to date?" is the
 * question, and it is where every native app puts it. It does not belong
 * where you are MAKING something: a form, an editor, a settings page. A pull
 * there is almost always a scroll that overshot, and a sync that lands in the
 * middle of a half-filled form can move the ground under it - a new account
 * named "BPI" while the pull brings another BPI down, a budget page redrawn
 * under the field you were typing in.
 *
 * It used to be allowed everywhere but the import wizard, so a pull on
 * "New account" synced.
 *
 * ── Settings ──
 *
 * Every settings page is off, the Sync page included: it has a Sync now
 * button of its own, and a settings screen is an editor of preferences.
 */
const NO_PULL = [
  // Adding and editing money
  '/expense', '/inflow', '/transfer', '/transactions/:id/edit',
  // Adding and editing things that hold it
  '/accounts/new', '/accounts/:id/edit',
  '/recurring/new', '/recurring/:id/edit',
  // Writing a note
  '/notes/:id',
  // Wizards and settings
  '/import',
  '/settings', '/settings/*',
  '/insights/forecast/settings',
  '/insights/trend/settings',
]

/**
 * Whether a pull at the top of this page may sync.
 * @param {string} pathname
 */
export function canPullToSync(pathname) {
  return !NO_PULL.some(path => matchPath({ path, end: true }, pathname))
}
