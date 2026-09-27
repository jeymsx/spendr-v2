import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../components/ui/Button'
import IconButton from '../../components/ui/IconButton'
import { keepTabInside } from '../../components/ui/focus'
import { GlassBadge } from '../../components/glass/GlassArt'
import { glassPalette } from '../../components/glass/glass'
import { useScrollLock } from '../../hooks/useScrollLock'
import { addDays, dayKey, toneHue } from '../../lib/achievements'

/**
 * How achievements work, as four short steps with a picture each: what a
 * milestone is, what a badge is, what a challenge is, and how a day counts.
 *
 * It replaced a paragraph in a sheet. Everything in it was true and read as
 * terms and conditions - the three kinds are easier to SEE than to describe,
 * and each one is shown from your own ledger where there is something to
 * show: your logging track, your badges, the challenge you have running.
 *
 * A centred card rather than a sheet, because it is something you read
 * through rather than something you do: Back and Next, swipe, the arrow keys.
 * It keeps a dialog's manners - focus in and back, Tab held inside, Escape.
 *
 * @param {{open: boolean, onClose: () => void, state: any}} props
 */
export default function Guide({ open, onClose, state }) {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [closing, setClosing] = useState(false)
  const dialogRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const titleId = useId()
  const steps = stepsFor(state)
  const last = steps.length - 1
  const s = steps[Math.min(step, last)]

  useScrollLock(open)

  const go = (/** @type {number} */ to) => {
    if (to < 0 || to > last) return
    setDir(to > step ? 1 : -1)
    setStep(to)
  }
  /* Out with a short fade, then gone - and back to the first step for next
     time. The timer is the exit's length. */
  const close = () => {
    if (closing) return
    setClosing(true)
    setTimeout(() => { setClosing(false); setStep(0); onClose() }, 180)
  }

  // The latest, for the key handler bound while it is open.
  const keys = useRef({ go, close, step })
  useEffect(() => { keys.current = { go, close, step } })

  useEffect(() => {
    if (!open) return
    const before = /** @type {HTMLElement|null} */ (document.activeElement)
    dialogRef.current?.focus({ preventScroll: true })
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      const k = keys.current
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); k.close() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); k.go(k.step + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); k.go(k.step - 1) }
      else if (e.key === 'Tab') { keepTabInside(e, dialogRef.current); e.stopPropagation() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      before?.focus?.({ preventScroll: true })
    }
  }, [open])

  // A swipe across the card turns the page, as a finger expects it to.
  const swipe = useRef(/** @type {{x: number, y: number}|null} */ (null))
  const onPointerDown = (/** @type {import('react').PointerEvent} */ e) => { swipe.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = (/** @type {import('react').PointerEvent} */ e) => {
    const from = swipe.current
    swipe.current = null
    if (!from) return
    const dx = e.clientX - from.x, dy = e.clientY - from.y
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) go(step + (dx < 0 ? 1 : -1))
  }

  if (!open) return null

  return createPortal(
    /* design-ok: a centred card you read through, not a sheet you act in -
       Sheet docks or floats at the foot of the screen, and a stepper wants
       the middle. It keeps a dialog's manners: aria-modal, a label, focus
       in and back, Tab held inside, Escape. */
    <div className={`fixed inset-0 z-[450] flex items-center justify-center px-4 ${closing ? 'guide-closing' : ''}`}>
      <div className="guide-scrim absolute inset-0 bg-black/55" onClick={close} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="guide-card relative w-full max-w-[380px] rounded-[28px] bg-panel outline-none overflow-hidden
          border border-slate-100 dark:border-white/[0.08] shadow-[0_24px_60px_rgba(0,0,0,0.32)]"
      >
        <div className="flex items-center justify-between pl-5 pr-3 pt-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-5 bg-primary' : 'w-1.5 bg-slate-200 dark:bg-white/[0.14]'}`}
              />
            ))}
          </div>
          <IconButton label="Close" variant="plain" onClick={close}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </IconButton>
        </div>

        <div key={step} className="guide-step" style={/** @type {import('react').CSSProperties} */ ({ '--dir': dir })}>
          <div className="h-[176px] flex items-center justify-center" aria-hidden="true">{s.visual}</div>
          <div className="px-6 text-center" aria-live="polite">
            <p className="text-11 font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              {step + 1} of {steps.length}
            </p>
            <h2 id={titleId} className="mt-1 text-22 leading-tight font-bold tracking-tight text-slate-900 dark:text-white">{s.title}</h2>
            <p className="mt-2 text-14 leading-relaxed text-slate-600 dark:text-slate-300 text-balance">{s.body}</p>
            <p className="mt-3 min-h-[18px] text-13 font-semibold text-primary">{s.yours ?? ''}</p>
          </div>
        </div>

        <div className="flex gap-3 px-5 pt-4 pb-5">
          <Button variant="secondary" className={`flex-1 ${step === 0 ? 'invisible' : ''}`} onClick={() => go(step - 1)}>
            Back
          </Button>
          <Button className="flex-[1.4]" onClick={step === last ? close : () => go(step + 1)}>
            {step === last ? 'Got it' : 'Next'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const ORANGE = toneHue('orange')

/**
 * The four steps, each told from the ledger where there is something of yours
 * to show - your own logging track, your badges, the challenge you have
 * running - and from a good example where there is not yet.
 *
 * @param {any} state  useAchievements()
 */
function stepsFor(state) {
  const logging = (state?.tracks ?? []).find((/** @type {any} */ t) => t.key === 'logging')
  const streak = logging?.progress?.current ?? 0
  const next = logging?.view?.next ?? null
  const badges = state?.badges ?? []
  const earned = badges.filter((/** @type {any} */ b) => b.earned)
  const running = state?.challenges?.active ?? []
  const won = state?.challenges?.won ?? 0

  return [
    {
      title: 'Milestones',
      body: 'Levels that keep climbing. Log every day, go days without spending, save more: there is always a next level.',
      yours: streak > 0
        ? `You're on a ${streak}-day logging streak${next ? `. Next level: ${next.n}.` : '.'}`
        : 'Log something today to start a streak.',
      visual: <MilestonesPicture track={logging} />,
    },
    {
      title: 'Badges',
      body: 'One-offs for the big moments, like clearing a debt or a full year of tracking. Earn one once, keep it for good.',
      yours: badges.length ? `You have ${earned.length} of ${badges.length}.` : null,
      visual: <BadgesPicture badges={badges} />,
    },
    {
      title: 'Challenges',
      body: 'Goals you pick, a few days at a time. Spendr checks them against what you log. Missed one? Just try again.',
      yours: running.length ? `${running.length} running now${won ? `, ${won} won so far` : ''}.` : won ? `${won} won so far.` : 'Up to three at a time.',
      visual: <ChallengePicture row={running[0] ?? null} />,
    },
    {
      title: 'How days count',
      body: 'A day counts once the next one is over, so there is time to log yesterday. Quiet days count when you open Spendr that day or the next.',
      yours: null,
      visual: <DaysPicture />,
    },
  ]
}

/** Your logging track: its medallion at your level, and its first levels lit as far as you have come. @param {{track: any}} props */
function MilestonesPicture({ track }) {
  const tiers = (track?.view?.tiers ?? [{ n: 3, label: '3', earned: true }, { n: 7, label: '7', earned: true }, { n: 14, label: '14' }, { n: 30, label: '30' }]).slice(0, 5)
  const top = [...tiers].reverse().find((/** @type {any} */ t) => t.earned) ?? null
  const ink = glassPalette(ORANGE).ink
  let lit = 0
  return (
    <div className="flex flex-col items-center gap-3">
      <GlassBadge glyph="flame" hue={ORANGE} shape="circle" level={(top ?? tiers[0]).label} locked={!top} size={100} animate float />
      <div className="flex gap-1.5">
        {tiers.map((/** @type {any} */ t) => {
          const on = t.earned
          const delay = on ? 0.3 + (lit++) * 0.16 : 0
          return (
            <span
              key={t.n}
              className={`h-7 min-w-[40px] px-2.5 rounded-full inline-flex items-center justify-center text-12 font-bold tabular-nums ${
                on ? 'guide-light text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.07] dark:text-slate-400'
              }`}
              style={on ? /** @type {import('react').CSSProperties} */ ({ backgroundColor: ink, animationDelay: `${delay}s` }) : undefined}
            >
              {t.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Three badges: yours where you have them, one still to earn in grey. @param {{badges: any[]}} props */
function BadgesPicture({ badges }) {
  const earned = badges.filter(b => b.earned)
  const locked = badges.filter(b => !b.earned)
  const fallback = [
    { key: 'a', glyph: 'cards', hue: toneHue('cyan'), earned: true },
    { key: 'b', glyph: 'target', hue: toneHue('indigo'), earned: true },
    { key: 'c', glyph: 'check', hue: toneHue('green'), earned: false },
  ]
  /* Two earned and one still to earn, where the ledger has them - the larger
     one in the middle is earned, the grey one sits at the side. */
  const three = earned.length || locked.length
    ? [earned[1] ?? locked[1] ?? fallback[0], earned[0] ?? locked[2] ?? fallback[1], locked[0] ?? earned[2] ?? fallback[2]]
    : fallback
  return (
    <div className="flex items-end justify-center gap-2">
      {three.map((b, i) => (
        <div key={`${b.key}-${i}`} className={i === 1 ? '' : 'mb-3'}>
          <GlassBadge glyph={b.glyph} hue={b.hue} shape="hex" locked={!b.earned} size={i === 1 ? 104 : 76} animate float={i === 1} />
        </div>
      ))}
    </div>
  )
}

/** The challenge you have running, or a weekend without spending as the example. @param {{row: any}} props */
function ChallengePicture({ row }) {
  const def = row?.def ?? { name: 'No-Spend Weekend', glyph: 'calendar', tone: 'teal' }
  const hue = toneHue(def.tone)
  const share = row?.judged?.target ? Math.min(1, row.judged.value / row.judged.target) : 0.5
  const progress = row?.judged?.progress ?? '1 of 2 days'
  return (
    <div className="flex items-center gap-3">
      <GlassBadge glyph={def.glyph} hue={hue} shape="shield" size={96} animate float />
      <div className="w-[150px] rounded-2xl px-3.5 py-3 bg-slate-50 border border-slate-100 dark:bg-white/[0.05] dark:border-white/[0.06] text-left">
        <p className="text-13 font-semibold text-slate-900 dark:text-white truncate">{def.name}</p>
        <p className="mt-0.5 text-11 text-slate-500 dark:text-slate-400 tabular-nums truncate">{progress}</p>
        <div className="mt-2 h-1.5 rounded-full bg-slate-200 dark:bg-white/[0.10] overflow-hidden">
          <div className="guide-fill h-full rounded-full origin-left" style={{ width: `${Math.max(6, share * 100)}%`, backgroundColor: hue }} />
        </div>
      </div>
    </div>
  )
}

/** The day before yesterday counted, yesterday settling tonight, today still going. */
function DaysPicture() {
  const today = dayKey(new Date())
  const name = (/** @type {string} */ key) => new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
  const days = [
    { key: addDays(today, -2), note: 'Counted', state: 'done' },
    { key: addDays(today, -1), note: 'Settles tonight', state: 'settling' },
    { key: today, note: 'Today', state: 'today' },
  ]
  return (
    <div className="flex items-start justify-center gap-3">
      {days.map((d, i) => (
        <div key={d.key} className="flex flex-col items-center gap-2 w-[84px]">
          <div
            className={`guide-light-in w-16 h-16 rounded-2xl flex flex-col items-center justify-center ${
              d.state === 'done' ? 'bg-primary text-white'
                : d.state === 'settling' ? 'bg-primary/[0.14] text-primary border border-dashed border-primary/50'
                  : 'border border-dashed border-slate-300 text-slate-500 dark:border-white/[0.18] dark:text-slate-400'
            }`}
            style={{ animationDelay: `${0.15 + i * 0.14}s` }}
          >
            <span className="text-11 font-bold uppercase tracking-wide opacity-80">{name(d.key)}</span>
            {d.state === 'done' && (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            )}
            {d.state === 'settling' && (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></svg>
            )}
            {d.state === 'today' && <span className="mt-1 w-2 h-2 rounded-full bg-current" />}
          </div>
          <span className="text-11 font-semibold text-center leading-tight text-slate-500 dark:text-slate-400">{d.note}</span>
        </div>
      ))}
    </div>
  )
}
