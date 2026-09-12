/**
 * Regenerate the `fluted` card pattern in src/index.css.
 *
 *   node scripts/fluted.mjs [light] [dark] [ribs] [angle]
 *
 * ── Why the ribs are an SVG and the blend mode is not ──
 *
 * The effect is frontend.fyi's frosted glass: a repeating band gradient
 * composited over a brighter one in `color-dodge`. The dodge is the whole
 * thing - it leaves dark values untouched and blows bright ones out, so the
 * bands become glare rather than grey stripes. It survives onto a card because
 * the card's background is already two layers, pattern over brand gradient, so
 * `background-blend-mode` can dodge one against the other with no extra
 * element and no wrapper.
 *
 * The bands themselves started as a plain CSS repeating-linear-gradient, which
 * worked and could not be masked: a background layer composites, it does not
 * clip its neighbour, and `mask-image` on the card would take the brand
 * gradient with it. An SVG can carry its own mask and still be dodged by CSS,
 * so the ribs moved back into one.
 *
 * ── The mask is two gradients, multiplied ──
 *
 * Nesting one mask inside another multiplies them, which is the only way to
 * feather in both axes at once. Horizontally it clears the left, where the
 * name, the type and the currency all sit; vertically it softens the top and
 * bottom strips. The corner where those overlap - top left, which carries the
 * account name - ends up at roughly 4% of full strength.
 *
 * The bottom right keeps its ribs on purpose. What is there is the network
 * mark and the brand watermark, both decorative, and clearing it too would
 * leave the pattern floating in the middle of the card with no edge to sit on.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [light = 0.14, dark = 0.30, ribs = 13, angle = 118] = process.argv.slice(2).map(Number)

const W = 158, H = 100
// The gradient vector is the rib: its length sets the spacing, its direction
// the angle. spreadMethod='repeat' tiles the stop list along it.
const rad = (angle * Math.PI) / 180
const vx = (Math.cos(rad) * ribs) / W
const vy = (Math.sin(rad) * ribs) / H

const svg =
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none'%3E`
  + `%3Cdefs%3E`
  // The reference's stop ratios: faint white, a strong black at the halfway
  // point, a bright white at the end. Each period therefore closes on a hard
  // bright-to-dim edge, which is the lip of the flute.
  + `%3ClinearGradient id='r' x1='0' y1='0' x2='${vx.toFixed(4)}' y2='${vy.toFixed(4)}' spreadMethod='repeat'%3E`
  + `%3Cstop offset='0' stop-color='%23fff' stop-opacity='${light * 0.2}'/%3E`
  + `%3Cstop offset='0.49' stop-color='%23000' stop-opacity='${dark}'/%3E`
  + `%3Cstop offset='1' stop-color='%23fff' stop-opacity='${light}'/%3E`
  + `%3C/linearGradient%3E`
  // Clear the left, where every piece of text on this card lives.
  + `%3ClinearGradient id='gh' x1='0' y1='0' x2='1' y2='0'%3E`
  + `%3Cstop offset='0' stop-color='%23191919'/%3E`
  + `%3Cstop offset='0.30' stop-color='%238c8c8c'/%3E`
  + `%3Cstop offset='0.58' stop-color='%23fff'/%3E`
  + `%3C/linearGradient%3E`
  // Soften the top and bottom strips.
  + `%3ClinearGradient id='gv' x1='0' y1='0' x2='0' y2='1'%3E`
  + `%3Cstop offset='0' stop-color='%236b6b6b'/%3E`
  + `%3Cstop offset='0.26' stop-color='%23fff'/%3E`
  + `%3Cstop offset='0.74' stop-color='%23fff'/%3E`
  + `%3Cstop offset='1' stop-color='%23808080'/%3E`
  + `%3C/linearGradient%3E`
  // Nested, so the two multiply.
  + `%3Cmask id='mh'%3E%3Crect width='${W}' height='${H}' fill='url(%23gh)'/%3E%3C/mask%3E`
  + `%3Cmask id='mv'%3E%3Crect width='${W}' height='${H}' fill='url(%23gv)' mask='url(%23mh)'/%3E%3C/mask%3E`
  + `%3C/defs%3E`
  + `%3Crect width='${W}' height='${H}' fill='url(%23r)' mask='url(%23mv)'/%3E`
  + `%3C/svg%3E`

const file = 'src/index.css'
const css = readFileSync(file, 'utf8')
const re = /(\[data-design='fluted'\]\s*\{\s*--card-pattern:\s*)[\s\S]*?(\n  --card-pattern-size)/
if (!re.test(css)) {
  console.error(`fluted rule not found in ${file}`)
  process.exit(1)
}
writeFileSync(file, css.replace(re, (m, a, b) => `${a}url("${svg}");${b}`), 'utf8')

console.log(`fluted: light=${light} dark=${dark} ribs=${ribs} angle=${angle}`)
