import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { HELP_SHOTS, DARK_ONLY_SHOTS } from '../../lib/help.js'

/**
 * An article names its picture (lib/help.js HELP_SHOTS); the app finds it by
 * a list spelled out in helpShots.js, because a glob has to be a literal; and
 * the file itself is the website's capture. Three places that have to agree,
 * or an answer shows a hole where its picture should be.
 */

const screens = new URL('../../../site/src/assets/screens/', import.meta.url)
const source = readFileSync(new URL('./helpShots.js', import.meta.url), 'utf8')
const listed = (source.match(/screens\/\{([^}]+)\}-\{light,dark\}/)?.[1] ?? '').split(',')

describe('the help screenshots', () => {
  it('has a capture for every one an article may show, in both themes unless it is dark only', () => {
    for (const name of HELP_SHOTS) {
      expect(existsSync(new URL(`${name}-dark.webp`, screens)), `${name}-dark`).toBe(true)
      if (!DARK_ONLY_SHOTS.has(name)) expect(existsSync(new URL(`${name}-light.webp`, screens)), `${name}-light`).toBe(true)
    }
  })

  it('pulls in exactly the ones an article may show', () => {
    expect([...listed].sort()).toEqual([...HELP_SHOTS].sort())
  })
})
