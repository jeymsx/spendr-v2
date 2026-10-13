// Tap targets under 32px on the main screens, with enough to find them in the source.
import { session, APP } from './harness.mjs'
import { seedIdb } from './seed.mjs'
const s = await session({ port: 9796 })
const open = async (url, settle = 2500) => {
  await s.send('Page.navigate', { url })
  await s.until(`document.readyState === 'complete' && !!document.querySelector('#root')?.childElementCount`, 60000)
  await s.sleep(settle)
}
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await open(APP + '/', 3000)
  await s.evaluate(seedIdb())
  for (const r of (process.env.ROUTES || '/,/insights,/accounts,/accounts/1,/settings,/transactions').split(',')) {
    await open(APP + r, 3000)
    const small = await s.evaluate(`(() => {
      const out = []
      for (const e of document.querySelectorAll('#app-main button, #app-main a[href], #app-main [role=button], #app-main [role=tab]')) {
        const q = e.getBoundingClientRect()
        if (!q.width || !q.height || e.disabled) continue
        if (q.width >= 32 && q.height >= 32) continue
        // What a finger actually gets: the element, or a larger ::after it carries.
        const a = getComputedStyle(e, '::after')
        const grown = a.content !== 'none' && a.position === 'absolute'
        out.push(Math.round(q.width) + 'x' + Math.round(q.height) + (grown ? ' (grown)' : '') + '  ' + (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 30) + '  <' + e.tagName.toLowerCase() + ' class="' + String(e.className).slice(0, 110) + '">')
      }
      return out
    })()`)
    console.log('\n' + r)
    for (const line of small) console.log('  ' + line)
  }
} finally { await s.close() }
