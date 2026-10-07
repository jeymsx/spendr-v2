import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '../index.css'
import { CurrencyProvider } from '../context/CurrencyContext'
import NoteView from '../components/standing/NoteView'
import useStandingFacts from '../components/standing/useStandingFacts'
import { composeNote } from '../lib/standing/compose'
import { LEVELS } from '../lib/standing/level'
import { SCENARIOS, SCENARIO_ACCOUNTS, SCENARIO_CATEGORIES } from '../lib/standing/scenarios'
import { setBaseCurrency } from '../lib/money'

/**
 * Dev only: every way the note can read, drawn as the note itself.
 *
 * One card per situation (lib/standing/scenarios.js), each written by the
 * real composer from facts - not mock-ups - so what is on this page is what
 * the phone and the desktop would say in that situation. The first card is
 * this device's own ledger, read live: seed the sample data first
 * (/seed-sample-data.html) to see the sample month.
 *
 *   ?theme=light  ?device=desktop  ?day=3  ?only=short
 */

const LOOKUPS = {
  cats: Object.fromEntries(SCENARIO_CATEGORIES.map(c => [c.name, c])),
  accts: Object.fromEntries(SCENARIO_ACCOUNTS.map(a => [a.name, a])),
}
const params = new URLSearchParams(location.search)
const LEVEL_IDS = ['all', ...Object.keys(LEVELS)]

/** @param {{label: string, options: Array<[string, string]>, value: string, onChange: (v: string) => void}} p */
function Pick({ label, options, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-12 text-slate-500 dark:text-white/50">{label}</span>
      <div className="inline-flex rounded-full p-0.5 bg-slate-900/[0.06] dark:bg-white/[0.08]">
        {options.map(([v, text]) => (
          <button
            key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
            className={`px-3 py-1 rounded-full text-12 font-semibold ${value === v ? 'bg-white text-slate-900 shadow-sm dark:bg-white/20 dark:text-white' : 'text-slate-500 dark:text-white/55'}`}
          >{text}</button>
        ))}
      </div>
    </div>
  )
}

/** The frame a note sits in: the overlay's own ground, at the width of the phone or the desktop's column. */
function Frame({ wide, children }) {
  return (
    <div
      className="rounded-[28px] border border-slate-900/10 dark:border-white/10 bg-white/90 dark:bg-black/[0.88] overflow-hidden"
      style={{ width: wide ? 640 : 390 }}
    >
      <div className="px-6 py-10" style={{ minHeight: wide ? 0 : 420 }}>{children}</div>
    </div>
  )
}

function Card({ id, title, blurb, level, note, wide }) {
  return (
    <section data-scenario={id} className="flex flex-col gap-3">
      <header style={{ width: wide ? 640 : 390 }}>
        <div className="flex items-baseline gap-2">
          <h3 className="text-15 font-semibold text-slate-900 dark:text-white">{title}</h3>
          <span className="text-11 font-semibold rounded-full px-2 py-0.5 bg-slate-900/[0.07] dark:bg-white/10 text-slate-600 dark:text-white/70">{LEVELS[level]?.label ?? level}</span>
        </div>
        <p className="mt-0.5 text-12 text-slate-500 dark:text-white/50">{blurb}</p>
      </header>
      <Frame wide={wide}>
        <NoteView note={note} lookups={LOOKUPS} px={wide ? 25 : 20} />
      </Frame>
      <p className="font-mono text-11 text-slate-400 dark:text-white/35" style={{ width: wide ? 640 : 390 }}>{note.ids.join(' · ')}</p>
    </section>
  )
}

/** This device's own ledger, through the real hook. */
function Live({ wide, salt }) {
  const { facts, ready, lookups } = useStandingFacts()
  const note = useMemo(() => (facts ? composeNote(facts, { salt }) : null), [facts, salt])
  if (!ready || !note) {
    return <p className="text-13 text-slate-500 dark:text-white/50">Reading this device&apos;s ledger...</p>
  }
  return (
    <section data-scenario="live" className="flex flex-col gap-3">
      <header style={{ width: wide ? 640 : 390 }}>
        <div className="flex items-baseline gap-2">
          <h3 className="text-15 font-semibold text-slate-900 dark:text-white">This device, live</h3>
          <span className="text-11 font-semibold rounded-full px-2 py-0.5 bg-slate-900/[0.07] dark:bg-white/10 text-slate-600 dark:text-white/70">{note.level.label}</span>
        </div>
        <p className="mt-0.5 text-12 text-slate-500 dark:text-white/50">Read from IndexedDB on this origin just now. Seed the sample data to see its October.</p>
      </header>
      <Frame wide={wide}><NoteView note={note} lookups={lookups} px={wide ? 25 : 20} /></Frame>
      <p className="font-mono text-11 text-slate-400 dark:text-white/35" style={{ width: wide ? 640 : 390 }}>{note.ids.join(' · ')}</p>
    </section>
  )
}

function Gallery() {
  const [theme, setTheme] = useState(params.get('theme') === 'light' ? 'light' : 'dark')
  const [device, setDevice] = useState(params.get('device') === 'desktop' ? 'desktop' : 'phone')
  const [day, setDay] = useState(Number(params.get('day') ?? 0) || 0)
  const [only, setOnly] = useState(LEVEL_IDS.includes(params.get('only') ?? '') ? /** @type {string} */ (params.get('only')) : 'all')
  const [live, setLive] = useState(params.get('live') !== '0')
  const wide = device === 'desktop'

  useEffect(() => {
    const root = document.documentElement
    root.classList.add('accent-blue')
    root.classList.toggle('dark', theme === 'dark')
    document.body.style.background = theme === 'dark' ? '#0b0f14' : '#f1f5f9'
  }, [theme])

  const notes = useMemo(() => SCENARIOS.map(sc => {
    // The dollar scenario is written in dollars, whatever the rest of the page is in.
    setBaseCurrency(sc.facts.currency || 'PHP')
    const note = composeNote(sc.facts, { salt: day })
    setBaseCurrency('PHP')
    return { sc, note }
  }), [day])

  return (
    <div className="min-h-screen px-6 pb-24 text-slate-900 dark:text-white">
      <header className="sticky top-0 z-10 -mx-6 px-6 py-3 mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 backdrop-blur-md bg-white/80 dark:bg-black/60 border-b border-slate-900/10 dark:border-white/10">
        <h1 className="text-15 font-semibold">Standing note</h1>
        <Pick label="Theme" value={theme} onChange={setTheme} options={[['dark', 'Dark'], ['light', 'Light']]} />
        <Pick label="Device" value={device} onChange={setDevice} options={[['phone', 'Phone'], ['desktop', 'Desktop']]} />
        <Pick label="Day" value={String(day)} onChange={v => setDay(Number(v))} options={[0, 1, 2, 3, 4, 5].map(n => [String(n), `+${n}`])} />
        <Pick label="Show" value={only} onChange={setOnly} options={LEVEL_IDS.map(id => [id, id === 'all' ? 'All' : LEVELS[/** @type {keyof typeof LEVELS} */ (id)].label])} />
        <Pick label="Live" value={live ? '1' : '0'} onChange={v => setLive(v === '1')} options={[['1', 'On'], ['0', 'Off']]} />
        <span className="text-12 text-slate-500 dark:text-white/50">{notes.filter(n => only === 'all' || n.sc.level === only).length} situations. Day changes the wording, as tomorrow would.</span>
      </header>
      <div className="flex flex-wrap gap-x-10 gap-y-12 items-start">
        {live && (
          <CurrencyProvider>
            <Live wide={wide} salt={day} />
          </CurrencyProvider>
        )}
        {notes.filter(n => only === 'all' || n.sc.level === only).map(({ sc, note }) => (
          <Card key={sc.id} id={sc.id} title={sc.title} blurb={sc.blurb} level={sc.level} note={note} wide={wide} />
        ))}
      </div>
    </div>
  )
}

createRoot(/** @type {HTMLElement} */ (document.getElementById('root'))).render(<StrictMode><Gallery /></StrictMode>)
document.body.dataset.ready = '1'
