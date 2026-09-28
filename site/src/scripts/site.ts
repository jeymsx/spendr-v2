/** Everything every page runs. Section-specific motion lives beside its section. */
import { initTheme } from './theme'
import { initHeader } from './header'
import { initReveal, initCountUps } from './motion'

initTheme()
initHeader()
initReveal()
initCountUps()
;(window as unknown as { __spendrReady: boolean }).__spendrReady = true
