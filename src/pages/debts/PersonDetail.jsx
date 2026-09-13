import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { deleteDebtRemote } from '../../lib/sync'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import IconButton from '../../components/ui/IconButton'
import Divider from '../../components/ui/Divider'
import EmptyState from '../../components/ui/EmptyState'
import SwipeConfirm from '../../components/SwipeConfirm'
import SectionLabel from '../../components/ui/SectionLabel'
import { IconChevronLeft, IconChevronRight, IconTrash, IconNotFound } from '../../components/icons'
import { getInitials, getAvatarColor, fmtDueDate } from './shared'
import { byPerson, outstanding, isSettled } from '../../lib/people'
import { fmt } from '../../lib/money'
import { DebtFormSheet } from './DebtFormSheet'
import PersonSheet from './PersonSheet'

/**
 * One person, on a page of their own.
 *
 * ── Why this stopped being a sheet ──
 *
 * A sheet is the right shape for one decision and the wrong shape for a place
 * you go to do several things. Everything a person needs - settling up,
 * correcting an entry, removing one that should not exist, putting somebody
 * to bed once you are square - had to fit above the fold of a panel that also
 * had to stay dismissible, so most of it simply was not there. Deleting an
 * entry meant closing the sheet to open a different one, which is why it read
 * as impossible.
 *
 * A route also gives the back button something to do, survives a refresh, and
 * can be linked to. The sheet is still here, doing the one thing a sheet is
 * good at: settling up.
 *
 * ── Keyed by the person, not by a row id ──
 *
 * The URL carries lib/people.personKey - a trimmed, lowercased name - because
 * a person is not a row. Their balance is made of many rows and any one of
 * them can be deleted, so keying the page on an id would mean a page that
 * disappears when you delete the entry you came here to delete.
 */
export default function PersonDetail() {
  const { key } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { user } = useAuth()

  const [editDebt, setEditDebt] = useState(/** @type {any} */ (null))
  const [formOpen, setFormOpen] = useState(false)
  const [settleOpen, setSettleOpen] = useState(false)
  const [confirmId, setConfirmId] = useState(/** @type {any} */ (null))
  const [busy, setBusy] = useState(false)

  const allDebts = useLiveQuery(() => db.debts.toArray(), [], undefined)
  const loading = allDebts === undefined

  /* Rebuilt from the whole table rather than passed in, so the page is
     correct on a cold load and after every edit made on it. */
  const person = useMemo(() => {
    const wanted = decodeURIComponent(key ?? '')
    return byPerson(allDebts ?? []).find(p => p.key === wanted) ?? null
  }, [allDebts, key])

  const rows = useMemo(() => [...(person?.rows ?? [])].sort(
    (a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))), [person])

  const archived = rows.length > 0 && rows.every(d => d.archivedAt)
  const confirmDebt = rows.find(d => d.id === confirmId) ?? null
  const net = person?.net ?? 0
  const theyOwe = net > 0.005
  const youOwe = net < -0.005
  const square = !theyOwe && !youOwe

  const back = () => navigate('/debts')

  async function handleDelete(debt) {
    setBusy(true)
    try {
      await db.debts.delete(debt.id)
      await deleteDebtRemote(user?.id, debt.id, debt.syncId)
      showToast('Entry deleted')
      setConfirmId(null)
    } catch (e) {
      console.error('[PersonDetail] delete failed:', e)
      showToast('Could not delete that', 'error')
    } finally {
      setBusy(false)
    }
  }

  /** Archiving is per row, because a person is not a record - their rows are.
   *  New activity therefore un-hides them on its own, which is what you want:
   *  somebody you put away in March who borrows again in June is back. */
  async function toggleArchive() {
    setBusy(true)
    try {
      const stamp = archived ? null : new Date().toISOString()
      for (const d of rows) await db.debts.update(d.id, { archivedAt: stamp })
      showToast(archived ? `${person.label} is back` : `${person.label} archived`)
      if (!archived) back()
    } catch (e) {
      console.error('[PersonDetail] archive failed:', e)
      showToast('Could not archive', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="pb-nav" />

  if (!person) {
    return (
      <div className="pb-nav">
        <header className="flex items-center gap-2 px-5 pt-safe-header pb-3">
          <IconButton label="Back to debts" onClick={back}>
            <IconChevronLeft />
          </IconButton>
        </header>
        <EmptyState
          className="mt-8"
          icon={<IconNotFound />}
          title="Nobody here"
          body="Every entry for this person has been deleted."
          action={<Button onClick={back}>Back to debts</Button>}
        />
      </div>
    )
  }

  return (
    <div className="pb-nav">
      <header className="flex items-center gap-2 px-5 pt-safe-header pb-3">
        <IconButton label="Back to debts" onClick={back}>
          <IconChevronLeft />
        </IconButton>
        <h1 className="flex-1 text-center text-base font-semibold text-slate-800 dark:text-white truncate px-1">
          {person.label}
        </h1>
        <Button
          variant="tint"
          size="xs"
          className="shrink-0 px-4"
          onClick={() => { setEditDebt(null); setFormOpen(true) }}
        >
          Add
        </Button>
      </header>

      {/* ── What they come to ── */}
      <section className="px-5 mt-1">
        <Card padding="md">
          <div className="flex flex-col items-center">
            <span
              className={`w-14 h-14 rounded-full flex items-center justify-center
                text-15 font-bold text-white ${square ? 'opacity-45' : ''}`}
              style={{ background: getAvatarColor(person.label) }}
              aria-hidden="true"
            >
              {getInitials(person.label)}
            </span>

            <p className={`mt-3 text-32 leading-none font-semibold tracking-tight tabular-nums ${
              theyOwe ? 'text-emerald-600 dark:text-emerald-400'
              : youOwe ? 'text-amber-600 dark:text-amber-400'
              : 'text-slate-400 dark:text-slate-500'
            }`}>
              {square ? '—' : fmt(Math.abs(net))}
            </p>
            <p className="mt-2 text-13 text-slate-500 dark:text-slate-400">
              {square ? 'All square' : theyOwe ? 'Owes you' : 'You owe them'}
            </p>

            {!square && (
              <Button block className="mt-4" onClick={() => setSettleOpen(true)}>
                {theyOwe ? 'Record a payment' : 'Pay them back'}
              </Button>
            )}
          </div>
        </Card>
      </section>

      {/* ── What the number is made of ──
          A balance you cannot see the parts of is a number you have to trust
          rather than check, and every part of it is editable here. */}
      <section className="mt-6">
        <SectionLabel inset="gutter" gap="loose">
          {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
        </SectionLabel>
        <div className="px-5">
          <Card padding="none" className="overflow-hidden">
            {rows.map((d, i) => {
              const left = outstanding(d)
              const done = isSettled(d)
              const confirming = confirmId === d.id
              return (
                <div key={d.id}>
                  {i > 0 && <Divider />}
                  <div className={`flex items-center gap-1 ${done ? 'opacity-50' : ''}`}>
                    <button
                      type="button"
                      onClick={() => { setEditDebt(d); setFormOpen(true) }}
                      className="flex-1 min-w-0 flex items-center gap-2 py-3 pl-4 text-left
                        active:opacity-60 transition-opacity"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-14 font-medium text-slate-800 dark:text-white truncate">
                          {d.notes || d.name || person.label}
                        </span>
                        <span className="block text-11 text-slate-400 dark:text-slate-500 truncate">
                          {d.type === 'i_owe' ? 'You owe' : 'Owes you'}
                          {done ? ' · settled' : ''}
                          {d.dueDate ? ` · ${fmtDueDate(d.dueDate)}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-14 font-semibold tabular-nums
                        text-slate-700 dark:text-slate-200"
                      >
                        {fmt(done ? (d.amount ?? 0) : left)}
                      </span>
                      <span className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true">
                        <IconChevronRight />
                      </span>
                    </button>

                    <IconButton
                      label={confirming
                        ? 'Cancel deleting this entry'
                        : `Delete ${d.notes || d.name || 'entry'}`}
                      className="shrink-0 mr-2"
                      onClick={() => setConfirmId(confirming ? null : d.id)}
                    >
                      <span className={confirming
                        ? 'text-red-500 dark:text-red-400'
                        : 'text-slate-400 dark:text-slate-500'}
                      >
                        <IconTrash size={17} />
                      </span>
                    </IconButton>
                  </div>
                </div>
              )
            })}
          </Card>

          {/* Under the list rather than in the row. A 52px drag pill does not
              fit beside an amount, and the entry it belongs to is named above
              it - which is also the last chance to notice it is the wrong
              one. Tapping the red bin again backs out. */}
          {confirmDebt && (
            <div className="mt-3">
              <p className="mb-2 text-center text-12 text-slate-500 dark:text-slate-400">
                Delete {confirmDebt.notes || confirmDebt.name || 'this entry'}
                {' · '}{fmt(confirmDebt.amount ?? 0)}
              </p>
              <SwipeConfirm
                tone="danger"
                label="Swipe to delete"
                confirmingLabel="Deleting…"
                busy={busy}
                onConfirm={() => handleDelete(confirmDebt)}
              />
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="mt-2 w-full text-center text-12 text-slate-400 dark:text-slate-500"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Putting somebody away ──
          Below everything, quiet, and reversible. It is filing rather than
          deleting: the entries stay, the person stops taking up a row on a
          page you scan for what still needs doing. */}
      <section className="px-5 mt-6">
        <Button
          block
          variant={archived ? 'secondary' : 'quiet'}
          disabled={busy}
          onClick={toggleArchive}
        >
          {archived ? 'Bring back' : 'Archive'}
        </Button>
        <p className="mt-2 text-center text-11 text-slate-400 dark:text-slate-500">
          {archived
            ? 'Archived, so they are hidden from the debts list.'
            : 'Hides them from the list. Nothing is deleted, and new activity brings them back.'}
        </p>
      </section>

      <DebtFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editDebt={editDebt}
        defaultContact={editDebt ? undefined : person.label}
      />
      <PersonSheet
        person={settleOpen ? person : null}
        onClose={() => setSettleOpen(false)}
        onEditRow={(d) => { setSettleOpen(false); setEditDebt(d); setFormOpen(true) }}
      />
    </div>
  )
}
