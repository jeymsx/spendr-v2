import { useEffect, useMemo, useRef, useState } from 'react'
import { IArrowDown, IArrowUp } from './icons'

/**
 * The desktop's table: 40px rows, a sticky header, sortable columns, row
 * selection, a highlighted open row, and the keyboard.
 *
 * The page owns the order: it sorts (sortRows below helps) and may put group
 * rows in the list - `{__group: true, key, label, right}` - for a day
 * heading or an account kind. The table draws what it is given, and says in
 * the header which column the page sorted by.
 *
 * Long lists render in steps of `pageSize` as the end scrolls into view, so
 * a ledger of thousands opens at once.
 *
 * Keyboard: Up and Down move between rows, Enter opens one, Space or X
 * selects it (when the table selects), Escape clears the selection.
 *
 * @template T
 * @typedef {{key: string, header?: import('react').ReactNode, width?: number|string, align?: 'left'|'right'|'center',
 *            sortable?: boolean, render: (row: T) => import('react').ReactNode, className?: string,
 *            title?: string, optional?: boolean}} Column
 */

/**
 * @template T
 * @param {{columns: Column<T>[], rows: Array<T | {__group: true, key: string, label: import('react').ReactNode, right?: import('react').ReactNode}>,
 *          rowKey: (row: T) => string|number, sort?: {key: string, dir: 'asc'|'desc'}|null,
 *          onSort?: (key: string) => void, selected?: Set<string|number>, onSelectedChange?: (next: Set<string|number>) => void,
 *          onRowClick?: (row: T) => void, activeKey?: string|number|null, empty?: import('react').ReactNode,
 *          footer?: import('react').ReactNode, pageSize?: number, stickyTop?: number, label?: string,
 *          rowClassName?: (row: T) => string, resetKey?: string}} props
 */
export default function DataTable({
  columns, rows, rowKey, sort = null, onSort, selected, onSelectedChange, onRowClick,
  activeKey = null, empty = null, footer = null, pageSize = 150, stickyTop = 0, label,
  rowClassName, resetKey,
}) {
  const selectable = !!onSelectedChange
  const [limit, setLimit] = useState(pageSize)
  const [seenReset, setSeenReset] = useState(resetKey)
  if (resetKey !== seenReset) { setSeenReset(resetKey); setLimit(pageSize) }
  const sentinel = useRef(/** @type {HTMLTableRowElement|null} */ (null))
  const bodyRef = useRef(/** @type {HTMLTableSectionElement|null} */ (null))

  const shown = useMemo(() => {
    let n = 0
    const out = []
    for (const r of rows) {
      if (!(/** @type {any} */ (r)).__group) { if (n >= limit) break; n++ }
      out.push(r)
    }
    return out
  }, [rows, limit])
  const dataRows = useMemo(() => /** @type {T[]} */ (rows.filter(r => !(/** @type {any} */ (r)).__group)), [rows])
  const more = dataRows.length > limit

  useEffect(() => {
    const el = sentinel.current
    if (!more || !el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) setLimit(l => l + pageSize)
    }, { root: el.closest('.d-page'), rootMargin: '0px 0px 600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [more, pageSize, shown.length])

  const allKeys = useMemo(() => dataRows.map(rowKey), [dataRows, rowKey])
  const allOn = selectable && allKeys.length > 0 && allKeys.every(k => selected?.has(k))
  const someOn = selectable && !allOn && allKeys.some(k => selected?.has(k))

  const toggle = (/** @type {string|number} */ k) => {
    if (!onSelectedChange) return
    const next = new Set(selected)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    onSelectedChange(next)
  }

  const onKey = (/** @type {import('react').KeyboardEvent} */ e) => {
    const trs = /** @type {HTMLElement[]} */ ([...(bodyRef.current?.querySelectorAll('tr[data-row]') ?? [])])
    const at = trs.indexOf(/** @type {HTMLElement} */ (document.activeElement))
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = at < 0 ? 0 : Math.max(0, Math.min(trs.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))
      trs[next]?.focus()
      trs[next]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Escape' && selectable && selected?.size) {
      e.preventDefault()
      onSelectedChange?.(new Set())
    }
  }

  const colCount = columns.length + (selectable ? 1 : 0)
  let dataIndex = 0

  return (
    <table className="d-table" aria-label={label} onKeyDown={onKey}>
      <colgroup>
        {selectable && <col style={{ width: 44 }} />}
        {columns.map(c => <col key={c.key} style={{ width: c.width }} className={c.optional ? 'd-col-opt' : undefined} />)}
      </colgroup>
      <thead>
        <tr>
          {selectable && (
            <th style={{ top: stickyTop }}>
              <input
                type="checkbox"
                className="d-check"
                aria-label="Select all"
                checked={allOn}
                ref={el => { if (el) el.indeterminate = someOn }}
                onChange={() => onSelectedChange?.(allOn ? new Set() : new Set(allKeys))}
              />
            </th>
          )}
          {columns.map(c => {
            const sorted = sort?.key === c.key
            const can = c.sortable && !!onSort
            return (
              <th
                key={c.key}
                style={{ top: stickyTop }}
                className={`${c.align === 'right' ? 'is-num' : ''} ${can ? 'is-sortable' : ''} ${sorted ? 'is-sorted' : ''} ${c.optional ? 'd-col-opt' : ''} ${c.className ?? ''}`}
                aria-sort={sorted ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                onClick={can ? () => onSort?.(c.key) : undefined}
                title={c.title}
              >
                <span className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                  {c.header}
                  {sorted && (sort?.dir === 'asc' ? <IArrowUp size={12} /> : <IArrowDown size={12} />)}
                </span>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody ref={bodyRef}>
        {shown.length === 0 && (
          <tr><td colSpan={colCount} style={{ height: 'auto', padding: 0 }}>{empty}</td></tr>
        )}
        {shown.map((r) => {
          const g = /** @type {any} */ (r)
          if (!g.__group) dataIndex++
          if (g.__group) {
            return (
              <tr key={`g-${g.key}`} className="d-group-row">
                <td colSpan={colCount}>
                  <span className="flex items-center justify-between gap-3">
                    <span>{g.label}</span>
                    {g.right && <span className="d-num font-medium">{g.right}</span>}
                  </span>
                </td>
              </tr>
            )
          }
          const row = /** @type {T} */ (r)
          const k = rowKey(row)
          const on = selected?.has(k)
          return (
            <tr
              key={k}
              data-row
              // One row in the tab order (the first); the arrows move from there.
              tabIndex={dataIndex === 1 ? 0 : -1}
              aria-selected={selectable ? !!on : undefined}
              className={[
                onRowClick ? 'is-clickable' : '',
                on ? 'is-selected' : '',
                activeKey != null && activeKey === k ? 'is-active' : '',
                rowClassName?.(row) ?? '',
              ].join(' ')}
              onClick={(e) => {
                if ((e.target instanceof HTMLElement) && e.target.closest('input,button,a,[data-stop]')) return
                if (selectable && (e.metaKey || e.ctrlKey)) { toggle(k); return }
                onRowClick?.(row)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && onRowClick) { e.preventDefault(); onRowClick(row) }
                else if ((e.key === ' ' || e.key.toLowerCase() === 'x') && selectable) { e.preventDefault(); toggle(k) }
              }}
            >
              {selectable && (
                <td data-stop>
                  <input type="checkbox" className="d-check" aria-label="Select row" checked={!!on} onChange={() => toggle(k)} />
                </td>
              )}
              {columns.map(c => (
                <td key={c.key} className={`${c.align === 'right' ? 'is-num' : ''} ${c.optional ? 'd-col-opt' : ''} ${c.className ?? ''}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          )
        })}
        {more && (
          <tr ref={sentinel}><td colSpan={colCount} className="d-cell-faint text-center text-12">Loading more…</td></tr>
        )}
      </tbody>
      {footer && <tfoot>{footer}</tfoot>}
    </table>
  )
}

/**
 * Rows in a column's order. `value` picks what to compare: a number, a
 * string (compared ignoring case), or a date string.
 *
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => any} value
 * @param {'asc'|'desc'} dir
 */
export function sortRows(rows, value, dir) {
  const m = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = value(a)
    const y = value(b)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * m
    return String(x).localeCompare(String(y), undefined, { sensitivity: 'base', numeric: true }) * m
  })
}

/**
 * Clicking a sorted column flips it; another column starts descending for
 * numbers and dates (the biggest, the newest first) and ascending for names.
 *
 * @param {{key: string, dir: 'asc'|'desc'}} current
 * @param {string} key
 * @param {'asc'|'desc'} [first]
 */
export function nextSort(current, key, first = 'desc') {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: first }
}
