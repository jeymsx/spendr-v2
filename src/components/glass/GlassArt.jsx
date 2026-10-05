import { useId, useMemo } from 'react'
import { glassBadgeSvg, glassSvg, svgUrl } from './glass'
import { useIsDark } from '../../context/ThemeContext'

/**
 * A glass picture on the page.
 *
 * Still, it is an <img> of the SVG: the browser draws it once and keeps the
 * pixels, so a grid of thirty is thirty bitmaps rather than thirty live
 * filter graphs to repaint on every scroll.
 *
 * Animated, it is inline, so its layers can move on their own - the solid set
 * back sliding in, the pane settling over it, the mark arriving last - with
 * the classes glass.js puts on each layer and the keyframes in index.css.
 * Inline pictures share one document, so each gets its own id prefix.
 *
 * The soft shadow under each picture is drawn in dark mode only. On a light
 * page it read as a smudge under every medallion and illustration, the same
 * grey lift the cards dropped there. (Share pictures drawn to a canvas build
 * their SVG directly and keep it.)
 *
 * @param {{name: string, hue?: string, size?: number, animate?: boolean, float?: boolean,
 *          locked?: boolean, className?: string, style?: import('react').CSSProperties}} props
 */
export function GlassArt({ name, hue, size = 96, animate = false, float = false, locked = false, className = '', style }) {
  const rid = useId().replace(/[^a-z0-9]/gi, '')
  const live = animate || float
  const shadow = useIsDark()
  const svg = useMemo(
    () => glassSvg(name, { hue, locked, shadow, id: live ? `ga${rid}` : 'ga' }),
    [name, hue, locked, shadow, live, rid],
  )
  return <Picture svg={svg} size={size} live={live} animate={animate} float={float} className={className} style={style} />
}

/**
 * An achievement's medallion: a badge's hexagon, a milestone's disc with its
 * level, a challenge's shield.
 *
 * @param {{glyph: string, hue: string, shape?: 'hex'|'circle'|'shield', level?: string, size?: number,
 *          locked?: boolean, animate?: boolean, float?: boolean, className?: string,
 *          style?: import('react').CSSProperties}} props
 */
export function GlassBadge({ glyph, hue, shape = 'hex', level, size = 72, locked = false, animate = false, float = false, className = '', style }) {
  const rid = useId().replace(/[^a-z0-9]/gi, '')
  const live = animate || float
  const shadow = useIsDark()
  const svg = useMemo(
    () => glassBadgeSvg({ glyph, hue, shape, level, locked, shadow, id: live ? `gb${rid}` : 'gb' }),
    [glyph, hue, shape, level, locked, shadow, live, rid],
  )
  return <Picture svg={svg} size={size} live={live} animate={animate} float={float} className={className} style={style} />
}

/** @param {{svg: string, size: number, live: boolean, animate: boolean, float: boolean, className: string, style?: import('react').CSSProperties}} props */
function Picture({ svg, size, live, animate, float, className, style }) {
  if (!live) {
    return (
      <img
        src={svgUrl(svg)}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        draggable={false}
        className={`shrink-0 select-none ${className}`}
        style={{ width: size, height: size, ...style }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`glass-live shrink-0 ${animate ? 'glass-enter' : ''} ${float ? 'glass-float glass-shine' : ''} ${className}`}
      style={{ width: size, height: size, ...style }}
      // Built by glass.js from our own shapes and a checked colour - no user text in it.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
