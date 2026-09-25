/**
 * send-reminders: Spendr's one piece of server code.
 *
 * ── What it does, and what it never does ──
 *
 * Every fifteen minutes pg_cron calls it (see 020_push_reminders.sql). It
 * takes the reminders whose time has come, sends each one to the devices
 * its owner turned reminders on for, and marks it sent. That is all.
 *
 * It never reads a transaction, an account or a balance. The phone works out
 * what is due - with the same card-cycle rules the app shows you - and uploads
 * only the time and the words (lib/reminders.js). So the server holds no
 * second copy of the money rules to drift, and has nothing of the ledger to
 * look at.
 *
 * ── Why no library ──
 *
 * A web push is a small encrypted POST: an ECDH key agreement, two HKDF
 * steps, one AES-GCM block (RFC 8291), and a signed token saying who sent it
 * (RFC 8292). Web Crypto does all of that natively in Deno and in Node, so
 * this file needs no imports at all - which is what lets the tests run it
 * under Vitest against the RFC's own worked example, and what lets it be
 * pasted into the dashboard's function editor as a single file.
 *
 * ── Routes ──
 *
 *   GET                         the public VAPID key, so the app never has
 *                               to be rebuilt to learn it
 *   POST  x-cron-secret         send what is due (the cron job)
 *   POST  {action: "test"}      send a test to the signed-in caller's own
 *                               devices, authorised by their session token
 *
 * ── Secrets it needs (Edge Functions > Secrets) ──
 *
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   node scripts/vapid-keys.mjs
 *   VAPID_SUBJECT                         mailto: address push services can reach
 *   CRON_SECRET                           the value 020 stores in the vault
 *
 * SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
 * to every edge function automatically.
 *
 * Deploy with JWT verification OFF: the cron job sends no user token, and
 * this checks its own secret instead.
 */

const enc = new TextEncoder()

// ── Encoding ──────────────────────────────────────────────────────────────────

export function b64uDecode(s: string): Uint8Array {
  const b64 = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
  const bin = atob(b64 + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function b64uEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8)
  return new Uint8Array(bits)
}

/** A P-256 key as JWK, from the raw public point and (optionally) the scalar. */
function p256Jwk(publicRaw: Uint8Array, d?: string): JsonWebKey {
  return {
    kty: 'EC', crv: 'P-256', ext: true,
    x: b64uEncode(publicRaw.slice(1, 33)),
    y: b64uEncode(publicRaw.slice(33, 65)),
    ...(d ? { d } : {}),
  }
}

// ── RFC 8291: the payload ─────────────────────────────────────────────────────

export interface PushSubscriptionKeys { endpoint?: string, p256dh: string, auth: string }

/**
 * Encrypt a message for one subscription, as a single aes128gcm record.
 *
 * `salt` and `server` are for the test, which replays the RFC's example; a
 * real send gets a fresh random salt and a fresh key pair every time.
 */
export async function encryptPayload(
  plaintext: string,
  sub: PushSubscriptionKeys,
  opts: { salt?: Uint8Array, server?: { privateKey: CryptoKey, publicRaw: Uint8Array } } = {},
): Promise<Uint8Array> {
  const uaPublic = b64uDecode(sub.p256dh)
  const authSecret = b64uDecode(sub.auth)
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16))

  let server = opts.server
  if (!server) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
    server = {
      privateKey: pair.privateKey,
      publicRaw: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)),
    }
  }

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, server.privateKey, 256))

  // §3.4: combine the ECDH secret with the subscription's auth secret.
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, server.publicRaw)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)

  // RFC 8188: the content-encryption key and nonce.
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  // One record, so it is the last one: the delimiter is 0x02, no padding.
  const record = concat(enc.encode(plaintext), new Uint8Array([2]))
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record))

  // Header: salt, record size (4096), key-id length, and the key id - the
  // server's public key, which is how the device derives the same secret.
  const header = new Uint8Array(16 + 4 + 1)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = server.publicRaw.length
  return concat(header, server.publicRaw, ciphertext)
}

// ── RFC 8292: who is sending ──────────────────────────────────────────────────

export interface Vapid { publicKey: string, privateKey: string, subject: string }

/**
 * The Authorization header for one push service: a JWT signed with the VAPID
 * private key, scoped to the service's origin, valid for twelve hours.
 */
export async function vapidAuthorization(endpoint: string, vapid: Vapid, nowSec: number): Promise<string> {
  const head = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const body = b64uEncode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: nowSec + 12 * 3600,
    sub: vapid.subject,
  })))
  const key = await crypto.subtle.importKey(
    'jwk', p256Jwk(b64uDecode(vapid.publicKey), vapid.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  )
  // Web Crypto's ECDSA signature is already r||s, which is what ES256 wants.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`)))
  return `vapid t=${head}.${body}.${b64uEncode(sig)}, k=${vapid.publicKey}`
}

export interface PushResult { ok: boolean, status: number, gone: boolean, retryable: boolean }

/** A reminder that has not been delivered within six hours is not sent. */
export const TTL_SECONDS = 6 * 3600

export async function sendPush(
  sub: PushSubscriptionKeys & { endpoint: string },
  payload: Record<string, unknown>,
  vapid: Vapid,
  opts: { fetch?: typeof fetch, nowSec?: number } = {},
): Promise<PushResult> {
  const doFetch = opts.fetch ?? fetch
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000)
  try {
    const body = await encryptPayload(JSON.stringify(payload), sub)
    const res = await doFetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(sub.endpoint, vapid, nowSec),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(TTL_SECONDS),
        Urgency: 'normal',
      },
      body,
    })
    const s = res.status
    return { ok: s >= 200 && s < 300, status: s, gone: s === 404 || s === 410, retryable: s === 429 || s >= 500 }
  } catch {
    // The network, not the subscription: worth another go next run.
    return { ok: false, status: 0, gone: false, retryable: true }
  }
}

// ── The handler ───────────────────────────────────────────────────────────────

// The headers supabase-js sends, as listed in its own @supabase/supabase-js/cors.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...CORS, 'Content-Type': 'application/json' },
})

/** Equal strings, compared without leaking where they first differ. */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Past this, a reminder is dropped rather than sent late with the wrong day in it. */
export const STALE_MS = 6 * 3600 * 1000
/** Sent reminders are kept this long, then cleared. */
const KEEP_SENT_MS = 30 * 24 * 3600 * 1000

interface ReminderRow { id: number, user_id: string, tag: string, fire_at: string, title: string, body: string, url: string }
interface SubRow { id: number, user_id: string, endpoint: string, p256dh: string, auth: string }

export function createHandler(
  env: Record<string, string | undefined>,
  doFetch: typeof fetch = fetch,
  clock: () => Date = () => new Date(),
) {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const vapid: Vapid = {
    publicKey: env.VAPID_PUBLIC_KEY ?? '',
    privateKey: env.VAPID_PRIVATE_KEY ?? '',
    subject: env.VAPID_SUBJECT || 'mailto:jamesandgen111@gmail.com',
  }

  /** PostgREST, as the service role. A new-style secret key is not a JWT
   *  and goes in apikey alone; a legacy service_role key goes in both. */
  function rest(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { apikey: serviceKey, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    if (!serviceKey.startsWith('sb_')) headers.Authorization = `Bearer ${serviceKey}`
    return doFetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers })
  }

  async function subscriptionsFor(userIds: string[]): Promise<SubRow[]> {
    if (!userIds.length) return []
    const res = await rest(`push_subscriptions?user_id=in.(${userIds.join(',')})&select=id,user_id,endpoint,p256dh,auth`)
    if (!res.ok) throw new Error(`subscriptions: ${res.status}`)
    return await res.json()
  }

  async function forget(subIds: number[]) {
    if (subIds.length) await rest(`push_subscriptions?id=in.(${subIds.join(',')})`, { method: 'DELETE' })
  }

  async function sendDue() {
    const now = clock()
    const nowIso = now.toISOString()
    const nowSec = Math.floor(now.getTime() / 1000)

    /* Claimed and marked in one UPDATE ... RETURNING, so two overlapping runs
       cannot both send the same reminder: the second one's WHERE no longer
       matches a row the first has already stamped. */
    const claim = await rest(
      `reminders?sent_at=is.null&fire_at=lte.${encodeURIComponent(nowIso)}&select=id,user_id,tag,fire_at,title,body,url`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sent_at: nowIso }) },
    )
    if (!claim.ok) throw new Error(`claim: ${claim.status} ${await claim.text()}`)
    const claimed: ReminderRow[] = await claim.json()
    const due = claimed.filter(r => now.getTime() - new Date(r.fire_at).getTime() <= STALE_MS)

    const subs = await subscriptionsFor([...new Set(due.map(r => r.user_id))])
    const byUser = new Map<string, SubRow[]>()
    for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])

    let sent = 0, failed = 0
    const gone = new Set<number>()
    const retry: number[] = []
    for (const r of due) {
      let delivered = false, again = false
      for (const s of byUser.get(r.user_id) ?? []) {
        if (gone.has(s.id)) continue
        const out = await sendPush(s, { title: r.title, body: r.body, url: r.url, tag: r.tag }, vapid, { fetch: doFetch, nowSec })
        if (out.ok) { delivered = true; sent++ } else {
          failed++
          if (out.gone) gone.add(s.id)
          else if (out.retryable) again = true
        }
      }
      if (!delivered && again) retry.push(r.id)
    }

    await forget([...gone])
    // Put back what only failed for a passing reason, for the next run.
    if (retry.length) {
      await rest(`reminders?id=in.(${retry.join(',')})`, { method: 'PATCH', body: JSON.stringify({ sent_at: null }) })
    }
    await rest(`reminders?sent_at=lt.${encodeURIComponent(new Date(now.getTime() - KEEP_SENT_MS).toISOString())}`, { method: 'DELETE' })

    return { claimed: claimed.length, dropped: claimed.length - due.length, sent, failed, removed: gone.size, retried: retry.length }
  }

  async function sendTest(req: Request, body: { endpoint?: string }) {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Sign in first.' }, 401)
    const who = await doFetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY || serviceKey, Authorization: `Bearer ${token}` },
    })
    if (!who.ok) return json({ error: 'Sign in first.' }, 401)
    const user = await who.json()
    if (!user?.id) return json({ error: 'Sign in first.' }, 401)

    let subs = await subscriptionsFor([user.id])
    if (body?.endpoint) subs = subs.filter(s => s.endpoint === body.endpoint)
    if (!subs.length) return json({ error: 'This device is not signed up for reminders.' }, 404)

    const nowSec = Math.floor(clock().getTime() / 1000)
    let sent = 0
    const gone: number[] = []
    for (const s of subs) {
      const out = await sendPush(s, {
        title: 'Reminders are on',
        body: 'This is how Spendr will tell you a card payment or a bill is due.',
        url: '/settings',
        tag: 'spendr-test',
      }, vapid, { fetch: doFetch, nowSec })
      if (out.ok) sent++
      else if (out.gone) gone.push(s.id)
    }
    await forget(gone)
    return json({ sent, failed: subs.length - sent })
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (!vapid.publicKey || !vapid.privateKey || !env.SUPABASE_URL || !serviceKey) {
      return json({ error: 'Reminders are not set up on the server.' }, 503)
    }
    if (req.method === 'GET') return json({ publicKey: vapid.publicKey })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    try {
      const body = await req.json().catch(() => ({}))
      if (body?.action === 'test') return await sendTest(req, body)
      if (!sameSecret(req.headers.get('x-cron-secret') ?? '', env.CRON_SECRET ?? '')) {
        return json({ error: 'Forbidden' }, 403)
      }
      return json(await sendDue())
    } catch (e) {
      return json({ error: String((e as Error)?.message ?? e) }, 500)
    }
  }
}

/* Served under Deno; merely imported under Vitest. Read off globalThis so
   the file type-checks in both without either one's type definitions. */
const runtime = (globalThis as {
  Deno?: { serve: (h: (req: Request) => Promise<Response>) => void, env: { get: (k: string) => string | undefined } }
}).Deno
if (runtime) {
  // Deno.env.get, key by key: the one env API Supabase documents for functions.
  const keys = [
    'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'CRON_SECRET',
  ]
  runtime.serve(createHandler(Object.fromEntries(keys.map(k => [k, runtime.env.get(k)]))))
}
