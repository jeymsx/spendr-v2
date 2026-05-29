import { useMemo } from 'react'

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

function fmtTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function fmtGroupDate(dateKey) {
  if (!dateKey) return ''
  const d = new Date(dateKey + 'T00:00:00')
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (d.getTime() === now.getTime())  return 'Today'
  if (d.getTime() === yest.getTime()) return 'Yesterday'
  const isThisYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric',
    ...(isThisYear ? {} : { year: 'numeric' }),
  })
}

const AMOUNT_COLOR = {
  expense:  { cls: 'text-red-500 dark:text-red-400',         sign: '−' },
  inflow:   { cls: 'text-emerald-600 dark:text-emerald-400', sign: '+' },
  transfer: { cls: 'text-blue-500 dark:text-blue-400',       sign: ''  },
}

const DOT_COLOR = {
  expense:  'bg-red-400',
  inflow:   'bg-emerald-400',
  transfer: 'bg-blue-400',
}

const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOW_LABELS = ['Mo','Tu','We','Th','Fr','Sa','Su']

function TxRow({ tx, catMap, onClick }) {
  const cat = catMap[tx.category]
  const { cls, sign } = AMOUNT_COLOR[tx.type] ?? AMOUNT_COLOR.expense
  return (
    <button
      onClick={() => onClick(tx)}
      className="w-full flex items-center gap-3 px-4 py-3 text-left
        active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
    >
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-[18px]"
        style={{ backgroundColor: (cat?.color ?? '#2D9DFF') + '22' }}
      >
        {cat?.icon ?? '💸'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate leading-snug">
          {tx.description || (tx.type === 'transfer' ? `Transfer to ${tx.toAccount ?? ''}` : tx.category) || '—'}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
          {tx.type === 'transfer'
            ? `${tx.fromAccount ?? ''} → ${tx.toAccount ?? ''}`
            : (tx.account ?? '')}
          {cat && tx.type !== 'transfer' && (
            <span className="ml-1.5 text-slate-300 dark:text-slate-600">· {cat.name}</span>
          )}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-[13px] font-bold tabular-nums ${cls}`}>
          {sign}{fmt(tx.amount)}
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{fmtTime(tx.date)}</p>
      </div>
    </button>
  )
}

export default function CalendarView({
  transactions,
  year, month,
  onPrevMonth, onNextMonth, onGoToNow,
  selectedDate, onSelectDate,
  catMap,
  onTxClick,
}) {
  const dayMap = useMemo(() => {
    const map = {}
    transactions.forEach(tx => {
      const key = tx.date?.slice(0, 10)
      if (!key) return
      if (!map[key]) map[key] = []
      map[key].push(tx)
    })
    return map
  }, [transactions])

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    let startDow = firstDay.getDay()
    startDow = startDow === 0 ? 6 : startDow - 1 // Mon-first
    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7
    const result = []
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startDow + 1
      if (dayNum < 1 || dayNum > daysInMonth) {
        result.push(null)
      } else {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
        result.push({ dayNum, dateKey, txs: dayMap[dateKey] ?? [] })
      }
    }
    return result
  }, [year, month, dayMap])

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month

  const monthLabel = `${MONTH_NAMES_SHORT[month]} ${year}`

  const selectedTxs = useMemo(() => {
    if (!selectedDate) return []
    return [...(dayMap[selectedDate] ?? [])].sort((a, b) => b.date.localeCompare(a.date))
  }, [selectedDate, dayMap])

  return (
    <div>
      {/* Calendar card — month nav lives inside */}
      <div className="card mx-4 rounded-2xl overflow-hidden">

        {/* Month nav — matches Insights MonthNav style, inside the card */}
        <div className="flex items-center justify-center gap-3 pt-3 pb-3 border-b border-slate-100 dark:border-primary/[0.10]">
          <button
            onClick={onPrevMonth}
            className="p-1 text-slate-400 dark:text-slate-500 active:text-slate-700 dark:active:text-slate-200"
            aria-label="Previous month"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          <button
            onClick={() => { if (!isCurrentMonth) onGoToNow?.() }}
            className="flex items-center gap-1.5"
            style={isCurrentMonth ? { pointerEvents: 'none' } : {}}
          >
            <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
              {monthLabel}
            </span>
            {!isCurrentMonth && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                NOW
              </span>
            )}
          </button>

          <button
            onClick={onNextMonth}
            disabled={isCurrentMonth}
            className="p-1 text-slate-400 dark:text-slate-500 active:text-slate-700 dark:active:text-slate-200 disabled:opacity-25"
            aria-label="Next month"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        {/* Day of week header */}
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-primary/[0.10]">
          {DOW_LABELS.map(d => (
            <div
              key={d}
              className="py-2.5 text-center text-[10px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 p-2 gap-1">
          {cells.map((cell, i) => {
            if (!cell) return <div key={i} className="h-12" />

            const { dayNum, dateKey, txs } = cell
            const isToday    = dateKey === todayKey
            const isSelected = dateKey === selectedDate
            const typeSet    = [...new Set(txs.map(t => t.type))].slice(0, 3)
            const hasTxs     = txs.length > 0

            return (
              <button
                key={dateKey}
                onClick={() => onSelectDate(isSelected ? null : dateKey)}
                className={[
                  'relative flex flex-col items-center justify-center h-12 rounded-lg transition-all duration-150 active:scale-90',
                  isSelected
                    ? 'bg-primary shadow-[0_2px_10px_rgba(var(--color-primary-rgb),0.40)]'
                    : isToday
                    ? 'bg-primary/10 dark:bg-primary/[0.15]'
                    : hasTxs
                    ? 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                    : 'opacity-40',
                ].join(' ')}
              >
                <span className={[
                  'text-[14px] leading-none',
                  isSelected
                    ? 'font-bold text-white'
                    : isToday
                    ? 'font-bold text-primary'
                    : hasTxs
                    ? 'font-semibold text-slate-800 dark:text-slate-100'
                    : 'font-medium text-slate-400 dark:text-slate-600',
                ].join(' ')}>
                  {dayNum}
                </span>

                {/* Dots */}
                <div className="flex gap-[3px] mt-[4px] h-[5px] items-center">
                  {typeSet.map(type => (
                    <span
                      key={type}
                      className={`w-[5px] h-[5px] rounded-full ${isSelected ? 'bg-white/60' : DOT_COLOR[type]}`}
                    />
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected date transactions */}
      {selectedDate && (
        <div className="mt-4">
          <div className="flex items-center gap-3 px-5 py-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {fmtGroupDate(selectedDate)}
            </span>
            <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.07]" />
            <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
              {selectedTxs.length} {selectedTxs.length === 1 ? 'txn' : 'txns'}
            </span>
          </div>

          {selectedTxs.length === 0 ? (
            <p className="text-xs text-center text-slate-400 dark:text-slate-500 py-6">
              No transactions on this date
            </p>
          ) : (
            <div className="card mx-5 rounded-2xl overflow-hidden">
              {selectedTxs.map((tx, i) => (
                <div key={tx.id}>
                  <TxRow tx={tx} catMap={catMap} onClick={onTxClick} />
                  {i < selectedTxs.length - 1 && (
                    <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
