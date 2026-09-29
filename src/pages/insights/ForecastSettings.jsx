import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClockRewind, CoinsHand, Flag05, LineChartUp01, PiggyBank01 } from '@untitledui/icons'
import SubPage from '../../components/SubPage'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import Segmented from '../../components/ui/Segmented'
import Switch from '../../components/ui/Switch'
import MoneyField from '../../components/ui/MoneyField'
import StatTrio from '../../components/ui/StatTrio'
import RollingNumber from '../../components/ui/RollingNumber'
import { SkeletonHero } from '../../components/ui/Skeleton'
import CategoryGlyph from '../../components/CategoryGlyph'
import { useBack } from '../../hooks/useBack'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import useForecast, { saveForecastSettings } from '../../hooks/useForecast'
import db from '../../db/db'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { fmt, fmtCompact } from '../../lib/money'
import { INCOME_LOOKBACKS, rhythmLabel, streamDates } from '../../lib/incomeStreams'
import { dayName } from '../../lib/dayWords'
import { moneyChangeHandler, numToMoneyStr, parseMoney } from '../../utils/moneyInput'
import { RowChevron, RowDivider, RowIcon, SectionCard, SectionHeader, SettingsRow } from '../settings/shared'
import FloorSheet from './FloorSheet'

/** An Untitled UI glyph at the settings rows' size and weight. @param {import('react').ComponentType<any>} Cmp */
const ico = (Cmp) => <Cmp size={18} strokeWidth={1.8} aria-hidden="true" />

const DAY = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })

const INCOME_HINT = {
  recurring: 'Only pay you have set up on Recurring.',
  history: 'Pay found in what you have logged. Recurring still brings your bills.',
  both: 'Pay on Recurring, plus pay found in what you have logged.',
}

/**
 * How the forecast is worked out, and what its page shows.
 *
 * Every change saves as it is made and shows at once in the three figures
 * at the top, which are the forecast itself, worked out with these settings -
 * so a switch is never a promise you have to go back to the chart to check.
 * The same settings drive Home's "Next 30 days" and the reminders that warn
 * you are running short (lib/forecastSettings.js).
 */
export default function ForecastSettings() {
  const back = useBack('/insights/forecast')
  const navigate = useNavigate()
  const base = useBaseCurrency()
  const { forecast, settings, floor, recurring } = useForecast(30)
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const catMap = useMemo(() => Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])
  const [floorOpen, setFloorOpen] = useState(false)
  // A found pay, opened: what it is, and the way to say it is not pay.
  const [picked, setPicked] = useState(/** @type {import('../../lib/incomeStreams').IncomeStream|null} */ (null))

  /* The set figure is typed, so it is kept here as text and saved a moment
     after the typing stops, and when the field is left - not per keystroke,
     which would rebuild the whole forecast for every digit. */
  const [custom, setCustom] = useState('')
  const [typed, setTyped] = useState(false)
  useEffect(() => {
    if (typed) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustom(settings.customDaily > 0 ? numToMoneyStr(settings.customDaily) : '')
  }, [settings.customDaily, typed])
  useEffect(() => {
    if (!typed) return
    const t = setTimeout(() => saveForecastSettings({ customDaily: parseMoney(custom) || 0 }), 500)
    return () => clearTimeout(t)
  }, [custom, typed])

  const set = (/** @type {Partial<import('../../lib/forecastSettings').ForecastSettings>} */ patch) => {
    saveForecastSettings(patch).catch(e => console.error('[ForecastSettings] save failed:', e))
  }

  if (!forecast) {
    return (
      <SubPage title="Forecast settings" onBack={back}>
        <SkeletonHero className="mb-6" />
      </SubPage>
    )
  }

  const history = settings.income !== 'recurring'
  const payAhead = forecast.events
    .filter(e => e.kind === 'income' && e.counted)
    .reduce((s, e) => s + e.amount, 0)
  const tight = forecast.lowest
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const spendHint = settings.spend === 'custom'
    ? 'A day, on top of your bills. Leave it empty to count bills only.'
    : settings.spend === 'cautious'
      ? (forecast.cautiousDaily ? `${fmt(forecast.cautiousDaily, base)} a day, from a busier week than usual.` : 'Needs a few weeks of spending first.')
      : (forecast.typicalSpend ? `${fmt(forecast.typicalSpend, base)} a day, from your usual week.` : 'Needs a few weeks of spending first.')

  return (
    <SubPage title="Forecast settings" onBack={back}>
      {/* ── What these settings give, right now ── */}
      <section className="px-5">
        <Card padding="md">
          <StatTrio items={[
            { label: 'Safe to spend', value: <RollingNumber id="fs:safe" value={forecast.safeToSpend} format={v => fmtCompact(v, base)} /> },
            {
              label: 'Tightest day',
              value: tight.iso === forecast.days[0]?.iso ? 'Today' : DAY.format(tight.date),
              tone: tight.balance < 0 ? 'text-red-500 dark:text-red-400' : undefined,
            },
            { label: 'Pay ahead', value: payAhead > 0 ? <RollingNumber id="fs:pay" value={payAhead} format={v => `+${fmtCompact(v, base)}`} /> : 'None' },
          ]} />
        </Card>
        <p className="mt-2 text-center text-12 text-slate-500 dark:text-slate-400">
          The next 30 days, with the settings below
        </p>
      </section>

      {/* ── Pay ── */}
      <div className="mt-7">
        <SectionHeader>Pay</SectionHeader>
        <div className="mx-5">
          <Segmented
            options={[
              { value: 'recurring', label: 'Recurring' },
              { value: 'history', label: 'History' },
              { value: 'both', label: 'Both' },
            ]}
            value={settings.income}
            onChange={(/** @type {any} */ v) => set({ income: v })}
          />
          <p className="mt-2 px-1 text-12 text-slate-500 dark:text-slate-400">{INCOME_HINT[settings.income]}</p>
        </div>

        {history && (
          <>
            <p className="mt-5 mb-2 px-5 text-12 font-semibold text-slate-500 dark:text-slate-400">Found in your history</p>
            <SectionCard>
              {forecast.streams.length === 0 ? (
                <p className="px-4 py-4 text-13 text-slate-500 dark:text-slate-400">
                  {/* Only "nothing yet" when nothing was found: pay on Recurring, or
                      pay you said is not pay, was found and is simply counted elsewhere. */}
                  {forecast.coveredStreams?.length
                    ? 'Your pay is on Recurring, so it is counted from there.'
                    : forecast.hiddenStreams.length
                      ? 'Nothing else here keeps a rhythm.'
                      : 'Nothing regular yet. Pay that keeps arriving on the same days shows up here after a few paydays.'}
                </p>
              ) : forecast.streams.map((s, i) => (
                <div key={s.key}>
                  {i > 0 && <RowDivider />}
                  <StreamRow
                    stream={s} cat={s.category ? catMap[s.category] : null} currency={base} today={today}
                    onOpen={() => setPicked(s)}
                  />
                </div>
              ))}
            </SectionCard>
            {/* Found pay you said is not pay: listed apart, one tap from counting again. */}
            {forecast.hiddenStreams.length > 0 && (
              <>
                <p className="mt-4 mb-2 px-5 text-12 font-semibold text-slate-500 dark:text-slate-400">Not counted</p>
                <SectionCard>
                  {forecast.hiddenStreams.map((s, i) => (
                    <div key={s.key}>
                      {i > 0 && <RowDivider />}
                      <SettingsRow
                        label={s.name}
                        sublabel={`${rhythmLabel(s)}, ${fmt(s.amount, base)}`}
                        right={
                          <Button variant="tint" size="xs" className="px-3.5"
                            onClick={() => set({ ignored: settings.ignored.filter(k => k !== s.key) })}>
                            Count it
                          </Button>
                        }
                      />
                    </div>
                  ))}
                </SectionCard>
              </>
            )}
            {settings.income === 'both' && recurring.some(r => r?.active !== false && r?.type === 'inflow') && (
              <p className="mt-2 px-5 text-12 text-slate-500 dark:text-slate-400">Pay already on Recurring is left out here, so it is not counted twice.</p>
            )}

            <p className="mt-5 mb-2 px-5 text-12 font-semibold text-slate-500 dark:text-slate-400">Look back</p>
            <div className="mx-5">
              <Segmented
                options={INCOME_LOOKBACKS.map(l => ({ value: l.key, label: l.label }))}
                value={settings.lookback}
                onChange={(/** @type {any} */ v) => set({ lookback: v })}
              />
            </div>

            <div className="mt-4">
              <SectionCard>
                <SettingsRow
                  iconEl={<RowIcon color="green">{ico(CoinsHand)}</RowIcon>}
                  label="Occasional income"
                  sublabel={forecast.occasionalPerDay > 0
                    ? `About ${fmt(forecast.occasionalPerDay, base)} a day, spread out`
                    : 'Gifts, sales and one-offs, spread out'}
                  right={<Switch on={settings.occasional} onChange={v => set({ occasional: v })} label="Occasional income" />}
                />
              </SectionCard>
            </div>
          </>
        )}
      </div>

      {/* ── Everyday spending ── */}
      <div className="mt-7">
        <SectionHeader>Everyday spending</SectionHeader>
        <div className="mx-5">
          <Segmented
            options={[
              { value: 'typical', label: 'Usual' },
              { value: 'cautious', label: 'Cautious' },
              { value: 'custom', label: 'Set' },
            ]}
            value={settings.spend}
            onChange={(/** @type {any} */ v) => set({ spend: v })}
          />
          {settings.spend === 'custom' && (
            <MoneyField
              className="mt-3"
              /* Empty, not "0", when there is nothing in it: the hint says leave it
                 empty, and the field snapped back to 0 under the backspace. */
              value={custom === '0' ? '' : custom}
              currency={base}
              aria-label="Everyday spending per day"
              onChange={moneyChangeHandler((/** @type {string} */ v) => { setTyped(true); setCustom(v) })}
              onBlur={() => { if (typed) saveForecastSettings({ customDaily: parseMoney(custom) || 0 }) }}
            />
          )}
          <p className="mt-2 px-1 text-12 text-slate-500 dark:text-slate-400">{spendHint}</p>
        </div>
      </div>

      {/* ── What it starts from ── */}
      <div className="mt-7">
        <SectionHeader>Balance</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="teal">{ico(PiggyBank01)}</RowIcon>}
            label="Count savings"
            sublabel={settings.savings ? 'Savings accounts are in the start' : 'Spending accounts only'}
            right={<Switch on={settings.savings} onChange={v => set({ savings: v })} label="Count savings" />}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="amber">{ico(Flag05)}</RowIcon>}
            label="Floor"
            sublabel="The least you want to keep"
            right={
              <div className="flex items-center gap-2.5">
                <span className="text-13 font-medium tabular-nums text-slate-500 dark:text-slate-400">
                  {floor > 0 ? fmt(floor, base) : 'None'}
                </span>
                <RowChevron />
              </div>
            }
            onTap={() => setFloorOpen(true)}
          />
        </SectionCard>
      </div>

      {/* ── How the chart draws it ── */}
      <div className="mt-7 mb-6">
        <SectionHeader>Chart</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="blue">{ico(LineChartUp01)}</RowIcon>}
            label="Likely range"
            sublabel={settings.spend === 'custom' ? 'Not with a set figure' : 'A quieter or busier week'}
            right={<Switch on={settings.band && settings.spend !== 'custom'} disabled={settings.spend === 'custom'} onChange={v => set({ band: v })} label="Likely range" />}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="violet">{ico(ClockRewind)}</RowIcon>}
            label="Recent days"
            sublabel="The weeks just before today"
            right={<Switch on={settings.past} onChange={v => set({ past: v })} label="Recent days" />}
          />
        </SectionCard>
        <p className="mt-3 px-5 text-12 text-slate-500 dark:text-slate-400">
          Home&apos;s Next 30 days and the running-short reminders use these too.
        </p>
      </div>

      <FloorSheet open={floorOpen} onClose={() => setFloorOpen(false)} floor={floor} currency={base} />

      {/* One found pay: where it comes from, and the way out for something
          that keeps a rhythm but is not yours to count on. */}
      <Sheet
        open={!!picked}
        onClose={() => setPicked(null)}
        title={picked?.name ?? ''}
        footer={picked && (
          <div className="space-y-2.5">
            {picked.category && (
              <Button block variant="secondary" onClick={() => {
                const cat = picked.category ?? ''
                setPicked(null)
                navigate(`/categories/${encodeURIComponent(cat)}`)
              }}>
                See its entries
              </Button>
            )}
            <Button block variant="dangerTint" onClick={() => {
              set({ ignored: [...settings.ignored, picked.key] })
              setPicked(null)
            }}>
              This isn&apos;t pay
            </Button>
          </div>
        )}
      >
        {picked && (
          <p className="text-13 text-slate-500 dark:text-slate-400">
            {rhythmLabel(picked)}, about {fmt(picked.amount, base)} each time, read from {picked.count} payments
            {picked.account ? ` into ${picked.account}` : ''}. If it is not money you can count on, leave it out
            and the forecast stops expecting it.
          </p>
        )}
      </Sheet>
    </SubPage>
  )
}

/**
 * One pay found in the history: what it is called, its rhythm, a typical
 * payment and when the next is expected. Its own row rather than a settings
 * row, because the rhythm needs the room to wrap - "Twice a month, the 15th
 * and month end" is the whole point of the row and must not be cut off.
 *
 * @param {{stream: import('../../lib/incomeStreams').IncomeStream, cat: Record<string, any>|null,
 *          currency: string, today: Date, onOpen: (() => void)|null}} props
 */
function StreamRow({ stream, cat, currency, today, onOpen }) {
  const next = streamDates(stream, new Date(today.getFullYear(), today.getMonth() + 3, today.getDate()))
    .find(x => x.date >= today)
  const Wrap = onOpen ? 'button' : 'div'
  return (
    <Wrap
      {...(onOpen ? { type: 'button', onClick: onOpen } : {})}
      className={`w-full flex items-center gap-4 px-4 py-3.5 text-left select-none transition-colors${onOpen ? ' active:bg-slate-50 dark:active:bg-white/[0.04]' : ''}`}
    >
      <span
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: (cat?.color ?? '#22c55e') + '1f' }}
        aria-hidden="true"
      >
        <CategoryGlyph cat={cat} size={17} emoji="💰" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-slate-800 dark:text-white truncate">{stream.name}</span>
        <span className="block mt-0.5 text-xs text-slate-500 dark:text-slate-400">{rhythmLabel(stream)}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{fmt(stream.amount, currency)}</span>
        {next && (
          <span className="block mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {/* "Today" on payday, not "Next Sep 30" on the 30th. */}
            {['Today', 'Tomorrow'].includes(dayName(next.date, today)) ? dayName(next.date, today) : `Next ${DAY.format(next.date)}`}
          </span>
        )}
      </span>
    </Wrap>
  )
}
