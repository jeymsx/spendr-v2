// A stand-in for Supabase, enough for two browsers to be two devices of one account:
// a tiny PostgREST (GET / POST upsert / PATCH / DELETE over in-memory tables), the
// auth endpoints the client calls, and Realtime's postgres_changes over a WebSocket
// in the v2 Phoenix serializer. Not a database: no constraints, no triggers except
// the two the app depends on (transactions.updated_at, and the deletions tombstone).
import http from 'node:http'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT ?? 54321)
/** Held back before a postgres_changes event goes out, to stand for the database's round trip. */
const DB_EVENT_DELAY_MS = Number(process.env.DB_EVENT_DELAY_MS ?? 0)
const REQ_DELAY_MS = Number(process.env.REQ_DELAY_MS ?? 0)
const USER = { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: { full_name: 'Test User' }, created_at: '2026-01-01T00:00:00Z' }
/** @type {Record<string, any[]>} */
const tables = {}
let nextId = 1
/** @type {Array<{method: string, path: string, query: string, body?: any}>} */
const log = []
/** @type {Set<{ws: any, subs: Array<{topic: string, id: number, table: string, filter: string|null, event: string}>}>} */
const conns = new Set()

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*, apikey, authorization, content-type, prefer, range, range-unit, x-client-info, accept-profile, content-profile, accept',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-range',
}

const session = () => ({ access_token: 'tok', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh', user: USER })

/** @param {string} v */
function parseVal(v) {
  if (v === 'null') return null
  if (v === 'true') return true
  if (v === 'false') return false
  return v
}

/** @param {any} row @param {string} col @param {string} spec */
function matches(row, col, spec) {
  const dot = spec.indexOf('.')
  const op = spec.slice(0, dot)
  const raw = spec.slice(dot + 1)
  const a = row[col]
  const cmp = (/** @type {any} */ x, /** @type {any} */ y) => (String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0)
  switch (op) {
    case 'eq': return String(a) === raw
    case 'neq': return String(a) !== raw
    case 'gt': return a != null && cmp(a, raw) > 0
    case 'gte': return a != null && cmp(a, raw) >= 0
    case 'lt': return a != null && cmp(a, raw) < 0
    case 'lte': return a != null && cmp(a, raw) <= 0
    case 'is': return a === parseVal(raw) || (raw === 'null' && a == null)
    case 'in': return raw.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(a))
    default: return true
  }
}

/** @param {any[]} rows @param {URLSearchParams} q */
function filtered(rows, q) {
  const skip = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])
  let out = rows
  for (const [k, v] of q) { if (!skip.has(k)) out = out.filter(r => matches(r, k, v)) }
  return out
}

/** @param {string} table @param {string} eventType @param {any} row */
function broadcast(table, eventType, row) {
  for (const c of conns) {
    for (const sub of c.subs) {
      if (sub.table !== table) continue
      if (sub.event !== '*' && sub.event !== eventType) continue
      if (sub.filter) {
        const m = /^([a-z_]+)=eq\.(.*)$/.exec(sub.filter)
        if (m && String(row[m[1]]) !== m[2]) continue
      }
      const msg = [null, null, sub.topic, 'postgres_changes', { ids: [sub.id], data: { schema: 'public', table, commit_timestamp: new Date().toISOString(), eventType, new: eventType === 'DELETE' ? {} : row, old: eventType === 'INSERT' ? {} : { id: row.id }, errors: null } }]
      const out = JSON.stringify(msg)
      const go = () => { try { c.ws.send(out) } catch { /* gone */ } }
      if (DB_EVENT_DELAY_MS) setTimeout(go, DB_EVENT_DELAY_MS); else go()
    }
  }
}

/** The deletions trigger (014): every delete leaves a row behind. */
function tombstone(table, row) {
  const key = table === 'transactions' ? row.tx_id : row.sync_id
  if (!key) return
  const t = { id: nextId++, user_id: row.user_id, table_name: table, row_key: key, deleted_at: new Date().toISOString() }
  ;(tables.deletions ??= []).push(t)
  broadcast('deletions', 'INSERT', t)
}

/** @param {http.IncomingMessage} req @param {http.ServerResponse} res */
async function handle(req, res) {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const send = (/** @type {number} */ code, /** @type {any} */ body, /** @type {Record<string,string>} */ extra = {}) => {
    res.writeHead(code, { ...CORS, 'content-type': 'application/json', ...extra })
    res.end(body === undefined ? '' : JSON.stringify(body))
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return }

  let body
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const text = Buffer.concat(chunks).toString('utf8')
    if (text) { try { body = JSON.parse(text) } catch { body = text } }
  }
  // A real round trip, Manila to Sydney and back, for the REST calls.
  if (REQ_DELAY_MS && url.pathname.startsWith('/rest/')) await new Promise(r => setTimeout(r, REQ_DELAY_MS))
  log.push({ t: Date.now(), method: req.method ?? '', path: url.pathname, query: url.search, dev: String(req.headers.authorization ?? '').slice(-1), body })

  if (url.pathname === '/__log') { send(200, log); return }
  if (url.pathname === '/__state') {
    send(200, { tables: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), sockets: conns.size, subs: [...conns].reduce((n, c) => n + c.subs.length, 0), shareJoined: [...conns].filter(c => [...c.topics].some(x => x.startsWith('realtime:spendr:live:'))).length })
    return
  }
  if (url.pathname === '/__reset') { for (const k of Object.keys(tables)) delete tables[k]; log.length = 0; send(200, {}); return }
  if (url.pathname === '/__rows') { send(200, tables[url.searchParams.get('table') ?? ''] ?? []); return }

  /* A device whose token ends in D is signed in as the developer (034's is_spendr_developer). */
  const asDev = (/** @type {string} */ t) => t.endsWith('D')
  const userFor = (/** @type {string} */ t) => (asDev(t) ? { ...USER, email: 'sablayjames@gmail.com', user_metadata: { full_name: 'James Sablay' } } : USER)
  if (url.pathname.startsWith('/auth/v1/')) {
    if (url.pathname.endsWith('/user')) { send(200, userFor(String(req.headers.authorization ?? ''))); return }
    if (url.pathname.endsWith('/token')) { const rt = String(body?.refresh_token ?? 'refresh'); send(200, { ...session(), user: userFor(rt), access_token: 'tok' + rt.slice(-1), refresh_token: rt }); return }
    send(200, {}); return
  }

  const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)
  if (m) {
    const table = m[1]
    const rows = (tables[table] ??= [])
    const q = url.searchParams
    const prefer = String(req.headers.prefer ?? '')

    if (req.method === 'GET' || req.method === 'HEAD') {
      let out = filtered(rows, q).sort((a, b) => a.id - b.id)
      const ord = /^([a-z_]+)\.(asc|desc)/.exec(q.get('order') ?? '')
      if (ord && ord[1] !== 'id') out.sort((a, b) => (String(a[ord[1]]) < String(b[ord[1]]) ? -1 : String(a[ord[1]]) > String(b[ord[1]]) ? 1 : 0) * (ord[2] === 'desc' ? -1 : 1))
      else if (ord && ord[2] === 'desc') out.reverse()
      const total = out.length
      const range = /^(\d+)-(\d+)$/.exec(String(req.headers.range ?? ''))
      if (range) out = out.slice(Number(range[1]), Number(range[2]) + 1)
      else if (q.get('limit')) out = out.slice(Number(q.get('offset') ?? 0), Number(q.get('offset') ?? 0) + Number(q.get('limit')))
      if (req.method === 'HEAD') { send(200, undefined, { 'content-range': `*/${total}` }); return }
      if (String(req.headers.accept ?? '').includes('vnd.pgrst.object')) {
        if (out.length !== 1) { send(406, { code: 'PGRST116', message: 'The result contains 0 rows', details: null, hint: null }); return }
        send(200, out[0]); return
      }
      send(200, out, { 'content-range': `${range ? range[1] : 0}-${Math.max(0, out.length - 1)}/${total}` })
      return
    }

    if (req.method === 'POST') {
      const incoming = Array.isArray(body) ? body : [body]
      // A database 033 has not been run on.
      if (process.env.NO_OPENING && table === 'accounts' && incoming.some(r => r && 'opening_balance' in r)) {
        send(400, { code: 'PGRST204', details: null, hint: null, message: "Could not find the 'opening_balance' column of 'accounts' in the schema cache" })
        return
      }
      const keys = (q.get('on_conflict') ?? '').split(',').filter(Boolean)
      const out = []
      for (const r of incoming) {
        const existing = keys.length ? rows.find(x => keys.every(k => String(x[k]) === String(r[k]))) : null
        const stamp = table === 'transactions' ? { updated_at: new Date().toISOString() }
          /* 034's trigger: who sent it, from the account; new; now. */
          : table === 'feedback' ? (() => { const u = userFor(String(req.headers.authorization ?? '')); return { user_id: u.id, sender_email: u.email, sender_name: u.user_metadata?.full_name ?? 'Test User', status: 'new', created_at: new Date().toISOString(), done_at: null } })()
            : {}
        if (existing && prefer.includes('merge-duplicates')) {
          Object.assign(existing, r, stamp)
          out.push(existing); broadcast(table, 'UPDATE', existing)
        } else if (existing) {
          out.push(existing)
        } else {
          const row = { id: nextId++, ...r, ...stamp }
          rows.push(row); out.push(row); broadcast(table, 'INSERT', row)
        }
      }
      send(prefer.includes('return=representation') ? 201 : 201, prefer.includes('return=representation') ? out : undefined)
      return
    }

    if (req.method === 'PATCH') {
      const hit = filtered(rows, q)
      for (const r of hit) { Object.assign(r, body); broadcast(table, 'UPDATE', r) }
      send(200, prefer.includes('return=representation') ? hit : undefined)
      return
    }

    if (req.method === 'DELETE') {
      const hit = filtered(rows, q)
      for (const r of hit) { rows.splice(rows.indexOf(r), 1); tombstone(table, r); broadcast(table, 'DELETE', r) }
      send(200, prefer.includes('return=representation') ? hit : undefined)
      return
    }
  }

  send(200, [])
}

const server = http.createServer((req, res) => { handle(req, res).catch(e => { console.error(e); res.writeHead(500, CORS); res.end(String(e)) }) })
const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  if (!String(req.url).startsWith('/realtime/v1/websocket')) { socket.destroy(); return }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
})
wss.on('connection', (ws) => {
  const conn = { ws, subs: [], topics: new Set(), private: new Set() }
  conns.add(conn)
  ws.on('close', () => conns.delete(conn))
  ws.on('message', (raw, isBinary) => {
    let msg
    if (isBinary) {
      // realtime-js sends a client broadcast as a binary frame (kind 3): lengths, then the strings, then the payload.
      const b = Buffer.from(/** @type {any} */ (raw))
      if (b[0] !== 3) return
      const [jl, rl, tl, el, ml, enc] = [b[1], b[2], b[3], b[4], b[5], b[6]]
      let o = 7
      const take = (/** @type {number} */ n) => { const s = b.subarray(o, o + n).toString('utf8'); o += n; return s }
      const joinRef = take(jl), ref = take(rl), topic = take(tl), userEvent = take(el)
      take(ml)
      const body = b.subarray(o).toString('utf8')
      msg = [joinRef || null, ref || null, topic, 'broadcast', { type: 'broadcast', event: userEvent, payload: enc === 1 ? JSON.parse(body) : body }]
    } else {
      try { msg = JSON.parse(String(raw)) } catch { return }
    }
    const [joinRef, ref, topic, event, payload] = msg
    if (process.env.WSLOG) console.log('ws', topic, event)
    const reply = (/** @type {any} */ response, status = 'ok') => ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status, response }]))
    if (topic === 'phoenix') { ws.send(JSON.stringify([null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} }])); return }
    if (event === 'phx_join') {
      if (process.env.REJECT_PRIVATE && payload?.config?.private) { reply({ reason: 'Unauthorized: no policy allows this user to join this topic' }, 'error'); return }
      conn.topics.add(topic)
      if (payload?.config?.private) conn.private.add(topic)
      const wanted = payload?.config?.postgres_changes ?? []
      const accepted = wanted.map((/** @type {any} */ w) => {
        const sub = { topic, id: nextId++, table: w.table, filter: w.filter ?? null, event: w.event ?? '*' }
        conn.subs.push(sub)
        return { id: sub.id, event: w.event, schema: w.schema, table: w.table, filter: w.filter }
      })
      reply({ postgres_changes: accepted })
      ws.send(JSON.stringify([null, null, topic, 'system', { message: 'Subscribed to PostgreSQL', status: 'ok', extension: 'postgres_changes', channel: topic.replace(/^realtime:/, '') }]))
      return
    }
    if (event === 'phx_leave') { conn.subs = conn.subs.filter(s => s.topic !== topic); conn.topics.delete(topic); reply({}); return }
    if (event === 'broadcast') {
      console.log('broadcast', topic, JSON.stringify(payload).slice(0, 120))
      // Client to client: everyone else joined to the topic hears it, the sender not (self: false).
      for (const other of conns) {
        if (other === conn || !other.topics.has(topic)) continue
        try { other.ws.send(JSON.stringify([null, null, topic, 'broadcast', payload])) } catch { /* gone */ }
      }
      reply({})
      return
    }
    reply({})
  })
})

server.listen(PORT, () => console.log(`standin ready on ${PORT}`))
