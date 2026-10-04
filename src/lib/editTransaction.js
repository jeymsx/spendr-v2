/**
 * Opening a transaction to edit it.
 *
 * On the phone that is a page of its own, /transactions/:id/edit, the full
 * form. On the desktop it opens over the page you were on, as adding one
 * does (src/web/AddFlow.jsx), so the account or the list you were reading
 * stays where it was behind it. The desktop says so by registering a
 * handler; with none registered - the phone - this navigates, exactly as
 * every caller did before.
 */

/** @type {((id: number) => void)|null} */
let handler = null

/**
 * The desktop's way of opening the form. Returns the function that takes it
 * away again.
 *
 * @param {(id: number) => void} open
 */
export function handleEditTransaction(open) {
  handler = open
  return () => { if (handler === open) handler = null }
}

/**
 * Opens `tx` to edit. `close` is called first when it opens in place, for a
 * sheet showing the transaction to get out of the way - on the phone the
 * page change does that.
 *
 * @param {(to: string) => void} navigate
 * @param {{id?: number}} tx
 * @param {() => void} [close]
 */
export function editTransaction(navigate, tx, close) {
  if (tx?.id == null) return
  if (handler) {
    close?.()
    handler(tx.id)
    return
  }
  navigate(`/transactions/${tx.id}/edit`)
}
