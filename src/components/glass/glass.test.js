import { describe, it, expect } from 'vitest'
import { glassBadgeSvg, glassSvg } from './glass'

/**
 * The size a glass picture claims. On the page it is 128 and CSS sizes it;
 * on a canvas it has to be the size it is drawn at, or WebKit renders its
 * filters soft and cuts the shadow off in a box (see loadGlass in
 * pages/recap/canvasKit.js). Same drawing either way - only the claim moves.
 */
describe('the size a glass picture claims', () => {
  it('is 128 unless something asks for more', () => {
    expect(glassSvg('piggy')).toContain('viewBox="0 0 128 128" width="128" height="128"')
    expect(glassBadgeSvg({ glyph: 'check', hue: '#F06595' })).toContain('width="128" height="128"')
  })

  it('is what a canvas asks for, over the same drawing', () => {
    const at640 = glassBadgeSvg({ glyph: 'check', hue: '#F06595', size: 640 })
    expect(at640).toContain('viewBox="0 0 128 128" width="640" height="640"')
    expect(at640.replace('width="640" height="640"', 'width="128" height="128"'))
      .toBe(glassBadgeSvg({ glyph: 'check', hue: '#F06595' }))
    expect(glassSvg('piggy', { size: 192.4 })).toContain('width="192" height="192"')
  })
})
