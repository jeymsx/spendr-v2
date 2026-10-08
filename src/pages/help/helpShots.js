/**
 * The help centre's screenshots: the website's own captures
 * (site/src/assets/screens), taken from the real app with the demo ledger, so
 * an article shows the same picture in the app as on the web.
 *
 * Only the ones lib/help.js may use (HELP_SHOTS) are pulled in. Each is a URL
 * and nothing more until an article draws it, and the build files them under
 * assets/help/, which the service worker does not precache: a few megabytes of
 * pictures most people never open would otherwise be in every install. They
 * are kept once seen (vite.config.js, runtimeCaching), and an article read
 * offline before its picture ever was simply has no picture.
 */

const files = /** @type {Record<string, string>} */ (import.meta.glob(
  '../../../site/src/assets/screens/{home,transactions,expense,ql-expense-form,ql-transfer-form,accounts,card,budget,recurring,goals,debts,insights,networth,forecast,achievements,desktop,desktop-insights,wrapped-intro,wrapped-summary,wrapped-receipt,wrapped-top,wrapped-personality}-{light,dark}.webp',
  { eager: true, query: '?url', import: 'default' },
))

/** @type {Record<string, {light?: string, dark?: string}>} */
const SHOTS = {}
for (const [path, url] of Object.entries(files)) {
  const m = path.match(/([\w-]+)-(dark|light)\.webp$/)
  if (!m) continue
  const [, name, theme] = m
  ;(SHOTS[name] ??= {})[/** @type {'light'|'dark'} */ (theme)] = url
}

/**
 * The picture for a theme, or the other theme's when there is only one (the
 * Wrapped slides are dark either way).
 *
 * @param {string} name
 * @param {'light'|'dark'} theme
 * @returns {string|null}
 */
export function shotUrl(name, theme) {
  const s = SHOTS[name]
  if (!s) return null
  return s[theme] ?? s.dark ?? s.light ?? null
}

/** The names there are pictures for, for the test that holds help.js to them. */
export const SHOT_NAMES = Object.keys(SHOTS)
