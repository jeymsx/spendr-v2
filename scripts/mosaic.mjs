/**
 * Regenerate the `mosaic` card pattern in src/index.css.
 *
 *   node scripts/mosaic.mjs [fill] [stroke] [blur] [rx] [gap] [strokeWidth]
 *
 * The pattern is seventy rounded squares behind a radial mask - far too much
 * SVG to hand-edit inside a CSS data URI, and it took several passes to find
 * alphas that read on a mid-blue card without spending the white-text contrast
 * the note in index.css measures. This regenerates the whole declaration from
 * four numbers, so a pass costs one command instead of a careful edit.
 *
 * ── Two things this got wrong first, both worth keeping ──
 *
 * The `data:image/svg+xml,` prefix is part of what it writes. An earlier
 * hand-rolled replacement matched `[^"]*` inside `url("…")` and swallowed the
 * prefix along with the payload, which leaves a URL that is still syntactically
 * valid CSS and renders absolutely nothing - a card with no texture and no
 * error anywhere to explain it.
 *
 * And the anchor matches `\s*` rather than a literal newline: this file is
 * checked out CRLF on Windows, so a pattern written with `\n` matched nothing
 * and the script reported "rule not found" on a file that plainly had it.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [fill = 0.13, stroke = 0.22, blur = 0.5, rx = 3.0, gap = 1.0, sw = 0.35] =
  process.argv.slice(2).map(Number)

const W = 158, H = 100      // the card's own 1.586 ratio, so the tiles stay square
const TILE = 15.8
const GAP = gap             // the seam between panes

const rects = []
for (let y = 0; y < H; y += TILE) {
  for (let x = 0; x < W; x += TILE) {
    rects.push(
      `%3Crect x='${(x + GAP / 2).toFixed(2)}' y='${(y + GAP / 2).toFixed(2)}'`
      + ` width='${(TILE - GAP).toFixed(2)}' height='${(TILE - GAP).toFixed(2)}'`
      + ` rx='${rx.toFixed(2)}' fill='%23fff' fill-opacity='${fill}'`
      + ` stroke='%23fff' stroke-opacity='${stroke}' stroke-width='${sw}'/%3E`,
    )
  }
}

const svg =
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none'%3E`
  + `%3Cdefs%3E`
  + `%3Cfilter id='s' x='-8%25' y='-8%25' width='116%25' height='116%25'%3E`
  + `%3CfeGaussianBlur stdDeviation='${blur}'/%3E%3C/filter%3E`
  + `%3CradialGradient id='m' cx='0.76' cy='0.5' r='0.56'%3E`
  + `%3Cstop offset='0' stop-color='%23fff'/%3E`
  + `%3Cstop offset='0.5' stop-color='%23dcdcdc'/%3E`
  + `%3Cstop offset='0.82' stop-color='%23383838'/%3E`
  + `%3Cstop offset='1' stop-color='%23000'/%3E`
  + `%3C/radialGradient%3E`
  + `%3Cmask id='b'%3E%3Crect width='${W}' height='${H}' fill='url(%23m)'/%3E%3C/mask%3E`
  + `%3C/defs%3E`
  + `%3Cg mask='url(%23b)'%3E%3Cg filter='url(%23s)'%3E${rects.join('')}%3C/g%3E%3C/g%3E`
  + `%3C/svg%3E`

const file = 'src/index.css'
const css = readFileSync(file, 'utf8')
const re = /(\[data-design='mosaic'\]\s*\{\s*--card-pattern:\s*url\(")[\s\S]*?("\);)/
if (!re.test(css)) {
  console.error(`mosaic rule not found in ${file}`)
  process.exit(1)
}
writeFileSync(file, css.replace(re, (m, a, b) => a + svg + b), 'utf8')

console.log(`mosaic: ${rects.length} tiles  fill=${fill} stroke=${stroke} blur=${blur} rx=${rx} gap=${gap} sw=${sw}`)
