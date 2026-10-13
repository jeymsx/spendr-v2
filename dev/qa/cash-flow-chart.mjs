// Insights' cash flow at each period: every label sits beside its own node,
// no two labels overlap, nothing is cut off at the foot. RANGES=1m,3m,6m,all
import { session, APP } from './harness.mjs'
import { seedIdb } from './seed.mjs'
const THEME = process.env.THEME || 'light'
const W = Number(process.env.W || 1440)
const RANGES = (process.env.RANGES || '1m,3m,6m,all').split(',')
let failures = 0
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`) }
const s = await session()
const open = async (url, settle = 2200) => {
  await s.send('Page.navigate', { url })
  await s.until(`document.readyState === 'complete' && !!document.querySelector('#root')?.childElementCount`, 90000)
  await s.sleep(settle)
}
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: W, height: 1000, deviceScaleFactor: 1, mobile: false })
  let seeded = ''
  for (let i = 0; i < 4 && !seeded; i++) {
    await open(APP + '/', 3000)
    const version = await s.evaluate(`(async () => (await import('/src/lib/release.js')).APP_VERSION)()`).catch(() => '0.0.0')
    try { seeded = await s.evaluate(seedIdb({ version })) } catch { /* the database is still opening: go round again */ }
  }
  // A long tail: ten more categories, each with a little spent and a little earned this month.
  if (process.env.TAIL) await s.evaluate(`(async () => {
    const { default: db } = await import('/src/db/db.js')
    const now = new Date()
    const names = ['Pets', 'Gifts', 'Health', 'Hobbies', 'Kids', 'Coffee', 'Books', 'Travel', 'Games', 'Donations']
    for (const [i, name] of names.entries()) {
      if (!(await db.categories.where('name').equals(name).count())) await db.categories.add({ name, type: 'expense', color: ['#f97316','#ec4899','#14b8a6','#a855f7','#0ea5e9','#84cc16','#eab308','#6366f1','#ef4444','#22c55e'][i], icon: 'tag' })
      await db.transactions.add({ txId: crypto.randomUUID(), type: 'expense', category: name, description: name + ' thing', account: 'Cash', amount: 60 + i * 35, date: new Date(now.getTime() - (i + 1) * 86400000).toISOString(), synced: 0, updatedAt: now.toISOString() })
      await db.transactions.add({ txId: crypto.randomUUID(), type: 'income', category: 'Income', description: 'Side gig ' + (i + 1), account: 'Cash', amount: 40 + i * 25, date: new Date(now.getTime() - (i + 1) * 86400000).toISOString(), synced: 0, updatedAt: now.toISOString() })
    }
  })()`)
  await s.evaluate(`localStorage.setItem('spendr-theme', ${JSON.stringify(THEME)}); localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', 'open')`)
  for (const range of RANGES) {
    await s.evaluate(`sessionStorage.setItem('spendr-insights', JSON.stringify({ range: ${JSON.stringify(range)}, month: null, net: '6m', ahead: '1m', scroll: 0 }))`)
    await open(APP + '/insights')
    await s.until(`document.querySelector('.d-sankey svg g[role=button]')`, 10000)
    const r = JSON.parse(await s.evaluate(`(() => {
      const svg = document.querySelector('.d-sankey svg')
      if (!svg) return JSON.stringify({ none: true })
      svg.scrollIntoView({ block: 'start' })
      const box = svg.getBoundingClientRect()
      // Each side's nodes; the first button is the middle bar, which has no figure line.
      const groups = [...svg.querySelectorAll('g[role=button]')].slice(1).map(g => {
        const rect = g.querySelector('.d-sankey-bar').getBoundingClientRect()
        const [name, value] = [...g.querySelectorAll('text')].map(t => t.getBoundingClientRect())
        return { label: g.querySelector('text').textContent, side: rect.left < box.left + box.width / 2 ? 'L' : 'R', nodeTop: rect.top, nodeBottom: rect.bottom, textTop: name.top, textBottom: value.bottom }
      })
      return JSON.stringify({ height: box.height, bottom: box.bottom, top: box.top, groups })
    })()`))
    if (r.none) { check(`${range}: a cash flow`, false, 'no chart'); continue }
    const bad = []
    for (const side of ['L', 'R']) {
      const g = r.groups.filter(x => x.side === side)
      for (let i = 0; i < g.length; i++) {
        const mid = (g[i].textTop + g[i].textBottom) / 2
        const nodeMid = (g[i].nodeTop + g[i].nodeBottom) / 2
        if (Math.abs(mid - nodeMid) > 6) bad.push(`${g[i].label}: label ${Math.round(mid - nodeMid)}px off its node`)
        if (i > 0 && g[i].textTop < g[i - 1].textBottom - 0.5) bad.push(`${g[i - 1].label} / ${g[i].label} overlap`)
        if (g[i].textTop < r.top - 0.5 || g[i].textBottom > r.bottom + 0.5) bad.push(`${g[i].label} cut off`)
      }
    }
    check(`${range}: ${r.groups.length} nodes, every label beside its node (chart ${Math.round(r.height)}px)`, bad.length === 0, bad.slice(0, 4).join('; '))
    await s.sleep(300)
    await s.shot(`sankey-${THEME}-${range}.png`)
  }
  const errs = s.consoleLog.filter(l => l.type === 'error' || l.type === 'exception')
  check('no console errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)))
} finally {
  await s.close()
  console.log(`\n${failures ? failures + ' FAILED' : 'all passed'}`)
}
