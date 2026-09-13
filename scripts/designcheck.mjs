/**
 * Reports UI written by hand where a primitive already exists.
 *
 * ── Why this is a checker and not a style guide ──
 *
 * Every consistency pass in this repo so far has been archaeology: count the
 * recipes, pick the one that wins, rewrite the other fifty-four. 89 buttons in
 * 55 recipes. 43 icon buttons, ten with no accessible name. 28 hand-rolled
 * sheets. 65 captions in 19 recipes. 46 hairlines in 16.
 *
 * None of that was anyone being careless. It is what happens when the only
 * thing standing between a new screen and the fifty-fifth recipe is whether
 * someone remembers. Cleanup without a ratchet is a treadmill, so these are
 * the five rules that turn "we agreed on this" into a build failure.
 *
 * ── Escape hatch ──
 *
 * A deviation is sometimes right. Put `design-ok: <reason>` in a comment on
 * the offending line or within the eight lines above it, and the rule steps
 * aside - with the reason recorded next to the code rather than in someone's
 * memory. A rule with no escape gets deleted the first time it is wrong; a
 * rule whose exceptions are all written down stays.
 *
 * Waived today, and every one of them is genuinely not a sheet: the confetti
 * layer (decoration, pointer-events-none), the quick-log overlay (positioned
 * against the visual viewport, which Sheet does not do), the QR lightbox (no
 * panel - a tap anywhere closes it), the badge card (centred, and Sheet docks
 * to the bottom) and Onboarding's two dialogs (Sheet's panel is theme-aware
 * and that screen is dark whatever the theme, so a Sheet there would be white
 * on black in light mode).
 *
 * ── It gates ──
 *
 * This ran as `npm run design` on its own for a while, deliberately, because
 * 18 real problems remained and a check that fails on a clean tree gets
 * switched off rather than fixed.
 *
 * Fifteen of them were one missing idea: #0d1117, #111820 and #1a2130 are the
 * page ground, the panel and the lifted surface, and none of them had a name -
 * so every call site spelled a light/dark pair by hand. They are `bg-page`,
 * `bg-panel` and `bg-lifted` now, defined in index.css. Of the other three,
 * WhatsNewModal really was a twenty-ninth hand-rolled sheet and became one;
 * the two Onboarding dialogs are waived above.
 *
 * It is in CHECKERS in check.mjs now, so `npm run check` fails on new drift.
 *
 *   npm run design
 *   node scripts/designcheck.mjs src/pages/Foo.jsx
 */
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const traverse = _traverse.default ?? _traverse

/* Takes file paths, the way the other checkers do so check.mjs can pass its
   one collected list - and collects src/** itself when run bare, so
   `npm run design` needs no shell glob (cmd.exe has no $(...), and a glob
   blows the Windows command-line length limit once src grows). */
function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collect(full, out)
    else if (/\.jsx$/.test(name)) out.push(full)
  }
  return out
}

const HERE = dirname(fileURLToPath(import.meta.url))
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : collect(join(HERE, '..', 'src'))
let problems = 0

/** The primitives themselves are allowed to spell things out - they are where
 *  the spelling lives. Same for the desktop layer, which has its own idiom,
 *  and for tests, which assert on raw markup on purpose. */
const EXEMPT_PATH = /[\\/]components[\\/]ui[\\/]|(?:^|[\\/])src[\\/]web[\\/]|\.test\.jsx?$/

const norm = (p) => p.replace(/\\/g, '/')

function report(file, line, rule, msg) {
  problems++
  console.log(`DESIGN ${norm(file)}:${line}  [${rule}] ${msg}`)
}

/** Every className string this element carries, flattened. */
function classNamesOf(node) {
  const out = []
  for (const attr of node.attributes ?? []) {
    if (attr.type !== 'JSXAttribute' || attr.name?.name !== 'className') continue
    const v = attr.value
    if (!v) continue
    if (v.type === 'StringLiteral') out.push(v.value)
    else if (v.type === 'JSXExpressionContainer') {
      // Template literals, arrays joined, cx(...) - collect every string in
      // there rather than trying to evaluate it.
      walkStrings(v.expression, out)
    }
  }
  return out
}

function walkStrings(node, out) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'StringLiteral') { out.push(node.value); return }
  if (node.type === 'TemplateLiteral') {
    for (const q of node.quasis) out.push(q.value.cooked ?? '')
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    const v = node[key]
    if (Array.isArray(v)) v.forEach(n => walkStrings(n, out))
    else if (v && typeof v === 'object' && v.type) walkStrings(v, out)
  }
}

function hasAttr(node, name) {
  return (node.attributes ?? []).some(
    a => a.type === 'JSXAttribute' && a.name?.name === name,
  )
}

/** Any descendant that could render words: literal text, or an expression
 *  that is not an icon component. An expression is assumed to be text unless
 *  it is plainly a glyph, because the cost of missing a real unlabelled
 *  button is higher than the cost of letting one through. */
function hasTextInside(el) {
  for (const c of el.children ?? []) {
    if (c.type === 'JSXText' && c.value.trim()) return true
    if (c.type === 'JSXExpressionContainer') {
      const e = c.expression
      if (e.type === 'JSXEmptyExpression') continue
      // `{icon}` / `{o.icon}` / `{<IconX />}` are glyphs, not words.
      const named = e.type === 'Identifier' ? e.name
        : e.type === 'MemberExpression' ? (e.property?.name ?? '')
        : ''
      if (/^(icon|glyph|mark)$/i.test(named)) continue
      if (e.type === 'JSXElement') continue
      return true
    }
    if (c.type === 'JSXElement') {
      const t = tagNameOf(c.openingElement)
      if (t === 'svg' || /^Icon/.test(t)) continue
      if (hasTextInside(c)) return true
    }
  }
  return false
}

/** Any descendant that is a glyph. */
function hasGlyphInside(el) {
  for (const c of el.children ?? []) {
    if (c.type !== 'JSXElement') continue
    const t = tagNameOf(c.openingElement)
    if (t === 'svg' || /^Icon/.test(t)) return true
    if (hasGlyphInside(c)) return true
  }
  return false
}

function tagNameOf(node) {
  const n = node.name
  if (!n) return ''
  if (n.type === 'JSXIdentifier') return n.name
  if (n.type === 'JSXMemberExpression') return n.property?.name ?? ''
  return ''
}

for (const file of files) {
  if (EXEMPT_PATH.test(file)) continue
  if (!/\.jsx$/.test(file)) continue

  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')

  /**
   * `design-ok:` on this line, or anywhere in the comment block directly
   * above it, waives every rule here.
   *
   * The block matters: a waiver worth writing is a sentence or two, and the
   * reason usually reads better before the marker than after. Scanning only
   * one line up meant a three-line explanation silently failed to waive
   * anything, which is the worst of both - the note is there and the rule
   * still fires.
   */
  const waived = (line) => {
    // Eight lines, not one. A waiver worth writing is a sentence or two, and
    // the marker reads best at the start of it - so a three-line explanation
    // put `design-ok:` three lines above the code it waives. Matching only
    // the line above gave the worst of both: the note is there, written and
    // committed, and the rule fires anyway.
    for (let i = line - 1; i >= 0 && i > line - 9; i--) {
      if (/design-ok:/.test(lines[i] ?? '')) return true
    }
    return false
  }

  let ast
  try {
    ast = parse(src, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
    })
  } catch (e) {
    problems++
    console.log(`PARSE  ${norm(file)}  ${e.message}`)
    continue
  }

  traverse(ast, {
    JSXOpeningElement(path) {
      const node = path.node
      const tag = tagNameOf(node)
      const line = node.loc?.start.line ?? 0
      if (waived(line)) return
      const classes = classNamesOf(node).join(' ')

      // ── 1. A new bottom sheet, written by hand ──────────────────────────
      // 28 of these were migrated onto <Sheet>. A fresh `fixed inset-0` with
      // a z-index is the twenty-ninth starting.
      if (/\bfixed\b/.test(classes) && /\binset-0\b/.test(classes) && /\bz-\[?\d/.test(classes)) {
        report(file, line, 'overlay',
          'hand-rolled full-screen overlay - use <Sheet>, or waive with a reason')
      }

      // ── 2. A hairline, written by hand ──────────────────────────────────
      if (/\bh-px\b/.test(classes) && /\bbg-/.test(classes)) {
        report(file, line, 'divider', 'hand-rolled hairline - use <Divider>')
      }

      // ── 3. A colour that will not follow the accent preset ──────────────
      // Only arbitrary Tailwind values: `bg-[#0d1117]`. An inline style fed
      // from data - a category's colour, a brand gradient - is data, not a
      // design decision, and is left alone.
      const hex = classes.match(/\b(?:bg|text|border|from|to|via|ring|shadow|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g)
      if (hex) {
        report(file, line, 'raw-colour',
          `${hex[0]} - a literal colour cannot follow the accent preset or the theme`)
      }

      // ── 4. An icon-only control with no name ────────────────────────────
      // Ten of 43 icon buttons announced themselves as "button" and stopped.
      // <IconButton> made the name required; this catches the raw ones.
      if (tag === 'button' && !hasAttr(node, 'aria-label') && !hasAttr(node, 'aria-labelledby') && !hasAttr(node, 'title')) {
        // Descendants, not just direct children. The first version of this
        // rule looked one level down and so read `<button><svg/><span>Add a
        // photo</span></button>` as icon-only - four false positives out of
        // eight, which is how a rule gets deleted. A button is icon-only when
        // NOTHING inside it can produce text.
        if (hasGlyphInside(path.parent) && !hasTextInside(path.parent)) {
          report(file, line, 'unlabelled',
            'icon-only <button> with no accessible name - use <IconButton>, whose label is required')
        }
      }

      // ── 5. A font size invented at the call site ────────────────────────
      // 31 distinct `text-[Npx]` values across 434 call sites, alongside 437
      // uses of Tailwind's own scale - because whenever a size fell between
      // two named steps, someone typed the number. The in-between steps are
      // named in tailwind.config.js now (text-10 through text-38) and the set
      // is closed; this is what keeps it closed.
      //
      // An emoji is exempt. `text-[18px]` on an aria-hidden span sizes a
      // glyph inside a fixed box, which is not a type-scale decision and has
      // no business in a type scale. So is the accent preview, which is a
      // scale model of the whole app at 7px and would otherwise drag four
      // sub-10px sizes into the scale.
      const px = classes.match(/\btext-\[[0-9.]+px\]/)
      if (px && !hasAttr(node, 'aria-hidden') && !/SettingsAccent/.test(file)) {
        report(file, line, 'type-scale',
          `${px[0]} - the scale is closed; use a named step (text-10 … text-38) or aria-hidden it if it sizes a glyph`)
      }

      // ── 6. Inline geometry on a Sheet ───────────────────────────────────
      // index.css restyles .sheet-panel into a centred desktop modal at
      // specificity (0,2,1); an inline style beats any stylesheet. This broke
      // the entire desktop UI once.
      if (tag === 'Sheet' && hasAttr(node, 'style')) {
        report(file, line, 'sheet-style',
          'inline style on <Sheet> - it beats the desktop stylesheet; use the maxHeight prop or a class')
      }
    },
  })
}

if (problems) {
  console.log(`\n${problems} problem(s) across ${files.length} files`)
  process.exit(1)
} else {
  console.log(`OK - no hand-rolled UI where a primitive exists, across ${files.length} files`)
}
