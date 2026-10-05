import { createContext, useContext, useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { handleEditTransaction } from '../lib/editTransaction'
import Drawer from './ui/Drawer'

const AddExpense = lazy(() => import('../pages/AddExpense'))
const AddInflow  = lazy(() => import('../pages/AddInflow'))
const Transfer   = lazy(() => import('../pages/Transfer'))
const EditTransaction = lazy(() => import('../pages/EditTransaction'))
const QuickLogOverlay = lazy(() => import('../components/QuickLogOverlay'))

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
 * There is no type-picker dialog: the Add menu in the top bar (WebTopBar)
 * lists the types and calls openAdd(type) directly, so nothing opens a modal
 * purely to ask which kind of transaction this is.
 */
export function AddFlowProvider({ children }) {
  const [flow, setFlow] = useState(null)   // null | 'expense' | 'inflow' | 'transfer' | 'quick' | 'edit'
  /* The transaction open to edit, for 'edit': editing opens over the page
     too, rather than as the phone's page of its own (lib/editTransaction.js). */
  const [editId, setEditId] = useState(/** @type {number|null} */ (null))
  const location = useLocation()
  const navigate = useNavigate()
  /** The address asked for the quick log (below), and the next page opens it. */
  const quickNext = useRef(false)
  /** The page the overlay was last closed or opened against. */
  const lastPath = useRef(location.pathname)

  const openAdd = useCallback((type) => setFlow(type ?? 'expense'), [])

  useEffect(() => handleEditTransaction((id) => { setEditId(id); setFlow('edit') }), [])
  const closeAdd = useCallback(() => setFlow(null), [])

  // Belt and braces: the forms are handed onCancel/onSaved so they close the
  // overlay directly, but if anything inside one does navigate, the overlay
  // must not be left floating over a page that has changed underneath it.
  // Reacts to a navigation, which is an external event rather than
  // anything this component can derive.
  /* Except the navigation that asks for it: `?log=quick` opens the quick
     log, where the daily check-in's notification points (lib/nudge.js), as
     the phone's AppLayout does. The parameter comes off at once, so Back or
     a reload does not open it again - and taking it off is itself a
     navigation, so the page it lands on is the one that opens it. */
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('log') === 'quick') {
      params.delete('log')
      const rest = params.toString()
      quickNext.current = true
      navigate({ pathname: location.pathname, search: rest ? `?${rest}` : '' }, { replace: true })
      return
    }
    /* A change of page closes the overlay; a change of query on the same page
       does not. Editing from a transaction's panel closes that panel - which
       takes `?tx=` off the address - in the same moment it opens the edit,
       and that closed the edit as it opened. */
    const samePage = lastPath.current === location.pathname
    lastPath.current = location.pathname
    if (quickNext.current) setFlow('quick')
    else if (!samePage) setFlow(null)
    quickNext.current = false
  }, [location.key, location.search, location.pathname, navigate])

  /* One key from anywhere, as a desktop app would have it: E, I, T and Q
     open the expense, inflow, transfer and quick-log forms (the top bar's
     Add menu shows each beside its name). Not while typing, not with a modifier
     held (Ctrl+T is the browser's), and not over a sheet or dialog. */
  useEffect(() => {
    if (flow) return
    const KEYS = /** @type {Record<string, string>} */ ({ e: 'expense', i: 'inflow', t: 'transfer', q: 'quick' })
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const type = KEYS[e.key.toLowerCase()]
      if (!type) return
      const el = /** @type {HTMLElement|null} */ (e.target)
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      if (document.querySelector('[role="dialog"], .sheet-panel')) return
      e.preventDefault()
      setFlow(type)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flow])

  const Form = flow === 'expense' ? AddExpense
    : flow === 'inflow' ? AddInflow
    : flow === 'transfer' ? Transfer
    : null
  const editing = flow === 'edit' && editId != null

  return (
    <AddFlowContext.Provider value={{ openAdd, closeAdd, isOpen: !!flow }}>
      {children}

      {/* The quick log is an overlay of its own, as on the phone. */}
      {flow === 'quick' && (
        <Suspense fallback={null}>
          <QuickLogOverlay onClose={closeAdd} />
        </Suspense>
      )}

      {/* A panel docked to the right, over the page, as every desktop form
          opens (ui/RouteDrawer, ui/Drawer): Escape, the scrim and the × close
          it, and closing is not a navigation - the page underneath stays
          exactly where it was. */}
      {flow && (Form || editing) && (
        <Drawer open onClose={closeAdd} label={editing ? 'Edit transaction' : `Add ${flow}`} width={560}>
          <div className="d-drawer-phone">
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            }>
              {editing
                ? <EditTransaction id={editId} onDone={closeAdd} />
                : Form && <Form onCancel={closeAdd} onSaved={closeAdd} />}
            </Suspense>
          </div>
        </Drawer>
      )}
    </AddFlowContext.Provider>
  )
}
