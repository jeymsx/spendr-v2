import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import { CardTexture } from './parts'
import { SPRING } from './theme'

/**
 * The story's cards, as a deck: the slide you are reading in front, and the
 * next two peeking out above it, narrower and dimmer the further back they
 * are - so the colour of what is coming is always in view.
 *
 * ── Moving through it ──
 *
 * Forward, the front card is thrown off to the left and the one behind it
 * comes forward to take its place, while a new card slides in at the back.
 * Back, the card you left comes in again from the left, over the deck. Which
 * way a card leaves or arrives is `dir`, handed to AnimatePresence as its
 * `custom`, because a card that is leaving can no longer be told anything
 * through its own props.
 *
 * ── Only the front card has a face ──
 *
 * The cards behind are plain colour. A slide's content mounts when its card
 * reaches the front, so its entrance plays when you can see it, and comes
 * out through a short blur. A card thrown off keeps its face as it goes, as
 * a real card would.
 *
 * The face is laid out at the card's full size from the start - the card
 * grows into place by transform, never by width - so nothing on it reflows
 * mid-move. It is a size container, so a slide can size its art in `cqw`
 * and `cqh`: shares of the card, whatever the phone.
 */

/** Cards drawn: the front one and two behind. */
const DEPTH = 3
/** How far each card behind shows above the one in front of it. */
const PEEK = 12
/** How much narrower, each side, each card behind is. */
const INSET = 14
/** How far each card behind has faded into the screen. */
const FADE = [0, 0.36, 0.6]
const RADIUS = 32

/** The room above the front card that the cards behind show in. */
export const DECK_TOP = PEEK * (DEPTH - 1)

/** Thrown, not slid: quick to leave, and accelerating away. */
const THROW = { type: 'spring', bounce: 0, visualDuration: 0.42 }

/**
 * @param {{ids: string[], tones: import('./theme').CardTone[], at: number, dir: number,
 *          width: number, height: number, screen: string, dark: boolean,
 *          face: (id: string, index: number) => import('react').ReactNode}} props
 *        tones: one per id. screen: the backdrop's base colour, which cards fade into.
 */
export default function Deck({ ids, tones, at, dir, width, height, screen, dark, face }) {
  const cardH = Math.max(0, height - DECK_TOP)
  /** Where a card `depth` places back sits. */
  const place = (/** @type {number} */ depth) => ({
    x: 0,
    y: -PEEK * depth,
    scale: width > 0 ? (width - INSET * 2 * depth) / width : 1,
    rotate: 0,
    opacity: 1,
  })
  const variants = {
    enter: (/** @type {number} */ d) => (d >= 0
      ? { ...place(DEPTH), opacity: 0 }
      : { x: '-112%', y: 0, scale: 1, rotate: -9, opacity: 0 }),
    exit: (/** @type {number} */ d) => (d >= 0
      ? { x: '-112%', rotate: -9, opacity: 0, zIndex: DEPTH + 1, transition: { default: THROW, opacity: { duration: 0.3, delay: 0.08 } } }
      : { ...place(DEPTH), opacity: 0, zIndex: 0, transition: SPRING }),
  }
  const shadow = dark
    ? '0 18px 44px -20px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.16)'
    : '0 18px 40px -22px rgba(15, 23, 42, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2)'

  return (
    <AnimatePresence initial={false} custom={dir}>
      {ids.slice(at, at + DEPTH).map((id, depth) => (
        <Card
          key={id}
          dir={dir}
          depth={depth}
          variants={variants}
          place={place(depth)}
          style={{
            top: DECK_TOP, width, height: cardH, borderRadius: RADIUS, transformOrigin: '50% 0%',
            background: tones[at + depth]?.background, boxShadow: shadow,
          }}
          screen={screen}
        >
          {face(id, at + depth)}
        </Card>
      ))}
    </AnimatePresence>
  )
}

/**
 * One card of the deck.
 *
 * A card on its way out - thrown off, or slipping to the back - is still in
 * the page until its exit finishes, and it keeps the props it last had,
 * front card included. So it asks whether it is still present, and once it
 * is not, it stops being the front card: hidden from a screen reader, which
 * would otherwise read two slides at once, closed to taps, which would
 * otherwise land on the buttons of a card already leaving, and no longer
 * marked `data-front-card`.
 *
 * @param {{dir: number, depth: number, variants: import('motion/react').Variants,
 *          place: Record<string, number>, style: import('react').CSSProperties, screen: string,
 *          children: import('react').ReactNode}} props
 */
function Card({ dir, depth, variants, place, style, screen, children }) {
  const present = useIsPresent()
  const front = depth === 0 && present
  return (
    <motion.div
      custom={dir}
      variants={variants}
      initial="enter"
      animate={{ ...place, zIndex: DEPTH - depth }}
      exit="exit"
      transition={{ default: SPRING, opacity: { duration: 0.25 } }}
      className="absolute left-0 overflow-hidden"
      style={{ ...style, pointerEvents: present ? undefined : 'none' }}
      data-front-card={front ? '' : undefined}
      aria-hidden={front ? undefined : true}
    >
      <CardTexture />
      <AnimatePresence>
        {depth === 0 && (
          <motion.div
            key="face"
            className="absolute inset-0"
            style={{ containerType: 'size' }}
            initial={{ opacity: 0, filter: 'blur(8px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
      {/* The fade into the screen, over the face too: a card leaving
          the front dims its face as it goes. */}
      <motion.span
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: screen }}
        initial={false}
        animate={{ opacity: FADE[depth] ?? 1 }}
        transition={{ duration: 0.3 }}
        aria-hidden="true"
      />
    </motion.div>
  )
}
