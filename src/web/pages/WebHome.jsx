import Dashboard from '../../pages/Dashboard'
import { WebScroll } from '../components/WebPane'

/** Home. */
export default function WebHome() {
  return (
    <WebScroll width={560} pad={false}>
      <Dashboard />
    </WebScroll>
  )
}
