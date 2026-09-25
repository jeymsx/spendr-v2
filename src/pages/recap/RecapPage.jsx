import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import useNetWorthNow from '../../hooks/useNetWorthNow'
import useBack from '../../hooks/useBack'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { useTheme } from '../../context/ThemeContext'
import { addMonths, buildRecap, monthKeyOf, monthLabel, parseMonth, recapMonths } from '../../lib/recap'
import SubPage from '../../components/SubPage'
import EmptyState from '../../components/ui/EmptyState'
import RecapStory, { RecapBackdrop } from './RecapStory'

/** "2026-09", and nothing else: a real month, zero-padded. */
const MONTH_PARAM = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * /recap/2026-09, or /recap for the latest month there is one for.
 *
 * Loads what the recap needs, works the month out once (lib/recap.js), and
 * hands the figures to the story. A month that is not over yet, or that has
 * nothing in it, gets a plain page saying which, instead of an empty story.
 *
 * /recap on its own becomes the latest month's address, so what is on screen
 * always has a URL of its own - a reload a month later still shows the month
 * it showed. An address that is not a month at all goes back to /recap.
 */
export default function RecapPage() {
  const { month: param } = useParams()
  const currency = useBaseCurrency()
  const { theme } = useTheme()
  const tone = theme === 'dark' ? 'dark' : 'light'

  const transactions = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const categories = useLiveQuery(() => db.categories.toArray(), [], undefined)
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined)
  const badges = useLiveQuery(() => db.badges.toArray(), [], undefined)
  const meta = useLiveQuery(async () => {
    const [rollover, name] = await Promise.all([db.meta.get('budgetRollover'), db.meta.get('displayName')])
    return { rollover: !!rollover?.value, name: String(name?.value ?? '').trim() }
  }, [], undefined)
  const netWorthNow = useNetWorthNow(accounts, transactions)

  const loaded = [transactions, categories, accounts, badges, meta].every(v => v !== undefined)
  const available = useMemo(() => (transactions ? recapMonths(transactions) : []), [transactions])
  const month = param && MONTH_PARAM.test(param) ? param : null

  const recap = useMemo(() => {
    if (!loaded || !month || !available.includes(month)) return null
    return buildRecap({
      month, transactions, categories, badges, netWorthNow, currency,
      globalRollover: meta.rollover,
    })
  }, [loaded, month, available, transactions, categories, badges, netWorthNow, currency, meta])

  /* Back where you came from - or, opened from a notification with nothing
     behind it, to Insights, where the recap lives. */
  const close = useBack('/insights')

  if (param && !month) return <Navigate to="/recap" replace />
  if (!loaded) return <RecapBackdrop theme={tone} />
  if (!param && available[0]) return <Navigate to={`/recap/${available[0]}`} replace />

  if (!recap) {
    return (
      <SubPage title="Monthly recap" onBack={close}>
        <EmptyState className="mt-10" {...emptyCopy(month)} />
      </SubPage>
    )
  }

  return (
    <RecapStory
      key={recap.month}
      recap={recap}
      currency={currency}
      theme={tone}
      name={meta.name || undefined}
      onClose={close}
    />
  )
}

/**
 * Why there is no story to show: none yet at all, a month still running (or
 * not begun), or a month gone by with nothing logged in it.
 *
 * @param {string|null} month
 * @returns {{title: string, body: string}}
 */
function emptyCopy(month) {
  if (!month) {
    return { title: 'No recap yet', body: 'Your first one is ready on the 1st, once a month has something logged in it.' }
  }
  const now = new Date()
  if (month >= monthKeyOf(now)) {
    const { year, month: m } = parseMonth(addMonths(month, 1))
    const ready = new Date(year, m, 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    return { title: `No recap for ${monthLabel(month, now)} yet`, body: `It will be ready on ${ready}.` }
  }
  return { title: `Nothing to recap for ${monthLabel(month, now)}`, body: 'Nothing was logged that month.' }
}
