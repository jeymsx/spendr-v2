import { motion } from 'motion/react'
import { LOGO, artUrl } from './assets'
import { useSlide } from './parts'
import { SPRING } from './theme'

/**
 * The recap's decoration: the glass illustrations, the Spendr mark, and the
 * light and rays that sit behind a centrepiece. Everything here is
 * aria-hidden and ignores the pointer - a slide says in words whatever its
 * pictures show, and a tap on a picture is a tap on the slide.
 *
 * Sizes are CSS lengths, usually in container units: a card is a size
 * container (Deck), so `min(40cqw, 30cqh)` is the same share of the card on
 * a 360px phone and a 440px one, and shrinks on a short one instead of
 * pushing the words off the card.
 */

/** @typedef {import('react').CSSProperties} CSSProperties */

/**
 * A glass illustration: pops in on the shared spring, then bobs gently for as
 * long as it is on screen. `shadow` puts a soft shadow on the card under it
 * that shrinks as it rises, which is what makes it read as floating rather
 * than pasted on.
 *
 * @param {{name: string, size: number|string, className?: string, style?: CSSProperties,
 *          delay?: number, rotate?: number, float?: boolean, shadow?: boolean}} props
 */
export function Art({ name, size, className = '', style = undefined, delay = 0, rotate = 0, float = true, shadow = false }) {
  const { pal } = useSlide()
  const src = artUrl(name, pal.accent)
  return (
    <motion.span
      aria-hidden="true"
      className={`absolute pointer-events-none select-none ${className}`}
      style={{ width: size, height: size, ...style }}
      initial={{ opacity: 0, scale: 0.4, rotate: rotate - 18 }}
      animate={{ opacity: 1, scale: 1, rotate }}
      transition={{ ...SPRING, delay }}
    >
      {shadow && (
        <span
          className="recap-shadow absolute left-[20%] right-[20%] -bottom-[8%] h-[12%] rounded-[50%]"
          style={{ background: 'radial-gradient(closest-side, rgba(0, 0, 0, 0.38), rgba(0, 0, 0, 0))' }}
        />
      )}
      {/* Each illustration bobs out of step with the others: the delay that
          staggers its entrance also offsets its place in the loop. */}
      <span className={`block w-full h-full ${float ? 'recap-float' : ''}`} style={float ? { animationDelay: `${-Math.round(delay * 1400)}ms` } : undefined}>
        <img
          src={src}
          alt=""
          width={256}
          height={256}
          draggable={false}
          decoding="async"
          className="block w-full h-full object-contain"
        />
      </span>
    </motion.span>
  )
}

/**
 * Light behind a centrepiece: a soft disc of the accent at its lightest.
 *
 * @param {{color: string, size: number|string, className?: string, style?: CSSProperties}} props
 */
export function Glow({ color, size, className = '', style = undefined }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute rounded-full pointer-events-none ${className}`}
      style={{ width: size, height: size, background: `radial-gradient(closest-side, ${color}99, ${color}00)`, ...style }}
    />
  )
}

/**
 * Sunburst rays, turning slowly behind whatever sits on top of them.
 *
 * @param {{size: number|string, className?: string, style?: CSSProperties}} props
 */
export function Rays({ size, className = '', style = undefined }) {
  return (
    <motion.span
      aria-hidden="true"
      className={`absolute pointer-events-none ${className}`}
      style={{ width: size, height: size, ...style }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...SPRING, delay: 0.1 }}
    >
      <span className="recap-rays recap-spin block w-full h-full" />
    </motion.span>
  )
}

/**
 * The Spendr mark on a paper tile, for a coloured surface - the blue mark
 * straight on an Ember or Honey card would be the one thing on it in a
 * colour nobody chose. Straight on the page, the mark needs no tile: use
 * <Logo>.
 *
 * @param {{size?: number, className?: string}} props
 */
export function LogoChip({ size = 32, className = '' }) {
  const inner = Math.round(size * 0.8)
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center shrink-0 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.16)] ${className}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <img src={LOGO} alt="" width={inner} height={inner} draggable={false} style={{ width: inner, height: inner }} />
    </span>
  )
}

/** The bare Spendr mark. @param {{size?: number, className?: string}} props */
export function Logo({ size = 28, className = '' }) {
  return (
    <img
      src={LOGO}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
