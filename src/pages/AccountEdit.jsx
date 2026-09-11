import { Navigate, useNavigate, useParams } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { AccountFormSheet } from './Accounts'

/**
 * Editing an account, as its own page.
 *
 * It was a bottom sheet, and it had outgrown one: name, kind, network,
 * colour, what it counts as, five credit fields, which account it groups
 * under and a payment QR photo. That is a page's worth of form, and dragging
 * it up from the bottom of the screen meant the top of it was already
 * half-covered before you started.
 *
 * The form itself is unchanged - AccountFormSheet with variant="page" - so
 * the sheet the desktop and the create-from-preset flow still use cannot
 * drift from this. Only the frame is different.
 */
export default function AccountEdit() {
  const { id } = useParams()
  const navigate = useNavigate()

  /* 'loading' as the default, because Dexie returns undefined for a row that
     is not there and useLiveQuery would otherwise report "missing" for the
     one paint before the query resolves - long enough to redirect off the
     page you just opened. */
  const account = useLiveQuery(() => db.accounts.get(Number(id)), [id], 'loading')

  if (account === 'loading') return null

  // Deleted from this page, or a stale link. Either way there is nothing to
  // edit, and the list is the honest place to land.
  if (!account) return <Navigate to="/accounts" replace />

  return (
    <AccountFormSheet
      open
      variant="page"
      account={account}
      onClose={() => navigate(-1)}
    />
  )
}
