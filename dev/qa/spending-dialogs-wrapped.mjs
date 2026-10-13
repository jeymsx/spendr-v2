// Three UI fixes after 1.0.0: desktop Spending puts Every expense under By
// category; a challenge's (and a wish's) dialog has its buttons across the
// width on the computer; Wrapped's Share is a round icon at the bottom right.
// Desktop and phone, light and dark.
import { session, sleep, APP } from './harness.mjs'

const fake = JSON.stringify({ access_token: 'tokA', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refreshA', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: { full_name: 'Test User' }, created_at: '2026-01-01T00:00:00Z' } })
const rect = (s, expr) => s.evaluate(`(() => { const el = ${expr}; if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) } })()`)
const btn = label => `[...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && (b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)})).at(-1)`
const leaf = text => `[...document.querySelectorAll('h1,h2,h3,h4,p,span,div')].filter(e => e.childElementCount === 0 && e.textContent.trim() === ${JSON.stringify(text)} && e.offsetParent !== null).at(0)`
const click = (s, label) => s.evaluate(`(() => { const b = ${btn(label)}; b?.scrollIntoView({ block: 'center' }); b?.click(); return !!b })()`)

for (const mode of (process.env.MODES ?? 'desktop,phone').split(',')) {
  for (const theme of (process.env.THEMES ?? 'light,dark').split(',')) {
    const tag = `${mode} ${theme}`
    await fetch('http://localhost:54321/__reset', { method: 'POST' }).catch(() => {})
    const s = await session()
    if (mode === 'desktop') {
      await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
      await s.send('Emulation.setTouchEmulationEnabled', { enabled: false })
    }
    await s.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] })
    try {
      await s.send('Page.navigate', { url: APP + '/dev/seed-sample-data.html' })
      await s.until(`document.getElementById('status')?.textContent.startsWith('Sample data loaded')`, 90000)
      await s.evaluate(`localStorage.setItem('sb-localhost-auth-token', ${JSON.stringify(fake)}); localStorage.setItem('spendr-view-mode', '${mode}'); localStorage.setItem('spendr-theme', '${theme}')`)
      await s.goto(APP + '/', 5000)
      if (await s.until(`[...document.querySelectorAll('button')].some(b => /Move them to my account|Keep both/.test(b.textContent))`, 6000)) {
        await s.evaluate(`[...document.querySelectorAll('button')].find(b => /Move them to my account|Keep both/.test(b.textContent)).click()`)
        await sleep(5000)
        await s.evaluate(`[...document.querySelectorAll('button')].find(b => /Back to Home/.test(b.textContent))?.click()`)
      }
      if (await s.until(`${btn('Got it')}`, 8000)) { await click(s, 'Got it'); await sleep(900) }

      // ── Spending: Every expense under By category (desktop only) ──
      if (mode === 'desktop') {
        await s.goto(APP + '/insights/spending', 2500)
        await s.until(`${leaf('Every expense')}`, 20000); await sleep(800)
        const cat = await rect(s, leaf('By category'))
        const every = await rect(s, leaf('Every expense'))
        const where = await rect(s, leaf('Where it went'))
        s.check(`${tag}: Every expense sits under By category, in the left column`,
          cat && every && where && Math.abs(cat.x - every.x) <= 2 && every.y > cat.y && every.x < where.x,
          JSON.stringify({ cat, every, where }))
        const panelW = await s.evaluate(`(() => { const h = ${leaf('Every expense')}; let p = h; while (p && p.getBoundingClientRect().width < 300) p = p.parentElement; return Math.round(p?.getBoundingClientRect().width ?? 0) })()`)
        s.check(`${tag}: and it is not full width`, panelW > 0 && panelW < 900, String(panelW))
        await s.evaluate(`(${leaf('Every expense')}).scrollIntoView({ block: 'start' })`); await sleep(500)
        await s.shot(`fix-spending-${theme}.png`)
      }

      // ── A challenge's dialog ──
      // Earned badges celebrate first, over everything; see them off.
      for (let i = 0; i < 8; i++) {
        if (!await s.until(btn('Back to Home'), 3000)) break
        await click(s, 'Back to Home'); await sleep(1200)
      }
      await s.goto(APP + '/achievements?tab=challenges', 2500)
      for (let i = 0; i < 8; i++) {
        if (!await s.until(btn('Back to Home'), 2000)) break
        await click(s, 'Back to Home'); await sleep(1200)
        await s.goto(APP + '/achievements?tab=challenges', 2500)
      }
      await s.until(`${btn('Take it on')}`, 20000)
      // The first one whose Start is not held back by a missing setting.
      await s.evaluate(`(() => { const b = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Take it on' && !b.disabled).find(b => /No-Spend|Weekend|Cash/i.test(b.closest('div.flex-1, .flex-1')?.textContent ?? '')) ?? [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Take it on' && !b.disabled); b.scrollIntoView({ block: 'center' }); b.click() })()`)
      await s.until(`${btn('Start challenge')}`, 5000); await sleep(900)
      const foot = await rect(s, `[...document.querySelectorAll('.sheet-foot')].at(-1)`)
      const notNow = await rect(s, btn('Not now'))
      const start = await rect(s, btn('Start challenge'))
      s.check(`${tag}: challenge dialog buttons run across the foot`, foot && notNow && start && notNow.x - foot.x <= 32 && foot.r - start.r <= 32 && start.w > notNow.w * 1.3,
        JSON.stringify({ foot, notNow, start }))
      await s.shot(`fix-challenge-${mode}-${theme}.png`)
      const startable = await s.evaluate(`!${btn('Start challenge')}.disabled`)
      const name = await s.evaluate(`[...document.querySelectorAll('[role=dialog]')].at(-1)?.getAttribute('aria-label') || [...document.querySelectorAll('[role=dialog] h2, [role=dialog] h1')].at(-1)?.textContent.trim() || ''`)
      console.log('challenge:', name)
      if (startable) {
        await click(s, 'Start challenge'); await sleep(1500)
        // Its running card opens Give up / Keep going.
        const opened = await s.evaluate(`(() => { const sec = [...document.querySelectorAll('section')].find(x => x.textContent.trim().startsWith('Running')); const c = sec?.querySelector('button'); c?.click(); return !!c })()`)
        if (opened && await s.until(`${btn('Keep going')}`, 4000)) {
          await sleep(900)
          const f2 = await rect(s, `[...document.querySelectorAll('.sheet-foot')].at(-1)`)
          const quit = await rect(s, btn('Give up'))
          const keep = await rect(s, btn('Keep going'))
          s.check(`${tag}: running dialog buttons run across the foot too`, f2 && quit && keep && quit.x - f2.x <= 32 && f2.r - keep.r <= 32 && keep.w > quit.w * 1.3, JSON.stringify({ f2, quit, keep }))
          await s.shot(`fix-running-${mode}-${theme}.png`)
          await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
          await sleep(600)
        } else s.check(`${tag}: running card opens`, false, `opened ${opened}`)
      } else console.log(`(${tag}: Start challenge disabled, running dialog skipped)`)

      // ── A wish's dialog ──
      await s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); const now = new Date().toISOString(); await db.wishes.clear(); await db.wishes.add({ syncId: 'qa-wish-1', name: 'Bluetooth speaker', price: 2450, currency: 'PHP', link: 'https://shopee.ph/', note: null, coolUntil: '2026-10-01', status: 'waiting', decidedAt: null, txId: null, goalName: null, createdAt: now, updatedAt: now, synced: 0 }) })()`)
      await s.goto(APP + '/wishlist', 2500)
      await s.until(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Bluetooth speaker'))`, 15000)
      await s.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Bluetooth speaker') && !/^(Skip|Buy)$/.test(b.textContent.trim())).click()`)
      await s.until(`${btn('Edit')} && ${btn('Buy')}`, 5000); await sleep(900)
      const f3 = await rect(s, `[...document.querySelectorAll('.sheet-foot')].at(-1)`)
      const edit = await rect(s, btn('Edit'))
      const buy = await rect(s, `[...document.querySelectorAll('.sheet-foot button')].filter(b => b.textContent.trim() === 'Buy').at(-1)`)
      s.check(`${tag}: wish dialog buttons run across the foot`, f3 && edit && buy && edit.x - f3.x <= 32 && f3.r - buy.r <= 32 && buy.w > edit.w * 1.3, JSON.stringify({ f3, edit, buy }))
      await s.shot(`fix-wish-${mode}-${theme}.png`)

      // ── Wrapped: Share as an icon, bottom right ──
      await s.goto(APP + '/recap', 3000)
      await s.until(`${btn('Share this slide')}`, 20000); await sleep(1200)
      const col = await rect(s, `[...document.querySelectorAll('main')].at(-1)`)
      const share = await rect(s, btn('Share this slide'))
      const vh = await s.evaluate('innerHeight')
      s.check(`${tag}: Wrapped's share is a 48px round icon`, share && share.w === 48 && share.h === 48 && (await s.evaluate(`${btn('Share this slide')}.textContent.trim()`)) === '', JSON.stringify(share))
      s.check(`${tag}: at the bottom right of the story`, share && col && Math.abs(share.r - (col.r - 20)) <= 2 && vh - share.b <= 40, JSON.stringify({ share, col, vh }))
      await s.evaluate(`${btn('Pause Wrapped')}?.click()`); await sleep(400)
      await s.shot(`fix-wrapped-${mode}-${theme}.png`)
      await click(s, 'Share this slide')
      s.check(`${tag}: and it still opens Share this slide`, await s.until(`document.querySelector('[role=dialog][aria-label="Share this slide"], [role=dialog]') && [...document.querySelectorAll('[role=dialog]')].some(d => /Share this slide/.test(d.textContent + (d.getAttribute('aria-label') ?? '')))`, 4000))
      await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await sleep(900)
      // To the last slide, by the keyboard's Next slide button.
      for (let i = 0; i < 20; i++) {
        const more = await s.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Next slide'); if (!b || b.disabled) return false; b.click(); return true })()`)
        if (!more) break
        await sleep(450)
      }
      await s.until(`${btn('Share your Wrapped')}`, 4000); await sleep(1200)
      const done = await rect(s, btn('Done'))
      const share2 = await rect(s, btn('Share your Wrapped'))
      s.check(`${tag}: the last slide has Done, with the share icon to its right`, done && share2 && share2.w === 48 && share2.x > done.r && Math.abs(share2.y - done.y) <= 2 && done.w > 200, JSON.stringify({ done, share2 }))
      await s.shot(`fix-wrapped-last-${mode}-${theme}.png`)

      const errors = s.consoleLog.filter(l => l.type === 'error' || l.type === 'exception').filter(l => !/Failed to load resource|ERR_CONNECTION|websocket|realtime/i.test(l.text))
      s.check(`${tag}: no console errors`, errors.length === 0, JSON.stringify(errors.slice(0, 3)))
    } catch (e) {
      s.check(`${tag}: script ran`, false, e.message)
      await s.shot(`fix-error-${mode}-${theme}.png`).catch(() => {})
    } finally { await s.close() }
  }
}
process.exit()
