import {
  Bold01, Italic01, Underline01, Strikethrough01, Dotpoints01, FlipBackward, FlipForward,
  Pin01, Share01, DotsHorizontal, Trash01,
} from '@untitledui/icons'

/**
 * The editor's glyphs.
 *
 * Untitled UI's where it has one, at the app's 1.8 weight (components/
 * icons.jsx), and drawn here on the same 24 grid where it has none - a
 * numbered list, a dashed one, a checklist, indenting and a quote are not in
 * the pack. Stroke only, round caps and joins, `currentColor`, so they sit in
 * one row with the pack's without a seam.
 */

/** @param {any} Cmp */
function pack(Cmp) {
  /** @param {{size?: number}} props */
  const Icon = ({ size = 20, ...rest }) => <Cmp size={size} strokeWidth={1.8} {...rest} />
  Icon.displayName = `NoteIcon(${Cmp.displayName ?? 'uui'})`
  return Icon
}

/** @param {{size?: number, children: import('react').ReactNode}} props */
function Drawn({ size = 20, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const IconBold = pack(Bold01)
export const IconItalic = pack(Italic01)
export const IconUnderline = pack(Underline01)
export const IconStrike = pack(Strikethrough01)
export const IconBullets = pack(Dotpoints01)
export const IconUndo = pack(FlipBackward)
export const IconRedo = pack(FlipForward)
export const IconPin = pack(Pin01)
export const IconShare = pack(Share01)
export const IconMore = pack(DotsHorizontal)
export const IconBin = pack(Trash01)

/** 1, 2, 3 down the left of three lines. @param {{size?: number}} props */
export function IconNumbered({ size }) {
  return (
    <Drawn size={size}>
      <path d="M10 6h11M10 12h11M10 18h11" />
      <path d="M4.3 4.1 5.6 3.3v5" strokeWidth={1.5} />
      <path d="M3.6 10.6a1.35 1.35 0 0 1 2.6.5c0 1-2.6 2-2.6 3.1h2.7" strokeWidth={1.5} />
      <path d="M3.7 16.5a1.3 1.3 0 0 1 2.4.6 1.1 1.1 0 0 1-1.1 1 1.1 1.1 0 0 1 1.1 1 1.3 1.3 0 0 1-2.4.6" strokeWidth={1.5} />
    </Drawn>
  )
}

/** Dashes down the left of three lines. @param {{size?: number}} props */
export function IconDashes({ size }) {
  return (
    <Drawn size={size}>
      <path d="M10 6h11M10 12h11M10 18h11M3.5 6h3M3.5 12h3M3.5 18h3" />
    </Drawn>
  )
}

/** A ticked circle and an open one, each with its line. @param {{size?: number}} props */
export function IconChecklist({ size }) {
  return (
    <Drawn size={size}>
      <circle cx="5.5" cy="7" r="2.6" />
      <path d="m4.3 7 .9.9 1.6-1.8" strokeWidth={1.5} />
      <circle cx="5.5" cy="17" r="2.6" />
      <path d="M11 7h10M11 17h10" />
    </Drawn>
  )
}

/** Lines pushed right. @param {{size?: number}} props */
export function IconIndent({ size }) {
  return (
    <Drawn size={size}>
      <path d="M11 7h10M11 12h10M11 17h10M3 8.5 6.5 12 3 15.5" />
    </Drawn>
  )
}

/** Lines pulled back left. @param {{size?: number}} props */
export function IconOutdent({ size }) {
  return (
    <Drawn size={size}>
      <path d="M11 7h10M11 12h10M11 17h10M6.5 8.5 3 12l3.5 3.5" />
    </Drawn>
  )
}

/** A quote's bar beside its lines. @param {{size?: number}} props */
export function IconQuote({ size }) {
  return (
    <Drawn size={size}>
      <path d="M4.5 5v14M9.5 8h10.5M9.5 12h10.5M9.5 16h7" />
    </Drawn>
  )
}

/** A marker's tip, for highlighting. @param {{size?: number}} props */
export function IconMarker({ size }) {
  return (
    <Drawn size={size}>
      <path d="m9 11-6 6v3h9l3-3" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </Drawn>
  )
}

/** Down, and away: the keyboard. @param {{size?: number}} props */
export function IconKeyboardDown({ size }) {
  return (
    <Drawn size={size}>
      <rect x="3" y="4" width="18" height="11" rx="2.5" />
      <path d="M7 8h.01M10.5 8h.01M14 8h.01M17 8h.01M8 11.5h8M9 19l3 2.5 3-2.5" />
    </Drawn>
  )
}
