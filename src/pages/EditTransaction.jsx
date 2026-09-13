import { useParams, useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { isRefund } from '../lib/txMoney'
import AddExpense from './AddExpense'
import AddInflow from './AddInflow'
import Transfer from './Transfer'
import EmptyState from '../components/ui/EmptyState'
import Button from '../components/ui/Button'
import IconButton from '../components/ui/IconButton'
import { IconChevronLeft, IconNotFound } from '../components/icons'

/**
 * Editing a transaction in the form that created it.
 *
 * ── Why not the sheet it used to be ──
 *
 * The detail sheet grew an edit mode of five rows: amount, note, category,
 * account, date. That is a subset of the form, chosen by what fits a panel
 * rather than by what a transaction has - so the category came as a plain
 * list where the form has a rail of glyphs, the account as a name where the
 * form has the card, and anything the sheet had no room for could not be
 * changed at all. Two ways to describe one transaction, and the poorer one
 * was the only way to correct a mistake.
 *
 * So this is a route that loads the row and hands it to the real form. The
 * forms gain one prop and lose nothing: without `editTx` they are exactly
 * what they were.
 *
 * ── What an edit deliberately cannot reach ──
 *
 * Three controls do not appear, and it is the same reason each time: they
 * make ROWS, not fields.
 *
 *   an installment term writes one charge per month
 *   a divide writes a leg per category and a receivable per person
 *   a transfer fee writes a second expense
 *
 * "Change 6 months into 3" is deleting three charges, not editing this one.
 * Those all stay creatable, and a plan can be deleted as a unit and re-entered
 * - deleteTxGroup already takes the whole thing.
 *
 * ── And two rows it refuses outright ──
 *
 * A REFUND is a negative expense. The form has no way to express one and
 * would save it back as a positive, turning money that came in into money
 * that went out. It sends you back rather than pretending.
 *
 * Its TYPE cannot change either: an expense cannot become an inflow here,
 * because which form you are looking at is chosen by the type. Delete and
 * re-enter, which is one gesture more and no ambiguity.
 */
export default function EditTransaction() {
  const { id } = useParams()
  const navigate = useNavigate()

  /* `?? null` matters: Dexie resolves a MISS to undefined, and undefined is
     also what this starts as while the read is in flight. Without it a
     deleted row and a row still loading are the same value, so the page sits
     blank for ever instead of saying it is gone. */
  const tx = useLiveQuery(
    async () => (id ? (await db.transactions.get(Number(id))) ?? null : null),
    [id],
    undefined,
  )

  // Still reading. A flash of "not found" over a row that exists is worse
  // than a blank moment.
  if (tx === undefined) return <div className="pb-nav" />

  const gone = !tx
  const unsupported = !!tx && (isRefund(tx) || !['expense', 'inflow', 'transfer'].includes(tx.type))

  if (gone || unsupported) {
    return (
      <div className="pb-nav">
        <header className="flex items-center gap-2 px-5 pt-safe-header pb-3">
          <IconButton label="Back" onClick={() => navigate(-1)}>
            <IconChevronLeft />
          </IconButton>
        </header>
        <EmptyState
          className="mt-8"
          icon={<IconNotFound />}
          title={gone ? 'Transaction not found' : 'This one cannot be edited'}
          body={gone
            ? 'It may have been deleted.'
            : 'A refund is money coming back, and the form only knows how to record money going out. Delete it and record it again.'}
          action={<Button onClick={() => navigate(-1)}>Go back</Button>}
        />
      </div>
    )
  }

  /* onSaved and onCancel both go back rather than to the dashboard: you came
     here from a row, and that row is where you expect to land. */
  const done = () => navigate(-1)

  if (tx.type === 'inflow')   return <AddInflow  editTx={tx} onSaved={done} onCancel={done} />
  if (tx.type === 'transfer') return <Transfer   editTx={tx} onSaved={done} onCancel={done} />
  return <AddExpense editTx={tx} onSaved={done} onCancel={done} />
}
