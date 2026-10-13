// The website after the 1.0 update: the features page's saving section, the
// home page's What's new and FAQ, at a phone and a desktop width, both themes.
import { session, sleep } from './harness.mjs'

const BASE = `http://localhost:${process.env.SITE_PORT ?? 4325}`
for (const [label, w, h, mobile] of [['phone', 390, 844, true], ['desk', 1440, 900, false]]) {
  for (const theme of ['light', 'dark']) {
    const s = await session({ port: mobile ? 9496 : 9497 })
    await s.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile })
    await s.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] })
    await s.goto(BASE + '/features', 2500)
    // Everything below the fold drawn now, for the shot (content-visibility).
    await s.evaluate(`document.querySelectorAll('*').forEach(e => { if (getComputedStyle(e).contentVisibility === 'auto') e.style.contentVisibility = 'visible' })`)
    const y = await s.evaluate(`(() => { const el = document.getElementById('debts'); return el ? el.getBoundingClientRect().top + window.scrollY - 20 : -1 })()`)
    s.check(`${label} ${theme}: the saving section is on the features page`, y > 0, String(y))
    await s.evaluate(`window.scrollTo(0, ${y})`); await sleep(900)
    await s.shot(`site-features-${label}-${theme}.png`)
    const text = await s.evaluate(`document.getElementById('debts')?.innerText ?? ''`)
    s.check(`${label} ${theme}: it has the wishlist`, /A wishlist that makes you wait/.test(text) && /Paste a shop link/.test(text))
    const imgs = await s.evaluate(`[...document.querySelectorAll('#debts img')].map(i => i.complete && i.naturalWidth > 0)`)
    s.check(`${label} ${theme}: its screens load`, imgs.length > 0 && imgs.every(Boolean), JSON.stringify(imgs))
    await s.goto(BASE + '/', 2500)
    const home = await s.evaluate('document.body.textContent')
    s.check(`${label} ${theme}: home has 1.0 in What's new, and the new FAQ`, /Spendr 1\.0/.test(home) && /Can I delete my account\?/.test(home))
    const errors = s.consoleLog.filter(l => l.type === 'error' || l.type === 'exception')
    s.check(`${label} ${theme}: no errors`, errors.length === 0, JSON.stringify(errors.slice(0, 2)))
    await s.close()
  }
}
process.exit()
