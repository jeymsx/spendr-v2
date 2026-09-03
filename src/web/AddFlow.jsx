import { createContext, useContext, useState, useEffect, lazy, Suspense, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

const AddExpense = lazy(() => import('../pages/AddExpense'))
const AddInflow  = lazy(() => import('../pages/AddInflow'))
const Transfer   = lazy(() => import('../pages/Transfer'))

/**
 * Modal surfaces are opaque and carry NO backdrop-filter, unlike the .card
 * class the pages use. Two reasons, and both matter:
 *
 *  - A translucent, blurred panel floating over a full page reads as washed
 *    out; .dark .card is rgba(40,60,95,0.2), so the table behind shows through.
 *  - backdrop-filter makes an element a containing block for position:fixed
 *    descendants. These forms open their own pickers and confirm sheets, which
 *    are `fixed inset-0` and centred by the html.web .sheet-panel rules — on a
 *    .card host those would centre against this 560px box instead of the
 *    viewport, and get clipped.
 */
const OPAQUE_SURFACE =
  'rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#111820]'

const AddFlowContext = createContext(null)

/** openAdd('expense' | 'inflow' | 'transfer') opens that form over the page. */
export function useAddFlow() {
  const ctx = useContext(AddFlowContext)
  if (!ctx) throw new Error('useAddFlow must be used inside AddFlowProvider')
  return ctx
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
 *
 * There is no type-picker dialog: WebAddMenu in the sidebar reveals the three
 * types on hover and calls openAdd(type) directly, so nothing opens a modal
 * purely to ask which kind of transaction this is.
 */
export function AddFlowProvider({ children }) {
  const [flow, setFlow] = useState(null)   // null | 'expense' | 'inflow' | 'transfer'
  const location = useLocation()

  const openAdd = useCallback((type) => setFlow(type ?? 'expense'), [])
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
            <div
              className={`relative w-full max-w-[560px] max-h-[88vh] overflow-y-auto
                no-scrollbar ${OPAQUE_SURFACE}`}
              style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.44)' }}
            >
              <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                  <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              }>
                <Form />
              </Suspense>
            </div>
        </div>
      )}
    </AddFlowContext.Provider>
  )
}
