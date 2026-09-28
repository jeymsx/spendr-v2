import { useState } from 'react'
import { ListEnd, useInfiniteList } from '../../components/ui/InfiniteList'
import { useNavigate } from 'react-router-dom'
import SubPage from '../../components/SubPage'
import TxDetailSheet from '../../components/TxDetailSheet'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import EmptyState from '../../components/ui/EmptyState'
import SectionLabel from '../../components/ui/SectionLabel'
import { SkeletonList } from '../../components/ui/Skeleton'
import { IconEmptyReceipt } from '../../components/icons'
import { useBack } from '../../hooks/useBack'
import { fmtCompact } from '../../lib/money'
import { txBase } from '../../lib/fxContext'
import { DetailTxRow } from '../accounts/DetailParts'
import { PeriodControls } from './PeriodBar'
import { periodPhrase, usePeriod } from './period'
import { useInsightsData } from './useInsightsData'
import { useArrival } from './zoom'

/**
 * Every expense in the period, biggest first.
 *
 * The overview used to list the top five and stop, so the sixth-biggest
 * purchase of the month was nowhere on the page that is about where the
 * money went. All of them are here, fifty at a time as you scroll
 * (ui/InfiniteList), each opening the same detail sheet the Transactions
 * list does.
 *
 * Refunds are left out: money back is not something you bought.
 */

export default function ExpensesPage() {
  const arrival = useArrival()
  const back = useBack('/insights')
  const navigate = useNavigate()
  const { period } = usePeriod()
  const data = useInsightsData(period)
  const list = data.rankedExpenses
  const periodKey = `${period.range}-${period.month ?? ''}`
  const paged = useInfiniteList(list, { resetKey: periodKey })
  const [selected, setSelected] = useState(/** @type {Record<string, any>|null} */ (null))
  const total = list.reduce((s, t) => s + txBase(t), 0)

  return (
    <SubPage title="Top expenses" onBack={back}>
      <div className={arrival}>
        <PeriodControls className="mb-6" />
        <section className="px-5">
          {data.loading ? <SkeletonList rows={6} /> : !list.length ? (
            <EmptyState icon={<IconEmptyReceipt />} title={`No expenses ${periodPhrase(period)}`} />
          ) : (
            <>
              <SectionLabel gap="loose">
                {list.length} expense{list.length === 1 ? '' : 's'} · {fmtCompact(total)}
              </SectionLabel>
              <Card clip>
                {paged.visible.map((tx, i, rows) => (
                  <div key={tx.id ?? i}>
                    <DetailTxRow tx={tx} accountName={tx.account} onSelect={setSelected} catMap={data.catMap} />
                    {i < rows.length - 1 && <Divider inset="row" />}
                  </div>
                ))}
              </Card>
              <ListEnd list={paged} done={`All ${list.length} expenses`} />
            </>
          )}
        </section>
      </div>

      <TxDetailSheet
        onEdit={(t) => navigate(`/transactions/${t.id}/edit`)}
        open={!!selected}
        onClose={() => setSelected(null)}
        transaction={selected}
        accounts={data.accounts}
        categories={data.categories}
      />
    </SubPage>
  )
}
