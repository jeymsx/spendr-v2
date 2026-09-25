/**
 * The recap's look and motion, in one place.
 *
 * ── Flat, on purpose ──
 *
 * No gradients, no glows, no particles. Each slide is one solid background
 * and one solid surface, and what moves is the surface itself: it changes
 * size, corner radius and colour from slide to slide while its content swaps
 * through a short blur. That single morphing object is the whole effect.
 *
 * ── One spring, no bounce ──
 *
 * Everything that moves uses the same spring with `bounce: 0` - critically
 * damped, so it settles without overshooting. A shared spring is what makes
 * separate movements read as one gesture.
 *
 * ── Two palettes ──
 *
 * The recap draws its own colours rather than the app's, so it reads as a
 * story rather than another screen - but it follows the app's theme, so
 * opening it at night is not a flashlight. Each palette is warm and low in
 * saturation; the ink on each clears 7:1 on both its background and its
 * surface, and the muted ink clears 4.5:1.
 */

/** The spring every morph and entrance uses. */
export const SPRING = { type: 'spring', bounce: 0, visualDuration: 0.5 }
/** Colour has no velocity to carry, so it eases rather than springs. */
export const COLOR_EASE = { duration: 0.45, ease: [0.22, 1, 0.36, 1] }
/** Leaving is quicker than arriving, and accelerates away rather than settling. */
export const EXIT = { duration: 0.22, ease: [0.4, 0, 1, 1] }
/** How long a slide stays before moving on by itself. */
export const SLIDE_MS = 6500

/**
 * @typedef {object} Swatch
 * @property {string} bg       the screen
 * @property {string} surface  the morphing card
 * @property {string} ink      text on either
 * @property {string} muted    secondary text
 * @property {string} track    bars at rest, hairlines
 * @property {string} good     a figure that went well
 * @property {string} soft     a figure that did not - warm, never alarming
 */

/** @type {Record<'light'|'dark', Swatch[]>} */
export const PALETTES = {
  light: [
    { bg: '#F4EFE7', surface: '#FFFFFF', ink: '#1C1A17', muted: '#625C53', track: '#E7E1D7', good: '#2E7148', soft: '#A5482F' },
    { bg: '#E3EBE0', surface: '#FAFCF8', ink: '#18241B', muted: '#4E5E52', track: '#D4DED0', good: '#2E7148', soft: '#A5482F' },
    { bg: '#DEE6F0', surface: '#F9FBFD', ink: '#162130', muted: '#4D5B6C', track: '#CFD9E5', good: '#2E7148', soft: '#A5482F' },
    { bg: '#F2E3DC', surface: '#FFFBF9', ink: '#2A1A15', muted: '#6A544C', track: '#E6D3CA', good: '#2E7148', soft: '#A5482F' },
    { bg: '#E6E2F0', surface: '#FBFAFE', ink: '#1E1A2C', muted: '#5A5470', track: '#D8D3E6', good: '#2E7148', soft: '#A5482F' },
    { bg: '#EFE8D8', surface: '#FFFDF7', ink: '#221D12', muted: '#645B47', track: '#E1D8C3', good: '#2E7148', soft: '#A5482F' },
  ],
  dark: [
    { bg: '#1B1916', surface: '#28251F', ink: '#F4EFE7', muted: '#B5AC9F', track: '#3A362E', good: '#7FC79A', soft: '#E9967C' },
    { bg: '#151B17', surface: '#202822', ink: '#EAF1EB', muted: '#A7B5AA', track: '#2F3A32', good: '#7FC79A', soft: '#E9967C' },
    { bg: '#141A21', surface: '#1F2731', ink: '#E9EFF6', muted: '#A4B0BF', track: '#2E3947', good: '#7FC79A', soft: '#E9967C' },
    { bg: '#1E1715', surface: '#2C2320', ink: '#F5ECE8', muted: '#BBA9A2', track: '#3F332F', good: '#7FC79A', soft: '#E9967C' },
    { bg: '#19171F', surface: '#25222D', ink: '#EFECF6', muted: '#ADA7BC', track: '#373341', good: '#7FC79A', soft: '#E9967C' },
    { bg: '#1C1A14', surface: '#29261D', ink: '#F4EFE2', muted: '#B6AE99', track: '#3B372B', good: '#7FC79A', soft: '#E9967C' },
  ],
}

/**
 * What the surface becomes on each slide, as a share of the screen it has.
 * `radius` is in px; `height` is a fraction of the space between the header
 * and the bottom margin, so a short phone gets a shorter card, not a clipped
 * one. `circle` squares the shape on its shorter side and rounds it fully.
 *
 * @type {Record<string, {width: number, height: number, radius: number, palette: number, circle?: boolean}>}
 */
export const SHAPES = {
  intro:      { width: 0.82, height: 0.5,  radius: 999, palette: 0, circle: true },
  spent:      { width: 1,    height: 0.56, radius: 36,  palette: 1 },
  kept:       { width: 1,    height: 0.5,  radius: 56,  palette: 2 },
  categories: { width: 1,    height: 0.8,  radius: 32,  palette: 3 },
  days:       { width: 1,    height: 0.74, radius: 32,  palette: 4 },
  biggest:    { width: 1,    height: 0.52, radius: 64,  palette: 5 },
  goto:       { width: 0.9,  height: 0.5,  radius: 48,  palette: 0 },
  budgets:    { width: 1,    height: 0.72, radius: 32,  palette: 1 },
  networth:   { width: 1,    height: 0.7,  radius: 32,  palette: 2 },
  badges:     { width: 0.9,  height: 0.5,  radius: 48,  palette: 4 },
  summary:    { width: 1,    height: 1,    radius: 28,  palette: 0 },
}
