import { AnimatePresence, motion } from 'motion/react'
import { GlassArt, GlassBadge } from '../../components/glass/GlassArt'
import { PreviewCard } from '../../components/CardStyle'
import RollingNumber from '../../components/ui/RollingNumber'
import { fmt } from '../../lib/money'
import { SPRING, EXIT } from '../recap/theme'

/**
 * The picture at the top of every step of setup.
 *
 * ── One set of objects, not a picture per screen ──
 *
 * A wallet, cards, coins, a bell, a phone - frosted glass over colour, from
 * components/glass. Each step says where every object stands (sceneFor, at
 * the foot of this file), and an object that is on stage in two steps in a
 * row MOVES from one place to the other on the app's zero-bounce spring
 * instead of being swapped for another drawing. The wallet that opens setup
 * shrinks into a corner while you type your name; the cards you pick fan out
 * one by one and are still there, closer together, while you give their
 * balances; the same cards come back at the end. What is new to a step
 * assembles - its layers slide into place, glass.js's own entrance - and what
 * a step no longer needs fades back out of focus.
 *
 * Idle, each object bobs a little and catches the light now and then, each
 * on its own beat, so the stage is never quite still. All of it stops for
 * reduced motion, where the objects are simply in their places.
 *
 * ── Units ──
 *
 * Places are in fractions of the stage's height, from its centre, so a scene
 * is the same composition on a 568px phone and on a desktop column. Sizes are
 * a constant size for each object, scaled down to the one the scene asks for:
 * an SVG drawn at its largest and scaled down stays crisp, and a size that
 * changed its layout box every step would re-lay the picture out mid-move.
 */

/** The tallest the stage grows; every object's drawn size is measured on it. */
export const STAGE_MAX = 400

/**
 * @typedef {object} Actor
 * @property {string} key       the object's name across steps
 * @property {'glass'|'badge'|'card'|'hello'|'total'|'notice'|'more'} kind
 * @property {number} x         centre, in stage heights from the middle
 * @property {number} y
 * @property {number} [size]    width, in stage heights - for pictures and cards
 * @property {number} [px]      width in pixels, unscaled - for anything with words
 *                              in it, which should read at the same size on a
 *                              short stage as on a tall one
 * @property {number} [r]       degrees
 * @property {number} [z]
 * @property {number} [beat]    seconds into the idle bob, so no two bob as one
 * @property {string} [art]     a glass picture's name, or a badge's glyph
 * @property {Record<string, any>} [account]
 * @property {string} [text]
 * @property {number} [amount]
 * @property {string} [currency]
 * @property {string} [time]
 */

/** The width each scaled object is drawn at, in stage heights - its largest
 *  anywhere. A card face stops growing at 300px (PreviewCard's own cap). */
const BASE = { glass: 0.74, badge: 0.46, card: 300 / STAGE_MAX, more: 0.3 }

/**
 * @param {{actors: Actor[], height: number, hue: string, reduce: boolean}} props
 */
export default function Stage({ actors, height, hue, reduce }) {
  return (
    <motion.div
      aria-hidden="true"
      className="relative shrink-0 w-full pointer-events-none select-none"
      initial={false}
      animate={{ height }}
      transition={reduce ? { duration: 0 } : SPRING}
    >
      <AnimatePresence>
        {actors.map(a => <Piece key={a.key} a={a} u={height} hue={hue} reduce={reduce} />)}
      </AnimatePresence>
    </motion.div>
  )
}

/** @param {{a: Actor, u: number, hue: string, reduce: boolean}} props */
function Piece({ a, u, hue, reduce }) {
  const fixed = a.px != null
  const drawn = fixed ? /** @type {number} */ (a.px) : (BASE[/** @type {keyof typeof BASE} */ (a.kind)] ?? 0.7) * STAGE_MAX
  const scale = fixed ? 1 : ((a.size ?? 0.5) * u) / drawn
  const place = { x: a.x * u, y: a.y * u, rotate: a.r ?? 0, scale, opacity: 1 }
  return (
    /* Zero tall, on the stage's centre line: the face inside is lifted by
       half its own height, so this box's centre - where scale and rotation
       pivot - is the face's centre too. */
    <motion.div
      className="absolute left-1/2 top-1/2 h-0"
      /* Its own layer: a picture full of SVG filters, scaled on every frame
         of a move, would otherwise be drawn again at each new size. */
      style={{ width: drawn, marginLeft: -drawn / 2, zIndex: a.z ?? 1, willChange: 'transform' }}
      initial={reduce
        ? { ...place, opacity: 0 }
        : { ...place, y: place.y + 0.1 * u, rotate: place.rotate - 8, scale: scale * 0.72, opacity: 0 }}
      animate={place}
      exit={reduce
        ? { opacity: 0, transition: { duration: 0.15 } }
        : { opacity: 0, scale: scale * 0.82, y: place.y - 0.04 * u, transition: EXIT }}
      transition={reduce ? { duration: 0.2 } : SPRING}
    >
      <div className="-translate-y-1/2">
        <Face a={a} drawn={drawn} hue={hue} reduce={reduce} />
      </div>
    </motion.div>
  )
}

/** @param {{a: Actor, drawn: number, hue: string, reduce: boolean}} props */
function Face({ a, drawn, hue, reduce }) {
  const idle = /** @type {import('react').CSSProperties} */ ({ '--gx-float-delay': `${-(a.beat ?? 0)}s`, '--gx-shine-delay': `${1.2 + (a.beat ?? 0)}s` })
  switch (a.kind) {
    case 'glass':
      return <GlassArt name={a.art ?? 'wallet'} hue={hue} size={drawn} animate={!reduce} float={!reduce} style={idle} />
    case 'badge':
      return <GlassBadge glyph={a.art ?? 'check'} hue={hue} shape="circle" size={drawn} animate={!reduce} float={!reduce} style={idle} />
    case 'card':
      /* The real card face, the one Accounts will show for it. */
      return <PreviewCard draft={a.account ?? {}} />
    case 'hello':
      return (
        <div className="onb-glass rounded-[30px] px-7 py-6 text-left">
          <p className="text-15 font-medium text-white/65">Hi,</p>
          <p className="text-32 font-semibold tracking-tight text-white truncate leading-tight">{a.text || 'there'}</p>
        </div>
      )
    case 'total':
      return (
        <div className="onb-glass rounded-full px-5 py-2.5 flex items-baseline justify-center gap-2 whitespace-nowrap">
          <span className="text-12 font-medium text-white/60">In total</span>
          <RollingNumber
            id="onboarding-total"
            value={a.amount ?? 0}
            format={v => fmt(v, a.currency)}
            className="text-18 font-semibold tabular-nums text-white"
          />
        </div>
      )
    case 'notice':
      /* A notification, the way a phone draws one, saying what the daily
         check-in will say. */
      return (
        <div className="onb-glass rounded-[24px] px-4 py-3.5 flex items-start gap-3 text-left">
          <img src="/apple-touch-icon.png" alt="" width={40} height={40} className="w-10 h-10 rounded-[11px] shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="text-12 font-semibold text-white/60">Spendr</span>
              <span className="text-12 text-white/50">{a.time}</span>
            </span>
            <span className="block text-15 font-semibold text-white leading-snug mt-0.5">Anything to log today?</span>
            <span className="block text-13 text-white/70 leading-snug">Tap to add what you spent.</span>
          </span>
        </div>
      )
    case 'more':
      return (
        <div className="onb-glass rounded-full w-full aspect-square flex items-center justify-center">
          <span className="text-22 font-semibold text-white">+{a.text}</span>
        </div>
      )
    default:
      return null
  }
}

// ── The scenes ───────────────────────────────────────────────────────────────

/** @param {string} key @param {string} art @param {number} x @param {number} y @param {number} size @param {number} [r] @param {number} [z] @param {number} [beat] @returns {Actor} */
const glass = (key, art, x, y, size, r = 0, z = 1, beat = 0) => ({ key, kind: 'glass', art, x, y, size, r, z, beat })

/**
 * The picked accounts as a hand of cards: fanned from the middle, the newest
 * on top. More than five and the fifth place says how many more.
 *
 * @param {Array<Record<string, any>>} accounts
 * @param {{y: number, spread: number, tilt: number, size: number, wide: number, currency: string}} o
 * @returns {Actor[]}
 */
function hand(accounts, { y, spread, tilt, size, wide, currency }) {
  const shown = accounts.length > 5 ? accounts.slice(0, 4) : accounts
  const extra = accounts.length - shown.length
  const n = shown.length + (extra ? 1 : 0)
  /* Narrower than the fan on a tall stage and a thin phone: the whole hand
     shrinks to fit rather than running off both edges. */
  const k = Math.min(1, (0.88 * wide) / (size + (n - 1) * spread))
  size *= k
  spread *= k
  /** @type {Actor[]} */
  const out = shown.map((account, i) => {
    const off = i - (n - 1) / 2
    return {
      key: `card:${account.name}`, kind: 'card', account: { ...account, currency },
      x: off * spread, y: y + off * off * 0.012, size, r: off * tilt, z: 10 + i,
    }
  })
  if (extra) {
    const off = (n - 1) / 2
    out.push({ key: 'card:more', kind: 'more', text: String(extra), x: off * spread + 0.1, y: y + 0.05, size: 0.26, z: 20 })
  }
  return out
}

/**
 * Where everything stands on a step.
 *
 * @param {import('./flow').StepId} step
 * @param {{accounts: Array<Record<string, any>>, name: string, total: number, currency: string, signedIn: boolean,
 *          time: string, keyboard: boolean, wide: number, width: number, push: string}} s
 *   `wide` is the stage's width in stage heights, `width` the same in pixels
 * @returns {Actor[]}
 */
export function sceneFor(step, s) {
  return fit(compose(step, s), s.wide)
}

/**
 * Pull a scene in from the edges when the stage is narrower than it is tall
 * - a tall stage on a thin phone - so nothing is cut off at the sides. Words
 * keep their size; pictures and cards come closer and a little smaller.
 *
 * @param {Actor[]} actors
 * @param {number} wide   the stage's width, in stage heights
 */
function fit(actors, wide) {
  /* A glass picture draws in the middle three quarters of its box. */
  const half = (/** @type {Actor} */ a) => (a.size ?? 0) * (a.kind === 'glass' || a.kind === 'badge' ? 0.38 : 0.5)
  const reach = Math.max(0, ...actors.filter(a => a.px == null).map(a => Math.abs(a.x) + half(a)))
  const f = reach ? Math.min(1, (wide / 2 - 0.03) / reach) : 1
  if (f >= 1) return actors
  return actors.map(a => (a.px != null ? a : { ...a, x: a.x * f, size: (a.size ?? 0) * f }))
}

/**
 * @param {import('./flow').StepId} step
 * @param {Parameters<typeof sceneFor>[1]} s
 * @returns {Actor[]}
 */
function compose(step, s) {
  const fan = (/** @type {{y: number, spread: number, tilt: number, size: number}} */ o) =>
    hand(s.accounts, { ...o, wide: s.wide, currency: s.currency })
  switch (step) {
    case 'welcome':
      return [
        glass('card', 'card', -0.31, -0.11, 0.44, -12, 1, 0.3),
        glass('wallet', 'wallet', 0.03, 0.05, 0.62, -3, 3, 0),
        glass('coins', 'coins', 0.34, 0.23, 0.34, 7, 4, 0.9),
        glass('chart', 'chartUp', 0.31, -0.25, 0.3, 6, 2, 1.6),
        glass('sparkles', 'sparkles', -0.34, 0.27, 0.22, 0, 5, 0.6),
      ]
    case 'installFirst':
    case 'openInBrowser':
    case 'install':
      return [
        glass('phone', 'phone', 0, 0.02, 0.7, 0, 3, 0),
        glass('sparkles', 'sparkles', 0.3, -0.27, 0.2, 0, 4, 0.6),
        glass('star', 'star', -0.32, 0.26, 0.17, -8, 4, 1.1),
      ]
    case 'name':
      return [
        glass('wallet', 'wallet', -0.22, -0.16, 0.5, -10, 1, 0),
        glass('coins', 'coins', 0.3, 0.22, 0.32, 8, 1, 0.9),
        { key: 'hello', kind: 'hello', text: s.name.trim(), x: 0.02, y: 0.04, px: Math.min(280, s.width - 56), r: -2, z: 3 },
        glass('sparkles', 'sparkles', 0.4, -0.3, 0.2, 0, 4, 0.6),
      ]
    case 'currency':
      return [
        glass('coins', 'coins', 0, 0.04, 0.52, 0, 3, 0),
        glass('coin', 'coin', -0.31, -0.17, 0.28, -10, 2, 0.8),
        glass('cash', 'cash', 0.31, 0.2, 0.3, 8, 4, 1.4),
      ]
    case 'accounts':
      return [
        glass('sparkles', 'sparkles', 0.44, -0.33, 0.16, 0, 30, 0.6),
        ...fan({ y: 0.02, spread: 0.15, tilt: 6, size: 0.9 }),
      ]
    case 'balances':
      return [
        ...fan({ y: -0.13, spread: 0.07, tilt: 3, size: 0.74 }),
        { key: 'total', kind: 'total', amount: s.total, currency: s.currency, x: 0, y: 0.33, px: 236, z: 30 },
      ]
    case 'stayOnTrack':
      /* Signed in but with no way to show a notice here yet: what there is
         to show is the backup, so the shield stays and takes a tick. */
      if (s.signedIn && s.push !== 'ok') {
        return [
          glass('shield', 'shield', 0, 0.02, 0.56, -4, 2, 0),
          { key: 'check', kind: 'badge', art: 'check', x: 0.22, y: 0.2, size: 0.26, z: 3, beat: 0.8 },
          glass('sparkles', 'sparkles', 0.34, -0.28, 0.16, 0, 4, 0.6),
        ]
      }
      return s.signedIn
        ? [
            glass('bell', 'bell', -0.3, 0.2, 0.36, -10, 1, 0),
            { key: 'notice', kind: 'notice', time: s.time, x: 0.02, y: -0.06, px: Math.min(300, s.width - 40), r: 0, z: 3 },
            glass('sparkles', 'sparkles', 0.4, 0.3, 0.16, 0, 4, 0.6),
          ]
        : [
            glass('shield', 'shield', -0.17, 0.03, 0.5, -6, 2, 0),
            glass('bell', 'bell', 0.22, 0.08, 0.42, 8, 3, 0.9),
            glass('sparkles', 'sparkles', 0.36, -0.3, 0.16, 0, 4, 0.6),
          ]
    case 'done':
      return [
        ...fan({ y: -0.1, spread: 0.12, tilt: 5, size: 0.72 }),
        { key: 'check', kind: 'badge', art: 'check', x: 0, y: 0.24, size: 0.42, z: 40, beat: 0 },
        glass('sparkles', 'sparkles', 0.38, -0.32, 0.2, 0, 41, 0.6),
        glass('star', 'star', -0.4, 0.3, 0.17, -8, 41, 1.1),
      ]
    default:
      return []
  }
}
