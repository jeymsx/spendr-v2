/**
 * Sidebar icons for the desktop shell.
 *
 * Inline and stroke="currentColor", same as src/components/icons.jsx, so they
 * follow the accent colour and dark mode. Drawn at 20px for a sidebar rather
 * than the 22px the bottom nav uses.
 *
 * These are deliberately separate from the mobile Navbar's icons: those take an
 * `active` prop that fills the shape for a tab bar, which reads wrong in a
 * vertical list where the active row already has a background.
 */

const P = {
  width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round',
}

export function WebIconHome() {
  return (
    <svg {...P}>
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" />
      <polyline points="9 21 9 12 15 12 15 21" />
    </svg>
  )
}

export function WebIconList() {
  return (
    <svg {...P}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="13" x2="14" y2="13" />
      <line x1="7" y1="17" x2="11" y2="17" />
    </svg>
  )
}

export function WebIconWallet() {
  return (
    <svg {...P}>
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 6V4a1 1 0 011-1h10a1 1 0 011 1v2" />
      <circle cx="17" cy="15" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function WebIconChart() {
  return (
    <svg {...P}>
      <rect x="3" y="14" width="4" height="7" rx="1" />
      <rect x="10" y="9" width="4" height="12" rx="1" />
      <rect x="17" y="4" width="4" height="17" rx="1" />
    </svg>
  )
}

export function WebIconHandshake() {
  return (
    <svg {...P}>
      <path d="M12 8.5 9.8 6.3a2.1 2.1 0 0 0-3 0L3 10.2a2.1 2.1 0 0 0 0 3l3.4 3.4a2.1 2.1 0 0 0 3 0" />
      <path d="M12 8.5l2.2-2.2a2.1 2.1 0 0 1 3 0L21 10.2a2.1 2.1 0 0 1 0 3l-3.4 3.4a2.1 2.1 0 0 1-3 0" />
      <path d="M9.5 14l2.5 2.5 2.5-2.5" />
    </svg>
  )
}

export function WebIconRepeat() {
  return (
    <svg {...P}>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  )
}

export function WebIconSettings() {
  return (
    <svg {...P}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

export function WebIconImport() {
  return (
    <svg {...P}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export function WebIconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function WebIconPhone() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="3" />
      <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.4" />
    </svg>
  )
}
