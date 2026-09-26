import { describe, it, expect } from 'vitest'
import { contrastRatio, parseHex } from '../../lib/color'
import { CARD_CONTRAST, TOP_LIGHT, recapPalette, rgbToHsl, tonesFor } from './theme'
import { seeded, seedOf } from './assets'

/**
 * The recap's colours, for every accent the app offers, in both themes.
 *
 * The recap puts white text on cards made from whatever accent was chosen,
 * and Honey - a pale yellow - is as hostile to white text as an accent gets.
 * These pin the promise theme.js makes: every card is dark enough for white,
 * and for the 90% white of secondary text, even under the card's light from
 * above; paper objects carry ink that reads on them; and the deck stays
 * inside the accent's family.
 */

const ACCENTS = {
  Azure: '#2D9DFF', Cosmos: '#845EF7', Blush: '#F06595', Sage: '#51CF66',
  Lagoon: '#20C997', Amber: '#FFB347', Ember: '#FF6B6B', Honey: '#FCC419',
}
const WHITE = [255, 255, 255]
/** Text at `alpha` over a background: what the eye actually gets. */
const over = (/** @type {number[]} */ fg, /** @type {number} */ alpha, /** @type {number[]} */ bg) =>
  fg.map((c, i) => c * alpha + bg[i] * (1 - alpha))
const rgb = (/** @type {string} */ hex) => /** @type {number[]} */ (parseHex(hex))

describe('the recap palette', () => {
  for (const [name, hex] of Object.entries(ACCENTS)) {
    for (const mode of /** @type {const} */ (['light', 'dark'])) {
      const pal = recapPalette(hex, mode)

      it(`${name}, ${mode}: white clears ${CARD_CONTRAST}:1 on every card, at both ends of its gradient`, () => {
        for (const tone of pal.tones) {
          expect(contrastRatio(WHITE, rgb(tone.light))).toBeGreaterThanOrEqual(CARD_CONTRAST)
          expect(contrastRatio(WHITE, rgb(tone.deep))).toBeGreaterThanOrEqual(CARD_CONTRAST)
        }
      })

      /* Where the words actually are: the top of the card, under its light. */
      it(`${name}, ${mode}: under the card's top light, white clears 5:1 and secondary text 4.5:1`, () => {
        const alpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(pal.muted)?.[1])
        for (const tone of pal.tones) {
          const lit = over(WHITE, TOP_LIGHT, rgb(tone.light))
          expect(contrastRatio(WHITE, lit)).toBeGreaterThanOrEqual(5)
          expect(contrastRatio(over(WHITE, alpha, lit), lit)).toBeGreaterThanOrEqual(4.5)
        }
      })

      it(`${name}, ${mode}: ink on paper reads`, () => {
        const paper = rgb(pal.paper)
        for (const ink of [pal.paperInk, pal.paperMuted, pal.paperGood, pal.paperSoft, pal.deepInk]) {
          expect(contrastRatio(rgb(ink), paper)).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  }

  it('keeps a blue deck blue - no card turns teal', () => {
    for (const tone of recapPalette(ACCENTS.Azure, 'dark').tones) {
      for (const stop of [tone.light, tone.deep]) {
        const [h] = rgbToHsl(rgb(stop))
        expect(h).toBeGreaterThanOrEqual(200)
        expect(h).toBeLessThanOrEqual(250)
      }
    }
  })

  it('keeps a gold deck gold - no card turns olive', () => {
    for (const tone of recapPalette(ACCENTS.Honey, 'dark').tones) {
      for (const stop of [tone.light, tone.deep]) {
        expect(rgbToHsl(rgb(stop))[0]).toBeLessThanOrEqual(41)
      }
    }
  })

  it('gives the six cards six different colours', () => {
    const tones = recapPalette(ACCENTS.Azure, 'light').tones
    expect(new Set(tones.map(t => t.background)).size).toBe(6)
  })

  it('draws the cards the same in either theme - only the screen behind them changes', () => {
    const light = recapPalette(ACCENTS.Blush, 'light'), dark = recapPalette(ACCENTS.Blush, 'dark')
    expect(light.tones).toEqual(dark.tones)
    expect(light.backdrop).not.toBe(dark.backdrop)
  })

  it('falls back to Azure for a colour it cannot read', () => {
    expect(recapPalette('not a colour', 'dark').tones).toEqual(recapPalette(ACCENTS.Azure, 'dark').tones)
  })
})

describe('which card each slide wears', () => {
  it('opens and closes on the first tone - the summary is the saved picture, which is always that one', () => {
    const tones = tonesFor(['intro', 'spent', 'kept', 'summary'])
    expect(tones[0]).toBe(0)
    expect(tones.at(-1)).toBe(0)
  })

  /* From three: a recap always has the intro, the summary and at least one
     slide between - a month is only offered when money came or went, and
     that is a "spent" or a "kept" slide. */
  it('never puts two of the same colour side by side, whichever slides a month has', () => {
    for (let n = 3; n <= 11; n++) {
      const tones = tonesFor(Array.from({ length: n }, (_, i) => `s${i}`))
      for (let i = 1; i < n; i++) expect(tones[i]).not.toBe(tones[i - 1])
    }
  })

  it('never shows the same colour twice among the three cards on screen at once', () => {
    const tones = tonesFor(Array.from({ length: 11 }, (_, i) => `s${i}`))
    for (let i = 0; i + 2 < tones.length; i++) expect(new Set(tones.slice(i, i + 3)).size).toBe(3)
  })
})

describe('the seeded scatter', () => {
  it('scatters a month the same way every time, and a different month differently', () => {
    const a = seeded(seedOf('2026-08')), b = seeded(seedOf('2026-08')), c = seeded(seedOf('2026-09'))
    const first = Array.from({ length: 5 }, a)
    expect(Array.from({ length: 5 }, b)).toEqual(first)
    expect(Array.from({ length: 5 }, c)).not.toEqual(first)
    for (const v of first) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
