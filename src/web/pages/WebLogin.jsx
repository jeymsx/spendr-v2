import { useEffect, useRef, useState } from 'react'
import { useBack } from '../../hooks/useBack'
import { useReduceMotion } from '../../hooks/useReduceMotion'
import { useTheme } from '../../context/ThemeContext'
import { GoogleIcon, useGoogleLogin } from '../../pages/Login'
import { PolicySheet } from '../../pages/settings/Policy'
import { GlassArt } from '../../components/glass/GlassArt'
import Btn from '../ui/Button'
import { IMonitor } from '../ui/icons'

/**
 * Signing in on a computer: two halves, as a desktop app's sign-in is laid
 * out. At the left, Spendr - a deep ground in the accent with points drifting
 * across it, its glass pictures, the wordmark and one plain line on what it
 * is. At the right, the sign-in itself: Google, or carrying on without an
 * account, which the app has always allowed.
 *
 * The phone keeps its centred screen (pages/Login); both sign in through the
 * same hook (useGoogleLogin), so they cannot drift on what signing in does.
 */
export default function WebLogin() {
  const back = useBack()
  const { accentColor } = useTheme()
  const still = useReduceMotion()
  const { loading, signingIn, error, handleGoogleSignIn } = useGoogleLogin()
  const [policy, setPolicy] = useState(/** @type {string|null} */ (null))

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--d-bg)]">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="d-login">
      {/* ── Spendr ── */}
      <section className="d-login-brand" aria-label="Spendr">
        <Particles still={still} hue={accentColor} />
        <div className="d-login-stage" aria-hidden="true">
          <GlassArt name="chartUp" hue={accentColor} size={132} animate={!still} float={!still} className="d-login-art is-back" />
          <GlassArt name="wallet" hue={accentColor} size={236} animate={!still} float={!still} className="d-login-art is-front" />
          <GlassArt name="coins" hue={accentColor} size={112} animate={!still} float={!still} className="d-login-art is-side" />
        </div>
        <div className="d-login-copy">
          <h2 className="d-login-wordmark">Spendr</h2>
          <p className="d-login-lede">A simple money tracker for your cash, banks, e-wallets and cards.</p>
        </div>
      </section>

      {/* ── Signing in ── */}
      <main className="d-login-side">
        <div className="d-login-form">
          <p className="d-eyebrow inline-flex items-center gap-2"><IMonitor size={15} />Spendr for web</p>
          <h1 className="d-login-h1">Sign in</h1>
          <p className="d-login-sub">Use the same Google account as on your phone.</p>

          <Btn size="lg" className="w-full mt-8 d-login-google" onClick={handleGoogleSignIn} disabled={signingIn}>
            {signingIn
              ? <><span className="w-4 h-4 border-2 border-[var(--d-border-strong)] border-t-[var(--d-text)] rounded-full animate-spin" />Redirecting…</>
              : <><GoogleIcon />Sign in with Google</>}
          </Btn>
          {error && <p className="mt-3 text-13 d-neg" role="alert">{error}</p>}

          <div className="d-login-or" aria-hidden="true"><span>or</span></div>

          <Btn size="lg" variant="ghost" className="w-full" onClick={back}>Continue without signing in</Btn>

          <p className="mt-10 text-13 text-[var(--d-text-3)]">
            <button type="button" className="d-link" onClick={() => setPolicy('terms')}>Terms</button>
            <span aria-hidden="true"> · </span>
            <button type="button" className="d-link" onClick={() => setPolicy('privacy')}>Privacy</button>
          </p>
        </div>
      </main>

      <PolicySheet open={!!policy} type={policy} onClose={() => setPolicy(null)} />
    </div>
  )
}

/**
 * Points drifting across the panel, joined by a hairline while two are
 * close - a slow, changing geometry rather than a picture. A canvas, sized
 * to the panel at the screen's pixel density; about one point per 15,000
 * square pixels, never more than 70, so the pairs it checks each frame stay
 * in the low thousands. Each frame moves them by the time since the last, so
 * the speed holds on any display. It draws one still frame under Reduce
 * motion, and the browser stops it while the tab is hidden.
 *
 * @param {{still: boolean, hue: string}} props
 */
function Particles({ still, hue }) {
  const ref = useRef(/** @type {HTMLCanvasElement|null} */ (null))
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const LINK = 140
    /** @type {Array<{x: number, y: number, vx: number, vy: number, r: number}>} */
    let pts = []
    let w = 0, h = 0, raf = 0, last = 0
    const point = () => {
      const a = Math.random() * Math.PI * 2
      const v = 6 + Math.random() * 12            // px a second
      return { x: Math.random() * w, y: Math.random() * h, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1 + Math.random() * 1.4 }
    }
    /* A new size keeps the points it has, moved in proportion, and adds or
       drops only the difference - so a resize does not reshuffle them. */
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const was = { w, h }
      w = canvas.clientWidth; h = canvas.clientHeight
      if (w === was.w && h === was.h && pts.length) return
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (was.w && was.h) for (const p of pts) { p.x *= w / was.w; p.y *= h / was.h }
      const n = Math.min(70, Math.round((w * h) / 15000))
      while (pts.length < n) pts.push(point())
      pts.length = n
    }
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d > LINK) continue
          ctx.globalAlpha = (1 - d / LINK) * 0.22
          ctx.strokeStyle = hue
          ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        }
      }
      ctx.fillStyle = '#ffffff'
      for (const p of pts) {
        ctx.globalAlpha = 0.55
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    const step = (/** @type {number} */ t) => {
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0
      last = t
      for (const p of pts) {
        p.x += p.vx * dt; p.y += p.vy * dt
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10
      }
      draw()
      raf = requestAnimationFrame(step)
    }
    size()
    if (still) draw()
    else raf = requestAnimationFrame(step)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { size(); if (still) draw() })
    ro?.observe(canvas)
    return () => { cancelAnimationFrame(raf); ro?.disconnect() }
  }, [still, hue])
  return <canvas ref={ref} className="d-login-particles" aria-hidden="true" />
}
