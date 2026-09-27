import SubPage from '../../components/SubPage'
import EmptyState from '../../components/ui/EmptyState'
import SectionLabel from '../../components/ui/SectionLabel'
import { SkeletonList } from '../../components/ui/Skeleton'
import { IconEmptyLedger } from '../../components/icons'
import { useBack } from '../../hooks/useBack'
import { fmtCompact } from '../../lib/money'
import { PeriodControls } from './PeriodBar'
import { periodPhrase, usePeriod } from './period'
import { AccountBreakdown } from './Tables'
import { useInsightsData } from './useInsightsData'
import { useArrival } from './zoom'

/**
 * Which accounts the period's spending came out of, and how much of it each
 * paid. Each account opens its own page, where its balance and history are.
 */
export default function AccountsPage() {
  const arrival = useArrival()
  const back = useBack('/insights')
  const { period } = usePeriod()
  const data = useInsightsData(period)
  const rows = data.accountBreakdown
  const total = rows.reduce((s, a) => s + a.value, 0)

  return (
    <SubPage title="By account" onBack={back}>
      <div className={arrival}>
        <PeriodControls className="mb-6" />
        {data.loading ? <div className="px-5"><SkeletonList rows={3} /></div> : !rows.length ? (
          <EmptyState icon={<IconEmptyLedger />} title={`No expenses ${periodPhrase(period)}`} />
        ) : (
          <section>
            <SectionLabel inset="gutter" gap="loose">
              Spent from {rows.length} account{rows.length === 1 ? '' : 's'} · {fmtCompact(total)}
            </SectionLabel>
            <AccountBreakdown data={rows} total={total} animKey={`${period.range}-${period.month ?? ''}`} />
          </section>
        )}
      </div>
    </SubPage>
  )
}
