import { createContext, useContext, useState, useEffect, lazy, Suspense, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

const AddExpense = lazy(() => import('../pages/AddExpense'))
const AddInflow  = lazy(() => import('../pages/AddInflow'))
const Transfer   = lazy(() => import('../pages/Transfer'))

const AddFlowContext = createContext(null)

/** openAdd() shows the picker; openAdd('expense') jumps straight to that form. */
export function useAddFlow() {
  const ctx = useContext(AddFlowContext)
  if (!ctx) throw new Error('useAddFlow must be used inside AddFlowProvider')
  return ctx
}

const FLOWS = [
  { key: 'expense',  label: 'Expense',  hint: 'Money out',            tone: 'text-red-500 dark:text-red-400',        icon: '−' },
  { key: 'inflow',   label: 'Income',   hint: 'Money in',             tone: 'text-emerald-600 dark:text-emerald-400', icon: '+' },
  { key: 'transfer', label: 'Transfer', hint: 'Between accounts, or pay a card', tone: 'text-primary',               icon: '⇄' },
]

function Backdrop({ onClick }) {
  return <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClick} />
}

function Picker({ onPick, onClose }) {
  return (
    <div className="relative w-full max-w-[420px] card rounded-2xl p-5"
      style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.34)' }}>
      <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Add transaction</h2>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">What are you recording?</p>
      <div className="flex flex-col gap-2">
        {FLOWS.map(f => (
          <button
            key={f.key}
            onClick={() => onPick(f.key)}
            className="w-full flex items-center gap-3 px-4 h-14 rounded-xl text-left
              bg-slate-50 hover:bg-slate-100 dark:bg-white/[0.05] dark:hover:bg-white/[0.09]
              transition-colors duration-150"
          >
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold shrink-0
              bg-white dark:bg-white/[0.07] ${f.tone}`}>
              {f.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800 dark:text-white">{f.label}</span>
              <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">{f.hint}</span>
            </span>
          </button>
        ))}
      </div>
      <button
        onClick={onClose}
        className="w-full h-10 mt-4 rounded-xl text-xs font-semibold
          text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06]
          active:scale-[0.98] transition-transform duration-100"
      >
        Cancel
      </button>
    </div>
  )
}

/**
 * Adding a transaction is an overlay on desktop, not a page.
 *
 * On a phone, tapping + navigates to a full-screen form because there is no
 * room for anything else. On a landscape screen that throws away the context
 * you were just looking at, so the form opens over the page instead and the
 * list or dashboard behind it stays put.
 *
 * The forms themselves are the mobile components, reused unchanged — which is
 * why installments, the overdraw guard, duplicate detection and templates all
 * behave identically in both layouts.
 *
 * Those forms call navigate() on save and on their back button. Rather than
 * fork them to accept an onDone callback, this closes on any location change:
 * a save navigates to "/" and the overlay drops away, and back acts as cancel.
 * The /expense, /inflow and /transfer routes still exist for deep links.
 */
export function AddFlowProvider({ children }) {
  const [flow, setFlow] = useState(null)   // null | 'picker' | 'expense' | 'inflow' | 'transfer'
  const location = useLocation()

  const openAdd = useCallback((type) => setFlow(type ?? 'picker'), [])
  const closeAdd = useCallback(() => setFlow(null), [])

  // The reused forms navigate when they finish; that's the close signal.
  useEffect(() => { setFlow(null) }, [location.key])

  useEffect(() => {
    if (!flow) return
    const onKey = (e) => { if (e.key === 'Escape') setFlow(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flow])

  const Form = flow === 'expense' ? AddExpense
    : flow === 'inflow' ? AddInflow
    : flow === 'transfer' ? Transfer
    : null

  return (
    <AddFlowContext.Provider value={{ openAdd, closeAdd, isOpen: !!flow }}>
      {children}

      {flow && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-6">
          <Backdrop onClick={closeAdd} />
          {flow === 'picker' ? (
            <Picker onPick={setFlow} onClose={closeAdd} />
          ) : (
            <div
              className="relative w-full max-w-[560px] max-h-[88vh] overflow-y-auto no-scrollbar
                card rounded-2xl"
              style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.34)' }}
            >
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              }>
                <Form />
              </Suspense>
            </div>
          )}
        </div>
      )}
    </AddFlowContext.Provider>
  )
}
