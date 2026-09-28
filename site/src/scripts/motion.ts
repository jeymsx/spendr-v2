/**
 * The site's motion, the parts CSS cannot start by itself.
 *
 * Arrivals: anything marked [data-reveal], and every glass picture, is marked
 * .is-in the first time it comes into view, and global.css does the rest.
 * Once only - a page that re-animates as you scroll back up is showing off.
 */
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function initReveal() {
  const targets = document.querySelectorAll<HTMLElement>('[data-reveal], .glass-enter')
  if (!('IntersectionObserver' in window) || reducedMotion()) {
    for (const t of targets) t.classList.add('is-in')
    return
  }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      e.target.classList.add('is-in')
      io.unobserve(e.target)
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
  for (const t of targets) io.observe(t)
}

/**
 * Run `start` while `el` is on screen and `stop` when it leaves, so a loop
 * nobody can see is not spending anyone's battery.
 */
export function whileVisible(el: Element, start: () => void, stop: () => void, threshold = 0.25) {
  let on = false
  const io = new IntersectionObserver(([e]) => {
    const vis = e.isIntersecting && document.visibilityState === 'visible'
    if (vis && !on) { on = true; start() } else if (!vis && on) { on = false; stop() }
  }, { threshold })
  io.observe(el)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' && on) { on = false; stop() }
    else if (document.visibilityState === 'visible' && !on) {
      const r = el.getBoundingClientRect()
      if (r.bottom > 0 && r.top < window.innerHeight) { on = true; start() }
    }
  })
}

/**
 * Swap one element's content for another's through the app's short blur:
 * the old fades out through a blur, the new resolves out of one.
 */
export function blurSwap(el: HTMLElement, change: () => void) {
  if (reducedMotion()) { change(); return }
  el.classList.remove('swap-in')
  el.classList.add('swap-out')
  const done = () => {
    el.classList.remove('swap-out')
    change()
    void el.offsetWidth
    el.classList.add('swap-in')
  }
  window.setTimeout(done, 190)
}

/** A figure counting up to its value on arrival, the way the app's figures roll. */
export function initCountUps() {
  const els = document.querySelectorAll<HTMLElement>('[data-count-to]')
  if (!els.length) return
  const fmt = (v: number, dp: number) => v.toLocaleString('en-PH', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  const run = (el: HTMLElement) => {
    const to = Number(el.dataset.countTo)
    const dp = Number(el.dataset.countDp ?? 2)
    const prefix = el.dataset.countPrefix ?? ''
    if (reducedMotion()) { el.textContent = prefix + fmt(to, dp); return }
    const from = to * 0.82
    const t0 = performance.now()
    const dur = 1100
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur)
      const e = 1 - Math.pow(1 - p, 4)
      el.textContent = prefix + fmt(from + (to - from) * e, dp)
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      io.unobserve(e.target)
      window.setTimeout(() => run(e.target as HTMLElement), Number((e.target as HTMLElement).dataset.countDelay ?? 0))
    }
  }, { threshold: 0.5 })
  for (const el of els) io.observe(el)
}
