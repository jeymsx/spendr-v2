import Dashboard from '../../pages/Dashboard'
import { WebScroll } from '../components/WebPane'

/**
 * Home: the phone's Home, in two columns.
 *
 * The same page component and the same sections (pages/Dashboard.jsx), so
 * the wallet, the account cards, Safe to spend and Recent are the phone's
 * own and change with it. What the desktop decides is only where they sit:
 * the money you have on the left - the wallet, the cards, what just
 * happened - and what is coming on the right - Wrapped when it is new, the
 * next 30 days, the budget. The quick actions stay on the phone; the
 * sidebar has every one of them.
 */
export default function WebHome() {
  return (
    <WebScroll width={1240} pad={false}>
      <Dashboard layout="desktop" />
    </WebScroll>
  )
}
