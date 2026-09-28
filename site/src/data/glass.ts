/**
 * The app's glass illustrations, as SVG strings built at build time by the
 * app's own drawing code (src/components/glass/glass.js).
 *
 * Inline pictures share one document, and two with the same ids would draw
 * each other's gradients, so every call gets its own prefix.
 */
// @ts-ignore - the app's module is JS with JSDoc
import { glassSvg, glassBadgeSvg, svgUrl } from '../../../src/components/glass/glass.js'

let n = 0
const nextId = (p: string) => `${p}${(++n).toString(36)}`

/** One of the app's pictures: gift, wallet, card, calendar, piggy, chartUp, … */
export function picture(name: string, hue?: string): string {
  return glassSvg(name, { hue, id: nextId('sg') })
}

/** An achievement's medallion. */
export function medallion(o: { glyph: string; hue: string; shape?: 'hex' | 'circle' | 'shield'; level?: string; locked?: boolean }): string {
  return glassBadgeSvg({ ...o, id: nextId('sb') })
}

/** The same, as a data: URL for an <img> that never animates. */
export function pictureUrl(name: string, hue?: string): string {
  return svgUrl(glassSvg(name, { hue, id: 'g' }))
}
