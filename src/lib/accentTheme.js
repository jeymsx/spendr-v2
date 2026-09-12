/**
 * The net-worth card's gradient, for a given accent.
 *
 * This existed twice, byte-identical, in Dashboard.jsx and Accounts.jsx. It is
 * here once now because a third caller needed it and that third caller needed
 * something the other two never did: the ability to render an accent that is
 * NOT the active one.
 *
 * Both copies read `var(--color-primary)`, which resolves to whatever accent is
 * live. That is correct for the two real cards - there is only ever one accent
 * on screen - and useless for the accent picker, where eight previews have to
 * show eight different accents at once. So the hex is substituted directly.
 *
 * Azure is special-cased with hand-picked stops rather than the color-mix
 * formula. It is the default accent, and the formula applied to #2D9DFF gives
 * a flatter, greyer card than the blue it shipped with; the literals preserve
 * that. Every other accent goes through the mix, which is why they are
 * consistent with each other and Azure is the one that looks hand-made.
 *
 * @param {string} accentHex
 * @param {string} theme
 */
export function cardGradient(accentHex, theme) {
  const isDark = theme === 'dark'
  if (accentHex === '#2D9DFF') {
    return isDark
      ? 'linear-gradient(135deg, #0d47a1 0%, #1565c0 35%, #2196f3 70%, #42a5f5 100%)'
      : 'linear-gradient(135deg, #1565c0 0%, #1e88e5 45%, #64b5f6 100%)'
  }
  /** @param {number} pct */
  const mix = (pct) => `color-mix(in srgb, ${accentHex} ${pct}%, black)`
  return isDark
    ? `linear-gradient(135deg, ${mix(28)} 0%, ${mix(48)} 40%, ${mix(75)} 100%)`
    : `linear-gradient(135deg, ${mix(52)} 0%, ${mix(80)} 50%, ${accentHex} 100%)`
}
