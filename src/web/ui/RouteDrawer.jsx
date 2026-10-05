import { useBack } from '../../hooks/useBack'
import Drawer from './Drawer'

/**
 * A phone form or list opened at its own address, shown on a computer as a
 * panel docked to the right over the page it belongs to - a new account
 * over Accounts, a bill's form over Recurring - rather than as a narrow
 * phone page in the middle of the window.
 *
 * The page underneath is the real one, live; the panel is the phone's own
 * page (its header restyled into the panel's title row, pro.css
 * `.d-drawer-phone`), so a field added to the phone's form is here too.
 * Closing it - the corner's ×, the scrim, Escape - goes back, the way the
 * phone's Back does, so a form with unsaved changes asks first through its
 * own guard (hooks/useBackGuard). Saving navigates as the phone's form
 * does, which closes the panel by changing the address.
 *
 * @param {{under: import('react').ReactNode, children: import('react').ReactNode, label: string,
 *          width?: number, fallback?: string}} props
 */
export default function RouteDrawer({ under, children, label, width = 560, fallback }) {
  const back = useBack(fallback)
  return (
    <>
      {under}
      <Drawer open onClose={back} label={label} width={width}>
        <div className="d-drawer-phone">{children}</div>
      </Drawer>
    </>
  )
}
