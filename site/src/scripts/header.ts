/**
 * The header: it gains a surface once the page has scrolled under it, and on
 * a phone its menu opens as a panel below it.
 */
export function initHeader() {
  const header = document.querySelector<HTMLElement>('[data-header]')
  if (!header) return

  // A sentinel at the very top of the page rather than a scroll listener.
  const sentinel = document.querySelector('[data-header-sentinel]')
  if (sentinel && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => header.toggleAttribute('data-scrolled', !e.isIntersecting)).observe(sentinel)
  }

  const button = header.querySelector<HTMLButtonElement>('[data-menu-button]')
  const panel = document.querySelector<HTMLElement>('[data-menu]')
  if (!button || !panel) return

  const focusables = () => [...panel.querySelectorAll<HTMLElement>('a, button')].filter(el => !el.hasAttribute('disabled'))

  const open = () => {
    panel.hidden = false
    void panel.offsetWidth
    panel.dataset.open = ''
    header.dataset.menuOpen = ''
    button.setAttribute('aria-expanded', 'true')
    button.setAttribute('aria-label', 'Close menu')
    document.documentElement.style.overflow = 'hidden'
    focusables()[0]?.focus({ preventScroll: true })
  }
  const close = (restoreFocus = true) => {
    if (panel.hidden) return
    delete panel.dataset.open
    delete header.dataset.menuOpen
    button.setAttribute('aria-expanded', 'false')
    button.setAttribute('aria-label', 'Open menu')
    document.documentElement.style.overflow = ''
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => { if (!('open' in panel.dataset)) panel.hidden = true }, reduce ? 0 : 240)
    if (restoreFocus) button.focus({ preventScroll: true })
  }

  button.addEventListener('click', () => (panel.hidden ? open() : close()))
  panel.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('a')) close(false)
  })
  document.addEventListener('keydown', e => {
    if (panel.hidden) return
    if (e.key === 'Escape') { e.preventDefault(); close() }
    if (e.key === 'Tab') {
      const f = [button, ...focusables()]
      const i = f.indexOf(document.activeElement as HTMLElement)
      const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1)
      e.preventDefault()
      f[next].focus()
    }
  })
  // Growing past the phone layout closes it; the links are in the bar again.
  window.matchMedia('(min-width: 900px)').addEventListener('change', e => { if (e.matches) close(false) })
}
