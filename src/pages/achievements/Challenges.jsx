import { useState } from 'react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import ProgressBar from '../../components/ui/ProgressBar'
import SectionLabel from '../../components/ui/SectionLabel'
import MoneyField from '../../components/ui/MoneyField'
import CategoryPickerSheet from '../../components/CategoryPickerSheet'
import { GlassBadge } from '../../components/glass/GlassArt'
import { useToast } from '../../context/ToastContext'
import { dayKey, toneHue } from '../../lib/achievements'
import { timeLeft } from '../../lib/challenges'
import { moneyChangeHandler, numToMoneyStr, parseMoney } from '../../utils/moneyInput'
import { fmt } from '../../lib/money'
import { challengeSubject, fmtShort, fmtWindow } from './format'

/**
 * Challenges: the ones running, the ones on offer, and how the finished ones
 * went.
 *
 * Running ones lead, because they are the ones with a clock on them. Each
 * says where it stands in its own terms - "3 of 7 days", "₱420 of ₱1,000" -
 * and how long is left. The catalogue under them says in one sentence what
 * each asks and how long it takes; starting one opens a sheet with its exact
 * window, and for the two that take a setting, the setting.
 *
 * @param {{state: any, categories: any[], onViewWon: (row: any) => void}} props
 */
export default function Challenges({ state, categories, onViewWon }) {
  const { active, finished, catalogue, max } = state.challenges
  const [starting, setStarting] = useState(/** @type {any} */ (null))
  const [open, setOpen] = useState(/** @type {any} */ (null))
  const full = active.length >= max

  return (
    <div className="flex flex-col">
      {active.length > 0 && (
        <section>
          <SectionLabel inset="gutter" gap="loose">Running</SectionLabel>
          <div className="px-5 flex flex-col gap-2.5">
            {active.map(/** @param {any} row */ row => (
              <RunningCard key={row.id} row={row} onOpen={() => setOpen(row)} />
            ))}
          </div>
        </section>
      )}

      <section className={active.length ? 'mt-6' : ''}>
        <SectionLabel inset="gutter" gap="loose" hint={full ? `${max} at a time. Finish one to take on another.` : null}>
          Take one on
        </SectionLabel>
        <div className="px-5 flex flex-col gap-2.5">
          {catalogue.map(/** @param {any} entry */ entry => (
            <OfferCard
              key={entry.def.key}
              entry={entry}
              full={full}
              onStart={() => setStarting(entry)}
            />
          ))}
        </div>
      </section>

      {finished.length > 0 && (
        <section className="mt-6">
          <SectionLabel inset="gutter" gap="loose">Finished</SectionLabel>
          <Card clip className="mx-5">
            {finished.slice(0, 12).map(/** @param {any} row @param {number} i */ (row, i) => (
              <button
                key={row.id}
                type="button"
                onClick={() => (row.status === 'won' ? onViewWon(row) : setOpen(row))}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-slate-50 dark:active:bg-white/[0.04] ${i ? 'border-t border-slate-100 dark:border-white/[0.07]' : ''}`}
              >
                <GlassBadge glyph={row.def.glyph} hue={toneHue(row.def.tone)} shape="shield" locked={row.status !== 'won'} size={40} />
                <span className="flex-1 min-w-0">
                  <span className="block text-13 font-semibold text-slate-800 dark:text-slate-100 truncate">{row.def.name}</span>
                  <span className="block text-11 text-slate-500 dark:text-slate-400">{fmtWindow(row.startDay, row.endDay)}</span>
                </span>
                <span className={`shrink-0 text-12 font-semibold ${
                  row.status === 'won' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
                }`}>
                  {row.status === 'won' ? 'Won' : row.status === 'quit' ? 'Gave up' : 'Missed'}
                </span>
              </button>
            ))}
          </Card>
        </section>
      )}

      <StartSheet entry={starting} categories={categories} state={state} onClose={() => setStarting(null)} />
      <RunningSheet row={open} state={state} onClose={() => setOpen(null)} />
    </div>
  )
}

/** @param {{row: any, onOpen: () => void}} props */
function RunningCard({ row, onOpen }) {
  const hue = toneHue(row.def.tone)
  const j = row.judged
  const today = new Date()
  const upcoming = row.startDay > dayKey(today)
  const subject = challengeSubject(row)
  /* "Settles tonight" when it is there provisionally: the fifth quiet day
     was yesterday, and yesterday is not settled until today is over. */
  const when = j.settling ? 'Settles tonight' : timeLeft(row, today)
  return (
    <Card as="button" interactive padding="md" onClick={onOpen} className="flex items-center gap-3.5">
      <GlassBadge glyph={row.def.glyph} hue={hue} shape="shield" size={56} className="-my-1 -ml-1" />
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-15 font-semibold text-slate-900 dark:text-white truncate">{row.def.name}</span>
          <span className="shrink-0 text-11 font-semibold text-slate-500 dark:text-slate-400">{when}</span>
        </span>
        <span className="block mt-0.5 text-12 text-slate-600 dark:text-slate-300 tabular-nums truncate">
          {j.progress}{subject ? ` · ${subject}` : ''}
        </span>
        <span className="block mt-2">
          <ProgressBar value={upcoming ? 0 : (j.target ? (j.value / j.target) * 100 : 0)} color={hue} />
        </span>
      </span>
    </Card>
  )
}

/** @param {{entry: any, full: boolean, onStart: () => void}} props */
function OfferCard({ entry, full, onStart }) {
  const { def, running, availability } = entry
  const hue = toneHue(def.tone)
  const blocked = !availability.ok
  return (
    <Card padding="md" className="flex items-start gap-3.5">
      <GlassBadge glyph={def.glyph} hue={hue} shape="shield" size={52} locked={blocked} className="-ml-1 -mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-15 font-semibold text-slate-900 dark:text-white leading-snug">{def.name}</p>
          <span className="shrink-0 text-11 font-semibold text-slate-500 dark:text-slate-400">{def.length}</span>
        </div>
        <p className="mt-0.5 text-13 text-slate-600 dark:text-slate-300 leading-snug">{def.blurb}</p>
        {blocked && <p className="mt-1 text-12 text-slate-500 dark:text-slate-400">{availability.why}</p>}
        {!blocked && (
          <div className="mt-2.5">
            {running
              ? <span className="inline-flex h-8 items-center px-3 rounded-full text-12 font-semibold bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-slate-300">Running</span>
              : <Button size="xs" variant="tint" className="px-4" disabled={full} onClick={onStart}>Take it on</Button>}
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * Starting one: its window in dates, what winning it means, and the setting
 * for the two that take one - a category and its cap, or an amount to keep.
 *
 * @param {{entry: any, categories: any[], state: any, onClose: () => void}} props
 */
function StartSheet({ entry, categories, state, onClose }) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [category, setCategory] = useState(/** @type {string|null} */ (null))
  const [amount, setAmount] = useState(/** @type {string|null} */ (null))
  const def = entry?.def
  const key = def?.key
  const defaults = entry?.defaults ?? {}
  const cat = category ?? defaults.category ?? ''
  const amt = amount ?? (key === 'category-cap' ? numToMoneyStr(defaults.cap ?? 0) : key === 'keep-month' ? numToMoneyStr(defaults.amount ?? 0) : '')
  const params = key === 'category-cap' ? { category: cat, cap: parseMoney(amt) }
    : key === 'keep-month' ? { amount: parseMoney(amt) } : {}
  const plan = def && state.ctx ? safePlan(def, state.ctx, { ...defaults, ...params }) : null
  const valid = key === 'category-cap' ? !!cat && parseMoney(amt) > 0 : key === 'keep-month' ? parseMoney(amt) > 0 : true

  const close = () => { setCategory(null); setAmount(null); onClose() }

  async function start() {
    if (!def || busy || !valid) return
    setBusy(true)
    try {
      await state.startChallenge(def.key, params)
      showToast(`${def.name} started`)
      close()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not start it.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet
        open={!!entry}
        onClose={close}
        title={def?.name ?? ''}
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={close}>Not now</Button>
            <Button className="flex-[1.6]" loading={busy} disabled={!valid} onClick={start}>Start challenge</Button>
          </div>
        }
      >
        {def && (
          <div className="flex flex-col items-center text-center gap-3 pb-1">
            <GlassBadge glyph={def.glyph} hue={toneHue(def.tone)} shape="shield" size={120} animate float />
            <p className="text-15 text-slate-700 dark:text-slate-200 leading-snug max-w-[300px]">{def.blurb}</p>
            {plan && (
              <p className="text-13 font-semibold text-slate-900 dark:text-white">{fmtWindow(plan.startDay, plan.endDay)}</p>
            )}

            {key === 'category-cap' && (
              <div className="w-full text-left mt-2 flex flex-col gap-3">
                <div>
                  <SectionLabel>Category</SectionLabel>
                  <Button variant="outline" block onClick={() => setPicking(true)}>{cat || 'Choose a category'}</Button>
                </div>
                <div>
                  <SectionLabel>Keep it under, for the week</SectionLabel>
                  <MoneyField value={amt} onChange={moneyChangeHandler(v => setAmount(v))} />
                </div>
              </div>
            )}
            {key === 'keep-month' && (
              <div className="w-full text-left mt-2">
                <SectionLabel>Keep at least this much</SectionLabel>
                <MoneyField value={amt} onChange={moneyChangeHandler(v => setAmount(v))} />
              </div>
            )}
            {key === 'spend-less' && plan && (
              <p className="text-13 text-slate-500 dark:text-slate-400">Last week came to {fmt(plan.params.target)}. Beat it.</p>
            )}
          </div>
        )}
      </Sheet>
      <CategoryPickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        categories={(categories ?? []).filter(c => c.type !== 'inflow')}
        selected={(categories ?? []).find(c => c.name === cat) ?? null}
        onSelect={(/** @type {any} */ c) => setCategory(c.name)}
      />
    </>
  )
}

/** @param {any} def @param {any} ctx @param {Record<string, any>} params */
function safePlan(def, ctx, params) {
  try { return def.plan(ctx, params) } catch { return null }
}

/**
 * One challenge, running or finished: where it stands, its window, and - while
 * it runs - a way to give it up. Giving up asks twice, because it cannot be
 * taken back.
 *
 * @param {{row: any, state: any, onClose: () => void}} props
 */
function RunningSheet({ row, state, onClose }) {
  const { showToast } = useToast()
  const [confirm, setConfirm] = useState(false)
  const close = () => { setConfirm(false); onClose() }
  const running = row?.status === 'active'
  const hue = row ? toneHue(row.def.tone) : undefined

  async function quit() {
    if (!row) return
    if (!confirm) { setConfirm(true); return }
    await state.quitChallenge(row.id)
    showToast(`${row.def.name} ended`)
    close()
  }

  return (
    <Sheet
      open={!!row}
      onClose={close}
      title={row?.def.name ?? ''}
      footer={running ? (
        <div className="flex gap-3">
          <Button variant="dangerTint" className="flex-1" onClick={quit}>{confirm ? 'Yes, give up' : 'Give up'}</Button>
          <Button className="flex-[1.6]" onClick={close}>Keep going</Button>
        </div>
      ) : <Button variant="secondary" block onClick={close}>Done</Button>}
    >
      {row && (
        <div className="flex flex-col items-center text-center gap-2 pb-1">
          <GlassBadge glyph={row.def.glyph} hue={hue ?? '#228BE6'} shape="shield" size={112} locked={!running && row.status !== 'won'} float={running} />
          {/* Running, where it stands is the news. Finished, the verdict is -
              and where it stood when it ended goes under it. */}
          <p className="mt-1 text-28 leading-tight font-bold text-slate-900 dark:text-white tabular-nums">
            {running ? row.judged.progress : row.status === 'quit' ? 'Given up' : row.status === 'won' ? 'Won' : 'Missed'}
          </p>
          {challengeSubject(row) && (
            <p className="-mt-1 max-w-full truncate text-15 font-semibold text-slate-600 dark:text-slate-300">
              On {challengeSubject(row)}
            </p>
          )}
          <p className="text-13 text-slate-500 dark:text-slate-400">
            {running
              ? `${row.judged.settling ? 'Settles tonight' : timeLeft(row, new Date())} · ${fmtWindow(row.startDay, row.endDay)}`
              : `${row.judged.progress} · ${fmtShort(row.finishedAt) || fmtWindow(row.startDay, row.endDay)}`}
          </p>
          {running && (
            <div className="w-full max-w-[300px] mt-2">
              <ProgressBar value={row.judged.target ? (row.judged.value / row.judged.target) * 100 : 0} color={hue} />
            </div>
          )}
          <p className="mt-3 text-15 text-slate-700 dark:text-slate-200 leading-snug max-w-[300px]">{row.def.blurb}</p>
          {confirm && <p className="text-13 text-red-600 dark:text-red-400">It ends here and counts as missed. You can always take it on again.</p>}
        </div>
      )}
    </Sheet>
  )
}
