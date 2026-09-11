import { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { postRecurringCharge, deleteTxGroup } from '../db/txHelpers'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { deleteRecurringRemote } from '../lib/sync'
import OverdrawWarningSheet from '../components/OverdrawWarningSheet'
import TxConfirmSheet from '../components/TxConfirmSheet'
import { RecurringFormSheet } from './Recurring'
import { IconChevronLeft } from '../components/icons'
import {
  FREQ_LABEL, FREQ_SHORT,
  toMonthlyAmount, billingLine, dueStatus, DUE_TONE, fmtDateFull,
} from '../utils/recurring'
import CategoryGlyph from '../components/CategoryGlyph'

// ── Formatters ─────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _phpFmt.format(Math.abs(n))
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconPause() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 4v16M16 4v16" />
    </svg>
  )
}

function IconPlay() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
    </svg>
  )
}

function IconBolt() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 4.09 12.78A1 1 0 0 0 5 14h6v8l8.91-10.78A1 1 0 0 0 19 10h-6V2Z" />
    </svg>
  )
}

function IconEmptyReceipt() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 3.5h14v17l-2.33-1.6-2.34 1.6-2.33-1.6-2.34 1.6L7.33 18.9 5 20.5Z" />
      <path d="M9 8.5h6M9 12.5h4" />
    </svg>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────────────────

function SectionLabel({ children, right = null }) {
  return (
    <div className="px-5 mb-2.5 flex items-baseline justify-between gap-3">
      <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{children}</p>
      {right && (
        <p className="text-[12px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">{right}</p>
      )}
    </div>
  )
}

function Card({ children, className = '' }) {
  return <div className={`card rounded-2xl overflow-hidden ${className}`}>{children}</div>
}

/**
 * One fact, on its own line.
 *
 * Deliberately not tappable and carrying no chevron, which is the same choice
 * AccountDetail makes: there is exactly one door to editing on this page, the
 * pill in the header. Five rows that all open the same sheet would look like
 * five different destinations.
 */
function DetailRow({ label, value, tone = '', isLast = false }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <p className="text-[13px] text-slate-500 dark:text-slate-400 shrink-0">{label}</p>
        <p className={`text-[14px] font-medium text-right truncate ${tone || 'text-slate-800 dark:text-white'}`}>
          {value}
        </p>
      </div>
      {!isLast && <div className="h-px bg-slate-100 dark:bg-white/[0.06] mx-4" />}
    </>
  )
}

/**
 * One of the two verbs, as a glass tile.
 *
 * The reference pairs "Cancel subscription" with "Split bill" this way, and
 * the shape is doing real work: two tiles side by side read as a choice
 * between equals, where a stacked pair reads as a primary and a fallback.
 * These two genuinely are equals - one changes whether the bill runs, the
 * other settles it now.
 */
function ActionTile({ icon, label, sub, onClick, disabled, tone = 'plain' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'card rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left min-h-[62px]',
        'active:scale-[0.97] transition-transform duration-75',
        disabled ? 'opacity-45' : '',
      ].join(' ')}
    >
      <span className={[
        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
        tone === 'accent'
          ? 'bg-primary/[0.12] text-primary'
          : 'bg-slate-100 dark:bg-white/[0.08] text-slate-500 dark:text-slate-300',
      ].join(' ')}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-800 dark:text-white truncate">{label}</span>
        {sub && (
          <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">{sub}</span>
        )}
      </span>
    </button>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RecurringDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { user } = useAuth()

  const recId = Number(id)

  const [formOpen,  setFormOpen]  = useState(false)
  const [posting,   setPosting]   = useState(false)
  const [confirmPost, setConfirmPost] = useState(false)
  const [toggling,  setToggling]  = useState(false)
  const [overdraw,  setOverdraw]  = useState(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting,  setDeleting]  = useState(false)

  /**
   * undefined means "still loading"; null means "there is no such bill".
   *
   * The distinction needs the `?? null`, because Dexie's get() resolves to
   * undefined for a missing key - the same value useLiveQuery returns before
   * its first result. Without the coalesce a deleted bill would sit on the
   * skeleton forever instead of saying it had gone.
   *
   * The isFinite guard is for /recurring/abc: Dexie throws on an invalid key
   * and useLiveQuery rethrows, so an unparseable URL would crash the app
   * rather than show the not-found state written for exactly that case.
   */
  const rec = useLiveQuery(
    () => (Number.isFinite(recId)
      ? db.recurring.get(recId).then(r => r ?? null)
      : Promise.resolve(null)),
    [recId], undefined,
  )
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const accounts   = useLiveQuery(() => db.accounts.toArray(),   [], [])

  /**
   * Every charge this bill has actually posted.
   *
   * Real history, not a reconstruction: postRecurringCharge stamps each
   * transaction it writes with `recurringId`, so the ledger already knows
   * which charges came from here.
   *
   * `recurringId` is not indexed, so this is a cursor scan of the
   * transactions table. That is fine HERE and would not be on a list - it is
   * one query, on one screen, for one bill, and adding an index would mean a
   * db.version bump for a single detail page.
   */
  const charges = useLiveQuery(
    () => (Number.isFinite(recId)
      ? db.transactions.filter(t => t.recurringId === recId).toArray()
      : Promise.resolve([])),
    [recId], undefined,
  )

  const history = useMemo(() => {
    if (!charges) return null
    return charges
      .slice()
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
  }, [charges])

  const paidTotal = useMemo(
    () => (history ?? []).reduce((s, t) => s + (t.amount ?? 0), 0),
    [history],
  )

  /**
   * "Active since" comes from the FIRST posted charge, not from a createdAt
   * column.
   *
   * A local createdAt would have been easier and would have been a quiet lie:
   * recurringToRow does not push it, so it would vanish on a fresh device
   * while the bill itself came back intact. The first charge is synced data,
   * so this figure survives - and it only appears once there is history,
   * which is honest. Before the first charge the bill has not been active
   * since anything.
   */
  const activeSince = useMemo(() => {
    if (!history?.length) return null
    const first = history[history.length - 1]
    return first?.date ? fmtDateFull(String(first.date).slice(0, 10)) : null
  }, [history])

  const cat  = useMemo(() => (categories ?? []).find(c => c.name === rec?.category), [categories, rec])
  const acct = useMemo(() => (accounts ?? []).find(a => a.name === rec?.account), [accounts, rec])
  const due  = rec ? dueStatus(rec.nextDate) : null
  const monthly = rec ? toMonthlyAmount(rec.amount, rec.frequency) : 0

  const back = useCallback(() => navigate('/recurring'), [navigate])

  async function handlePost({ force = false } = {}) {
    if (!rec) return
    setConfirmPost(false)
    setPosting(true)
    try {
      const { tx } = await postRecurringCharge(rec, { allowOverdraw: force })
      /* Undo, because a posted bill moves three things at once - a
         transaction appears, the account balance drops, and the bill's due
         date jumps a period - and finding all three to put back by hand is
         not a reasonable ask of someone who tapped the wrong row.

         deleteTxGroup does exactly that reversal and already did before this
         existed; it is what deleting the charge from history runs. It also
         writes a sync tombstone, so an undone post does not come back on the
         next pull.

         runAction in ToastContext nulls its own ref and dismisses before
         calling, so this cannot fire twice and double-credit the balance. */
      showToast(`${rec.name} posted`, 'success', tx ? {
        actionLabel: 'Undo',
        onAction: async () => {
          try {
            await deleteTxGroup([tx])
            showToast('Post undone')
          } catch (err) {
            console.error('[RecurringDetail] undo post failed:', err)
            showToast('Could not undo', 'error')
          }
        },
      } : {})
    } catch (e) {
      if (e?.name === 'OverdrawError') {
        setOverdraw({ accountName: e.account, balance: e.balance, amount: e.amount })
        return
      }
      console.error('[RecurringDetail] post failed:', e)
      showToast('Failed to post', 'error')
    } finally {
      setPosting(false)
    }
  }

  async function handleToggle() {
    if (!rec) return
    setToggling(true)
    try {
      await db.recurring.update(rec.id, { active: !rec.active })
    } catch (e) {
      console.error('[RecurringDetail] toggle failed:', e)
      showToast('Failed to update', 'error')
    } finally {
      setToggling(false)
    }
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    try {
      await db.recurring.delete(recId)
      await deleteRecurringRemote(user?.id, recId)
      showToast('Bill deleted')
      back()
    } catch (e) {
      console.error('[RecurringDetail] delete failed:', e)
      showToast('Failed to delete', 'error')
      setDeleting(false)
    }
  }

  // Loading, and gone. Deleting from the edit sheet lands on the second of
  // these, and so does a stale link, so both have to be real states.
  if (rec === undefined) {
    return (
      <div className="px-5 pt-safe-header">
        <div className="h-9 w-9 rounded-2xl bg-slate-100 dark:bg-white/[0.05] animate-pulse" />
        <div className="mt-6 h-24 rounded-2xl bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
        <div className="mt-3 h-16 rounded-2xl bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
      </div>
    )
  }

  if (!rec) {
    return (
      <div className="px-5 pt-safe-header">
        <button
          onClick={back}
          className="w-9 h-9 rounded-full flex items-center justify-center
            bg-white dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/[0.09]
            text-slate-600 dark:text-slate-300 shadow-sm
            active:scale-90 transition-transform duration-75"
          aria-label="Back to bills"
        >
          <IconChevronLeft />
        </button>
        <div className="py-20 text-center">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Bill not found</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">It may have been deleted.</p>
          <button
            onClick={back}
            className="mt-5 px-4 py-2 rounded-xl text-sm font-semibold text-primary
              bg-primary/[0.08] dark:bg-primary/[0.12] active:bg-primary/[0.15] transition-colors"
          >
            Back to Bills
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-nav">
      {/* ── Header: back, centred name, one door to editing ── */}
      <header className="flex items-center gap-2 px-4 pt-safe-header pb-3">
        <button
          onClick={back}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0
            bg-white dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/[0.09]
            text-slate-600 dark:text-slate-300 shadow-sm
            active:scale-90 transition-transform duration-75"
          aria-label="Back to bills"
        >
          <IconChevronLeft />
        </button>

        <h1 className="flex-1 text-center text-base font-semibold text-slate-800 dark:text-white truncate px-1">
          {rec.name}
        </h1>

        <button
          onClick={() => setFormOpen(true)}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0
            text-primary bg-primary/[0.08] dark:bg-primary/[0.15]
            active:bg-primary/[0.15] transition-colors"
        >
          Edit
        </button>
      </header>

      {/* ── The bill itself ──
          Icon, name and price together, the way the reference leads with the
          service rather than with a chart. The amount is the largest thing on
          the card because it is the question you opened this page to answer. */}
      <section className="px-5 mt-1">
        <Card className="px-4 py-4">
          <div className="flex items-center gap-3.5">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-[26px] shrink-0"
              style={{ backgroundColor: (cat?.color ?? '#64748b') + '20' }}
            >
              <CategoryGlyph cat={cat} size={26} emoji="🔁" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-slate-900 dark:text-white truncate">
                {rec.name}
              </p>
              <p className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
                {fmt(rec.amount)}
                <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400 ml-1">
                  /{FREQ_SHORT[rec.frequency] ?? rec.frequency}
                </span>
              </p>
              {/* Paused says so here rather than only in a toggle further
                  down: it changes what every date on this page means. */}
              {!rec.active ? (
                <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-0.5 font-medium">
                  Paused
                </p>
              ) : activeSince ? (
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Active since {activeSince}
                </p>
              ) : null}
            </div>
          </div>
        </Card>

        {/* The billing line, outside the card and centred, so it reads as a
            caption on the whole bill rather than one more field in it. */}
        <p className={`mt-3 text-center text-[13px] ${
          rec.active ? (DUE_TONE[due?.tone] ?? 'text-slate-500 dark:text-slate-400')
                     : 'text-slate-400 dark:text-slate-500'
        }`}>
          {billingLine(rec.nextDate)}
        </p>
      </section>

      {/* ── The two verbs ── */}
      <section className="px-5 mt-4 grid grid-cols-2 gap-3">
        {/* No sub-labels. They read "Stop reminders" and the amount - one
            explaining a word that needs no explanation, the other repeating a
            figure from the card directly above. */}
        <ActionTile
          icon={rec.active ? <IconPause /> : <IconPlay />}
          label={rec.active ? 'Pause' : 'Resume'}
          onClick={handleToggle}
          disabled={toggling}
        />
        <ActionTile
          icon={<IconBolt />}
          label={posting ? 'Posting…' : 'Post now'}
          onClick={() => setConfirmPost(true)}
          disabled={posting}
          tone="accent"
        />
      </section>

      {/* ── The facts ── */}
      <section className="mt-7">
        <SectionLabel>Details</SectionLabel>
        <div className="px-5">
          <Card>
            <DetailRow label="Account"  value={rec.account || '—'} />
            <DetailRow label="Category" value={rec.category || '—'} />
            {/* Just "Monthly". It read "Monthly · every month", which says
                the same thing twice - the label is already "Repeats". */}
            <DetailRow label="Repeats" value={FREQ_LABEL[rec.frequency] ?? rec.frequency} />
            <DetailRow
              label="Next charge"
              value={rec.nextDate ? fmtDateFull(rec.nextDate) : 'No date set'}
              tone={rec.active && due?.tone === 'late' ? 'text-red-500 dark:text-red-400' : ''}
            />
            {/* Only where it says something the amount above does not. On a
                monthly bill this row would repeat the hero verbatim. */}
            {rec.frequency !== 'monthly' && (
              <DetailRow label="Monthly cost" value={`${fmt(monthly)} /mo`} />
            )}
            <DetailRow
              label="Status"
              value={rec.active ? 'Active' : 'Paused'}
              tone={rec.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}
              isLast
            />
          </Card>
        </div>
      </section>

      {/* ── What it has actually cost ── */}
      <section className="mt-7">
        <SectionLabel right={history?.length ? fmt(paidTotal) : undefined}>
          Billing history
        </SectionLabel>
        <div className="px-5">
          <Card>
            {history === null ? (
              <div className="px-4 py-6">
                <div className="h-4 w-32 rounded bg-slate-100 dark:bg-white/[0.05] animate-pulse" />
              </div>
            ) : history.length === 0 ? (
              <div className="px-5 py-9 text-center">
                <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center
                  bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500">
                  <IconEmptyReceipt />
                </div>
                <p className="mt-3 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
                  Nothing charged yet
                </p>
                <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                  Charges appear here once posted.
                </p>
              </div>
            ) : (
              /* Six, not all of them. Past half a year the list stops being a
                 record you read and becomes one you scroll, and Transactions
                 is already the place for that. */
              history.slice(0, 6).map((t, i, arr) => (
                <DetailRow
                  key={t.id ?? t.txId ?? i}
                  label={new Date(t.date).toLocaleDateString('en-PH', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                  value={fmt(t.amount)}
                  isLast={i === arr.length - 1 && history.length <= 6}
                />
              ))
            )}
            {history && history.length > 6 && (
              <div className="px-4 py-3">
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  {history.length - 6} earlier
                </p>
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* ── Delete ──
          Bottom of the page, two taps, and never a tile beside the other
          actions: it is not a peer of Pause. */}
      <section className="px-5 mt-7">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className={[
            'w-full py-3 rounded-2xl text-[14px] font-semibold transition-colors duration-150',
            confirmDel
              ? 'bg-red-500 text-white'
              : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/[0.12]',
          ].join(' ')}
        >
          {deleting ? 'Deleting…' : confirmDel ? 'Tap again to delete' : 'Delete this bill'}
        </button>
        {confirmDel && !deleting && (
          <button
            onClick={() => setConfirmDel(false)}
            className="w-full mt-2 py-2 text-[13px] font-medium text-slate-500 dark:text-slate-400"
          >
            Cancel
          </button>
        )}
      </section>

      <RecurringFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editRec={rec}
        showDelete={false}
        categories={categories ?? []}
        accounts={accounts ?? []}
      />

      {/* The same sheet the expense form uses to review a transaction before
          saving it, which is what this is - so posting a bill and saving an
          expense are one habit rather than two. onSaveTemplate is left off,
          which is what hides its save-as-template row: a bill is already the
          template.

          It exists because Post now was a single tap that wrote a
          transaction, moved a balance and advanced a due date, sitting
          directly under a row you might have opened by mistake. */}
      <TxConfirmSheet
        open={confirmPost}
        onClose={() => setConfirmPost(false)}
        onConfirm={() => handlePost()}
        saving={posting}
        type="expense"
        amount={rec.amount}
        description={rec.name}
        category={cat}
        account={acct}
        swipeToConfirm
        confirmLabel="Swipe to post bill"
        savingLabel="Posting…"
      />

      <OverdrawWarningSheet
        open={!!overdraw}
        onClose={() => setOverdraw(null)}
        onSaveAnyway={() => { setOverdraw(null); handlePost({ force: true }) }}
        accountName={overdraw?.accountName}
        balance={overdraw?.balance}
        amount={overdraw?.amount}
      />
    </div>
  )
}
