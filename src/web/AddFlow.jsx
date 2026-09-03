import { createContext, useContext, useState, useEffect, lazy, Suspense, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

const AddExpense = lazy(() => import('../pages/AddExpense'))
const AddInflow  = lazy(() => import('../pages/AddInflow'))
const Transfer   = lazy(() => import('../pages/Transfer'))

/** .card-solid is the page cards' material, composited opaque — see index.css. */
const OPAQUE_SURFACE = 'card-solid rounded-2xl'

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

  // Belt and braces: the forms are handed onCancel/onSaved so they close the
  // overlay directly, but if anything inside one does navigate, the overlay
  // must not be left floating over a page that has changed underneath it.
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
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Add ${flow}`}
          className="fixed inset-0 z-[220] flex items-center justify-center p-6"
        >
          {/* Clicking away cancels. aria-hidden because the dialog's own
              header already offers a labelled way out. */}
          <button
            aria-hidden="true"
            tabIndex={-1}
            onClick={closeAdd}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
          />
          <div
            className={`relative w-full max-w-[560px] max-h-[88vh] overflow-y-auto
              no-scrollbar ${OPAQUE_SURFACE}`}
          >
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            }>
              {/* Closing the overlay is not a navigation: the page underneath
                  stays exactly where it was, and its history is untouched. */}
              <Form onCancel={closeAdd} onSaved={closeAdd} />
            </Suspense>
          </div>
        </div>
      )}
    </AddFlowContext.Provider>
  )
}
