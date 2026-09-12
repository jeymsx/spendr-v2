import { useState } from 'react'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import ProgressBar from '../../components/ui/ProgressBar'
import IconButton from '../../components/ui/IconButton'
import { fmt } from '../../lib/money'
import {
  fmtDueDate, getStatus, daysToDue, getDueStatus, getInitials, getAvatarColor,
  IconChevronDown, IconEdit, owedOn,
} from './shared'

// ── Debt Card ──────────────────────────────────────────────────────────────────

/**
 * One debt.
 *
 * It stays a card rather than becoming a row, unlike a bill: a debt is
 * partially payable, so it carries a progress bar and three figures that only
 * make sense together - total, paid, remaining. There is no version of that
 * which fits on one line.
 *
 * What changed is the palette. "Record Payment" was text-blue-600 and the
 * progress bar was bg-blue-400 - a hardcoded blue a few degrees off the app's
 * own accent, which is the sort of thing you cannot see until the two sit on
 * one screen. Both are the accent now, so the card belongs to the same product
 * as everything around it.
 */
export function DebtCard({ debt, onEdit, onPayment }) {
  const status    = getStatus(debt.amount, debt.amountPaid)
  const isPaid    = status === 'paid'
  const dueStatus = getDueStatus(debt.dueDate, isPaid)
  const remaining = owedOn(debt)
  const pct       = (debt.amount ?? 0) > 0
    ? Math.min(100, ((debt.amountPaid ?? 0) / debt.amount) * 100)
    : 0

  const avatarColor = getAvatarColor(debt.contact ?? debt.name)
  const initials    = getInitials(debt.contact ?? debt.name)

  const statusConfig = {
    paid:    { label: 'Settled', bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400' },
    partial: { label: 'Partial', bg: 'bg-amber-100 dark:bg-amber-500/15',     text: 'text-amber-700 dark:text-amber-400'     },
    unpaid:  { label: 'Unpaid',  bg: 'bg-slate-100 dark:bg-white/[0.08]',     text: 'text-slate-600 dark:text-slate-300'     },
  }
  const sc = statusConfig[status]

  const dueLabel = fmtDueDate(debt.dueDate)
  const days     = daysToDue(debt.dueDate)
  const dueLabelClass =
    dueStatus === 'overdue' ? 'text-red-500 dark:text-red-400 font-semibold' :
    dueStatus === 'soon'    ? 'text-amber-600 dark:text-amber-400 font-medium' :
    'text-slate-500 dark:text-slate-400'

  /* Unpaid is grey, not red.

     It was bg-red-100/text-red-700, which made every untouched debt look like
     a problem - and then overdue had nothing louder left to say. Red is now
     reserved for the due date actually having passed, so a glance down the
     list separates "not started" from "late", which is the distinction that
     matters. */
  const barColor = isPaid ? 'bg-emerald-500' : dueStatus === 'overdue' ? 'bg-red-500' : 'bg-primary'

  return (
    <Card clip>
      <div className="px-4 pt-4 pb-3.5">
        <div className="flex items-start gap-3">
          <span
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
            style={{ backgroundColor: avatarColor }}
            aria-hidden="true"
          >
            {initials}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[15px] text-slate-800 dark:text-white truncate">
                {debt.contact ?? debt.name}
              </span>
              <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>
                {sc.label}
              </span>
            </div>
            {dueLabel ? (
              <p className={`text-[11.5px] mt-0.5 ${dueLabelClass}`}>
                {/* Same vocabulary as a bill's due label - "9d overdue" -
                    so the two pages read the same. */}
                {dueStatus === 'overdue' ? `${Math.abs(days)}d overdue · ` :
                 days === 0             ? 'Today · ' :
                 days === 1             ? 'Tomorrow · ' :
                 'Due '}
                {dueLabel}
              </p>
            ) : (
              <p className="text-[11.5px] mt-0.5 text-slate-400 dark:text-slate-500">No date set</p>
            )}
          </div>

          <IconButton
            label={`Edit ${debt.contact ?? debt.name}`}
            size="sm"
            onClick={() => onEdit(debt)}
          >
            <IconEdit />
          </IconButton>
        </div>

        <div className="mt-3.5 grid grid-cols-3 gap-1">
          {[
            { label: 'Total',     value: fmt(debt.amount),          color: 'text-slate-800 dark:text-white' },
            { label: 'Paid',      value: fmt(debt.amountPaid ?? 0), color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Remaining', value: fmt(remaining),            color: isPaid ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-white' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className="text-[9.5px] text-slate-500 dark:text-slate-400 font-semibold">{label}</p>
              <p className={`text-[13px] font-bold tabular-nums mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <ProgressBar className="mt-3" value={pct} fillClass={barColor} />

        {debt.notes && (
          <p className="mt-2.5 text-[11.5px] text-slate-500 dark:text-slate-400 line-clamp-2">{debt.notes}</p>
        )}
      </div>

      {!isPaid && (
        <>
          <Divider />
          <button
            onClick={() => onPayment(debt)}
            /* accent-ink, not text-primary. Measured in light mode, the raw
               accent is 2.85:1 here and 13px bold does not qualify for the
               large-text exemption, so it needed the shift. */
            className="w-full py-3 text-[13px] font-semibold accent-ink
              active:bg-primary/[0.06] transition-colors"
          >
            Record a payment
          </button>
        </>
      )}
    </Card>
  )
}

// ── Settled ────────────────────────────────────────────────────────────────────

/**
 * Settled debts, folded away.
 *
 * Collapsed by default and it should be: a settled debt is history, and the
 * point of this page is what is still open. Not deleted either - "did I pay
 * Nica back?" is a real question and the answer lives here.
 */
export function SettledSection({ debts, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  if (!debts.length) return null

  return (
    <section className="mt-7">
      <div className="px-5 mb-2.5">
        <button
          onClick={() => setExpanded(p => !p)}
          className="w-full flex items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <span className="flex-1 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
            Settled
            <span className="ml-1.5 text-slate-400 dark:text-slate-500 tabular-nums font-normal">
              {debts.length}
            </span>
          </span>
          <span className="text-slate-400 dark:text-slate-500">
            <IconChevronDown open={expanded} />
          </span>
        </button>
      </div>

      {expanded && (
        <div className="px-5">
          <Card clip>
            {debts.map((d, i) => (
              <div key={d.id}>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 opacity-70"
                    style={{ backgroundColor: getAvatarColor(d.contact ?? d.name) }}
                    aria-hidden="true"
                  >
                    {getInitials(d.contact ?? d.name)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-slate-600 dark:text-slate-300 truncate">
                      {d.contact ?? d.name}
                    </p>
                    <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
                      {d.type === 'i_owe' ? 'Paid off' : 'Paid back'}
                    </p>
                  </div>
                  <p className="text-[13px] font-semibold tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                    {fmt(d.amount)}
                  </p>
                  <IconButton
                    label={`Edit ${d.contact ?? d.name}`}
                    size="sm"
                    onClick={() => onEdit(d)}
                  >
                    <IconEdit />
                  </IconButton>
                </div>
                {i < debts.length - 1 && <Divider inset="row" />}
              </div>
            ))}
          </Card>
        </div>
      )}
    </section>
  )
}
