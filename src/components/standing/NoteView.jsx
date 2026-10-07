import {
  AlertCircle, AlertTriangle, Calendar, CheckCircle, Stars01, Sun,
} from '@untitledui/icons'
import CategoryGlyph from '../CategoryGlyph'
import { CardThumb } from '../AccountLine'

/**
 * A note, drawn: the greeting, where you stand in a word, and the paragraphs
 * with their figures, tiles, dates and bars in the middle of the sentences.
 *
 * Grey is the context and black is what matters - read only the black and the
 * note still tells you the month. The things to look at are inline, sized to
 * the type around them (everything is in em), so the same tokens read at 21px
 * on a phone and 26px on a desktop, and so the picture of the note
 * (noteImage.js) can draw the same thing from the same tokens.
 *
 * Presentational only: the overlay (StandingNote.jsx) and the gallery both
 * hand it a Note and the lookups that turn a category's name into its tile.
 *
 * @typedef {import('../../lib/standing/tokens').Token} Token
 * @typedef {import('../../lib/standing/compose').Note} Note
 * @typedef {{cats: Record<string, any>, accts: Record<string, any>}} Lookups
 */

const TONE = {
  good: 'text-emerald-700 dark:text-emerald-400',
  bad: 'text-red-600 dark:text-red-400',
  warn: 'text-amber-700 dark:text-amber-400',
}
/** The same tones as colours, for what is drawn rather than written. */
export const TONE_COLOR = { good: '#10b981', bad: '#ef4444', warn: '#f59e0b' }

/** What each standing looks like at the top of the note. */
const LEVEL_LOOK = {
  fresh: { Icon: Stars01, ink: 'accent-ink' },
  short: { Icon: AlertCircle, ink: 'text-red-600 dark:text-red-400' },
  tight: { Icon: AlertTriangle, ink: 'text-amber-700 dark:text-amber-400' },
  hot: { Icon: Sun, ink: 'text-amber-700 dark:text-amber-400' },
  steady: { Icon: CheckCircle, ink: 'accent-ink' },
  ahead: { Icon: CheckCircle, ink: 'text-emerald-700 dark:text-emerald-400' },
}

/** The pace bar's colour: how the budget is going against the month, as the sentence beside it says. @param {'good'|'bad'|'warn'|null} tone */
export function paceColor(tone) {
  return tone ? TONE_COLOR[tone] : 'var(--color-primary)'
}

/** @param {{used: number, elapsed: number, tone: 'good'|'bad'|'warn'|null}} p */
function PaceBar({ used, elapsed, tone }) {
  const fill = Math.max(0, Math.min(100, used))
  const tick = Math.max(0, Math.min(100, elapsed))
  return (
    <span
      role="img"
      aria-label={`${Math.round(used)}% of the budget used, ${Math.round(elapsed)}% of the month gone`}
      className="relative inline-block align-middle overflow-hidden rounded-full bg-slate-900/[0.13] dark:bg-white/[0.2]"
      style={{ width: '3.6em', height: '0.5em', margin: '0 0.12em', transform: 'translateY(-0.06em)' }}
    >
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fill}%`, background: paceColor(tone) }} />
      {/* Where the month is: the one mark to hold the fill against. */}
      <span className="absolute inset-y-0 bg-slate-900 dark:bg-white" style={{ left: `calc(${tick}% - 0.06em)`, width: '0.12em' }} />
    </span>
  )
}

/** @param {{parts: Array<{v: number, color: string}>}} p */
function SplitBar({ parts }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex align-middle overflow-hidden rounded-full gap-px"
      style={{ width: '3.6em', height: '0.5em', margin: '0 0.12em', transform: 'translateY(-0.06em)' }}
    >
      {parts.map((p, i) => <span key={i} style={{ flex: `${Math.max(0.0001, p.v)} 1 0`, background: p.color }} />)}
    </span>
  )
}

/** @param {{values: number[]}} p */
function Spark({ values }) {
  const w = 60
  const h = 18
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * (w - 4) + 2, h - 3 - (v / max) * (h - 6)])
  const last = pts[pts.length - 1]
  return (
    <svg
      aria-hidden="true" viewBox={`0 0 ${w} ${h}`}
      className="inline-block align-middle text-slate-400 dark:text-white/40"
      style={{ width: '3.2em', height: '0.96em', margin: '0 0.1em', transform: 'translateY(-0.06em)' }}
    >
      <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" className="fill-slate-900 dark:fill-white" />
    </svg>
  )
}

/**
 * One token, as the page draws it.
 *
 * @param {{t: Token, lookups: Lookups, px: number}} props
 */
function Tok({ t, lookups, px }) {
  const icon = Math.round(px * 0.7)
  switch (t.k) {
    case 't':
      return <>{t.v}</>
    case 'fig':
      return <span className={`font-semibold ${t.tone ? TONE[t.tone] : 'text-slate-900 dark:text-white'}`}>{t.v}</span>
    case 'arrow':
      return <span aria-hidden="true" className={`font-semibold ${t.tone ? TONE[t.tone] : 'text-slate-900 dark:text-white'}`}>{t.dir === 'up' ? '↑' : '↓'}</span>
    case 'dotfig':
      return (
        <span className="inline-flex items-baseline whitespace-nowrap" style={{ gap: '0.28em' }}>
          <span aria-hidden="true" className="rounded-full" style={{ width: '0.4em', height: '0.4em', background: t.color, alignSelf: 'center' }} />
          <span className="font-semibold text-slate-900 dark:text-white">{t.v}</span>
        </span>
      )
    case 'cat': {
      const cat = lookups.cats[t.name]
      return (
        <span className="inline-flex items-center whitespace-nowrap align-middle" style={{ gap: '0.32em' }}>
          {cat && (
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center shrink-0"
              style={{ width: '1.3em', height: '1.3em', borderRadius: '0.36em', background: `color-mix(in srgb, ${cat.color ?? '#64748b'} 24%, transparent)` }}
            >
              <CategoryGlyph cat={cat} size={icon} />
            </span>
          )}
          <span className="font-semibold text-slate-900 dark:text-white">{t.name}</span>
        </span>
      )
    }
    case 'acct': {
      const account = lookups.accts[t.name] ?? { name: t.name }
      return (
        <span className="inline-flex items-center whitespace-nowrap align-middle" style={{ gap: '0.4em' }}>
          <CardThumb account={account} sm />
          <span className="font-semibold text-slate-900 dark:text-white">{t.name}</span>
        </span>
      )
    }
    case 'date':
      return (
        <span
          className="inline-flex items-center whitespace-nowrap align-middle rounded-full font-semibold bg-primary/[0.14] accent-ink"
          style={{ gap: '0.3em', padding: '0.06em 0.6em 0.06em 0.5em', fontSize: '0.84em' }}
        >
          <Calendar size={Math.round(px * 0.66)} strokeWidth={2} aria-hidden="true" />
          {t.label}
        </span>
      )
    case 'pace':
      return <PaceBar used={t.used} elapsed={t.elapsed} tone={t.tone} />
    case 'split':
      return <SplitBar parts={t.parts} />
    case 'spark':
      return <Spark values={t.values} />
    default:
      return null
  }
}

/** @param {{tokens: Token[], lookups: Lookups, px: number}} props */
export function Tokens({ tokens, lookups, px }) {
  return <>{tokens.map((t, i) => <Tok key={i} t={t} lookups={lookups} px={px} />)}</>
}

/**
 * @param {{note: Note, lookups: Lookups, px?: number, className?: string}} props
 */
export default function NoteView({ note, lookups, px = 22, className = '' }) {
  const look = LEVEL_LOOK[note.level.id] ?? LEVEL_LOOK.steady
  const { Icon } = look
  return (
    <article className={className} aria-label="Where you stand">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 text-13 font-semibold ${look.ink}`}>
          <Icon size={18} strokeWidth={2} aria-hidden="true" />
          {note.level.label}
        </span>
        <span className="text-13 text-slate-500 dark:text-white/50" aria-hidden="true">·</span>
        <span className="text-13 text-slate-500 dark:text-white/50">{note.eyebrow.date}</span>
        <span className="text-13 text-slate-500 dark:text-white/50" aria-hidden="true">·</span>
        <span className="text-13 text-slate-500 dark:text-white/50">{note.eyebrow.day}</span>
      </div>
      <h2 className="mt-4 font-semibold tracking-[-0.025em] leading-[1.08] text-slate-900 dark:text-white" style={{ fontSize: px * 1.6 }}>
        {note.title}
      </h2>
      <div className="mt-5 flex flex-col font-medium tracking-[-0.012em] text-slate-500 dark:text-white/55" style={{ fontSize: px, lineHeight: 1.38, gap: '0.85em' }}>
        {note.paragraphs.map(p => (
          <p key={p.id}><Tokens tokens={p.tokens} lookups={lookups} px={px} /></p>
        ))}
      </div>
    </article>
  )
}
