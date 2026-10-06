import { createContext, useContext } from 'react'

/**
 * The add overlay's context, in a module of its own (AddFlow.jsx has the
 * provider).
 *
 * In AddFlow.jsx, beside its components, it broke the dev server: a module
 * that exports a hook as well as components cannot be Fast Refreshed, so an
 * edit there - or a pull that touched it - re-ran it, made a second context,
 * and left the top bar asking the new one while the provider still held the
 * old: "useAddFlow must be used inside AddFlowProvider". Here it is made once
 * and never re-run by an edit to the overlay.
 */
export const AddFlowContext = createContext(/** @type {any} */ (null))

/** openAdd('expense' | 'inflow' | 'transfer') opens that form over the page. */
export function useAddFlow() {
  const ctx = useContext(AddFlowContext)
  if (!ctx) throw new Error('useAddFlow must be used inside AddFlowProvider')
  return ctx
}
