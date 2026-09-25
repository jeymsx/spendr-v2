import { describe, it, expect, vi } from 'vitest'
import {
  b64uDecode, b64uEncode, createHandler, encryptPayload, vapidAuthorization, STALE_MS,
} from './index'

/**
 * The reminder sender, run under Node's Web Crypto.
 *
 * The encryption is checked against RFC 8291's own worked example (Appendix
 * A), byte for byte: the same keys and salt must produce the same header and
 * the same ciphertext the RFC prints. Getting any step of the key schedule
 * wrong - an info string, a salt, a length - changes every byte after it, so
 * a match here is not a near miss.
 */

const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  header: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
}

function jwk(publicB64u: string, d?: string): JsonWebKey {
  const pub = b64uDecode(publicB64u)
  return {
    kty: 'EC', crv: 'P-256', ext: true,
    x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)),
    ...(d ? { d } : {}),
  }
}

const enc = new TextEncoder()

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8))
}

/** The RECEIVING side, written independently from the RFC, so a message from
 *  a random key pair can be checked by opening it the way a phone would. */
async function decrypt(body: Uint8Array, uaPublicB64u: string, uaPrivateD: string, authB64u: string) {
  const salt = body.slice(0, 16)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const ct = body.slice(21 + idlen)
  const uaPriv = await crypto.subtle.importKey('jwk', jwk(uaPublicB64u, uaPrivateD), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPriv, 256))
  const uaPublic = b64uDecode(uaPublicB64u)
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic])
  const ikm = await hkdf(b64uDecode(authB64u), secret, info, 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, ct))
  expect(plain.at(-1)).toBe(2)
  return new TextDecoder().decode(plain.slice(0, -1))
}

describe('RFC 8291 payload encryption', () => {
  it('reproduces the RFC\'s worked example exactly', async () => {
    const privateKey = await crypto.subtle.importKey(
      'jwk', jwk(RFC.asPublic, RFC.asPrivate), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
    const out = await encryptPayload(RFC.plaintext, { p256dh: RFC.uaPublic, auth: RFC.auth }, {
      salt: b64uDecode(RFC.salt),
      server: { privateKey, publicRaw: b64uDecode(RFC.asPublic) },
    })
    expect(b64uEncode(out.slice(0, 86))).toBe(RFC.header)
    expect(b64uEncode(out.slice(86))).toBe(RFC.ciphertext)
  })

  it('produces a message the device can open, with a fresh key every time', async () => {
    const sub = { p256dh: RFC.uaPublic, auth: RFC.auth }
    const a = await encryptPayload('{"title":"BPI Credit payment due today"}', sub)
    const b = await encryptPayload('{"title":"BPI Credit payment due today"}', sub)
    expect(b64uEncode(a)).not.toBe(b64uEncode(b))
    expect(await decrypt(a, RFC.uaPublic, RFC.uaPrivate, RFC.auth)).toBe('{"title":"BPI Credit payment due today"}')
  })
})

/** A VAPID pair in the format scripts/vapid-keys.mjs prints. */
async function vapidPair() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const publicKey = b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
  const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d as string
  return { publicKey, privateKey, subject: 'mailto:test@example.com', verifyKey: pair.publicKey }
}

describe('RFC 8292 VAPID', () => {
  it('signs a token the push service can verify with the public key', async () => {
    const v = await vapidPair()
    const header = await vapidAuthorization('https://web.push.apple.com/QGuQyavXutnMcgc', v, 1_790_000_000)
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)
    expect(m).not.toBeNull()
    const [, h, p, s, k] = m!
    expect(k).toBe(v.publicKey)
    expect(JSON.parse(new TextDecoder().decode(b64uDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(b64uDecode(p)))).toEqual({
      aud: 'https://web.push.apple.com', exp: 1_790_000_000 + 12 * 3600, sub: 'mailto:test@example.com',
    })
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, v.verifyKey, b64uDecode(s), enc.encode(`${h}.${p}`))
    expect(ok).toBe(true)
  })
})

// ── The handler, against a pretend Supabase and pretend push services ────────

const NOW = new Date('2026-09-25T01:00:00.000Z')

async function setup({ reminders = [] as any[], subs = [] as any[], pushStatus = (_url: string) => 201, user = null as any } = {}) {
  const v = await vapidPair()
  const calls: Array<{ method: string, url: string, body?: any, headers: Record<string, string> }> = []
  const fetchMock = (async (input: any, init: any = {}) => {
    const url = String(input)
    const method = init.method ?? 'GET'
    const headers = init.headers ?? {}
    let body: any = init.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { /* raw */ } }
    calls.push({ method, url, body, headers })
    const res = (data: any, status = 200) => new Response(JSON.stringify(data), { status })
    if (url.includes('/rest/v1/reminders') && method === 'PATCH' && url.includes('sent_at=is.null')) return res(reminders)
    if (url.includes('/rest/v1/push_subscriptions') && method === 'GET') return res(subs)
    if (url.includes('/rest/v1/')) return res([])
    if (url.endsWith('/auth/v1/user')) return user ? res(user) : res({ msg: 'bad jwt' }, 401)
    return new Response('', { status: pushStatus(url) })
  }) as typeof fetch
  const handle = createHandler({
    SUPABASE_URL: 'https://proj.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-jwt',
    SUPABASE_ANON_KEY: 'anon-jwt',
    VAPID_PUBLIC_KEY: v.publicKey,
    VAPID_PRIVATE_KEY: v.privateKey,
    VAPID_SUBJECT: v.subject,
    CRON_SECRET: 'cron-secret-value',
  }, fetchMock, () => NOW)
  return { handle, calls, v }
}

const SUB = { id: 11, user_id: 'u1', endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: RFC.uaPublic, auth: RFC.auth }
const DUE = { id: 1, user_id: 'u1', tag: 'card:x:2026-09-25:due', fire_at: '2026-09-25T01:00:00.000Z', title: 'BPI Credit payment due today', body: 'P3,000.00 left', url: '/accounts' }

const cron = (secret = 'cron-secret-value') => new Request('https://proj.supabase.co/functions/v1/send-reminders', {
  method: 'POST', headers: { 'x-cron-secret': secret, 'Content-Type': 'application/json' }, body: '{}',
})

describe('the handler', () => {
  it('hands out the public key, and nothing else, to anyone', async () => {
    const { handle, v } = await setup()
    const res = await handle(new Request('https://x/', { method: 'GET' }))
    expect(await res.json()).toEqual({ publicKey: v.publicKey })
  })

  it('refuses to send without the cron secret', async () => {
    const { handle, calls } = await setup({ reminders: [DUE], subs: [SUB] })
    expect((await handle(cron('wrong'))).status).toBe(403)
    expect(calls).toEqual([])
  })

  it('sends what is due to the owner\'s devices, and opens on the phone', async () => {
    const { handle, calls } = await setup({ reminders: [DUE], subs: [SUB] })
    const out = await (await handle(cron())).json()
    expect(out).toMatchObject({ claimed: 1, sent: 1, failed: 0 })

    const claim = calls.find(c => c.method === 'PATCH')!
    expect(claim.url).toContain('sent_at=is.null')
    expect(claim.url).toContain(`fire_at=lte.${encodeURIComponent(NOW.toISOString())}`)
    expect(claim.body).toEqual({ sent_at: NOW.toISOString() })
    // The service role key in both headers, since it is a JWT-style key.
    expect(claim.headers.apikey).toBe('service-jwt')
    expect(claim.headers.Authorization).toBe('Bearer service-jwt')

    const push = calls.find(c => c.url === SUB.endpoint)!
    expect(push.headers['Content-Encoding']).toBe('aes128gcm')
    expect(push.headers.Authorization).toMatch(/^vapid t=.+, k=/)
    const opened = JSON.parse(await decrypt(push.body, RFC.uaPublic, RFC.uaPrivate, RFC.auth))
    expect(opened).toEqual({ title: DUE.title, body: DUE.body, url: DUE.url, tag: DUE.tag })
  })

  it('forgets a device the push service says is gone', async () => {
    const { handle, calls } = await setup({ reminders: [DUE], subs: [SUB], pushStatus: () => 410 })
    const out = await (await handle(cron())).json()
    expect(out).toMatchObject({ sent: 0, removed: 1, retried: 0 })
    expect(calls.some(c => c.method === 'DELETE' && c.url.includes('push_subscriptions?id=in.(11)'))).toBe(true)
  })

  it('puts a reminder back when the push service only failed for now', async () => {
    const { handle, calls } = await setup({ reminders: [DUE], subs: [SUB], pushStatus: () => 503 })
    const out = await (await handle(cron())).json()
    expect(out).toMatchObject({ sent: 0, retried: 1 })
    const put = calls.find(c => c.method === 'PATCH' && c.url.includes('reminders?id=in.(1)'))!
    expect(put.body).toEqual({ sent_at: null })
  })

  /* A "due today" that arrives tomorrow is wrong, not late. */
  it('drops a reminder that is too old to send truthfully', async () => {
    const old = { ...DUE, fire_at: new Date(NOW.getTime() - STALE_MS - 60_000).toISOString() }
    const { handle, calls } = await setup({ reminders: [old], subs: [SUB] })
    const out = await (await handle(cron())).json()
    expect(out).toMatchObject({ claimed: 1, dropped: 1, sent: 0 })
    expect(calls.some(c => c.url === SUB.endpoint)).toBe(false)
  })

  it('sends a test only to a signed-in caller, only to the device asking', async () => {
    const other = { ...SUB, id: 12, endpoint: 'https://web.push.apple.com/other' }
    const { handle, calls } = await setup({ subs: [SUB, other], user: { id: 'u1' } })
    const unsigned = await handle(new Request('https://x/', { method: 'POST', body: JSON.stringify({ action: 'test' }) }))
    expect(unsigned.status).toBe(401)

    const res = await handle(new Request('https://x/', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token' },
      body: JSON.stringify({ action: 'test', endpoint: SUB.endpoint }),
    }))
    expect(await res.json()).toEqual({ sent: 1, failed: 0 })
    const who = calls.find(c => c.url.endsWith('/auth/v1/user'))!
    expect(who.headers.Authorization).toBe('Bearer user-token')
    expect(calls.filter(c => c.url.startsWith('https://web.push.apple.com'))).toEqual([])
  })

  /* How it actually starts on Supabase: Deno.serve, with its secrets read
     one at a time through Deno.env.get. */
  it('serves itself under Deno, reading its secrets through Deno.env.get', async () => {
    let served: ((r: Request) => Promise<Response>) | null = null
    const secrets: Record<string, string> = {
      SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k',
      VAPID_PUBLIC_KEY: 'the-public-key', VAPID_PRIVATE_KEY: 'the-private-key',
    }
    ;(globalThis as any).Deno = { serve: (h: any) => { served = h }, env: { get: (k: string) => secrets[k] } }
    try {
      vi.resetModules()
      await import('./index')
    } finally {
      delete (globalThis as any).Deno
    }
    expect(served).not.toBeNull()
    const res = await served!(new Request('https://x/', { method: 'GET' }))
    expect(await res.json()).toEqual({ publicKey: 'the-public-key' })
  })

  it('says so when the server has no keys', async () => {
    const handle = createHandler({}, (async () => new Response('')) as typeof fetch)
    expect((await handle(new Request('https://x/', { method: 'GET' }))).status).toBe(503)
  })
})
