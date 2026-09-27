import { describe, it, expect, beforeAll } from 'vitest'
import { ES256, derToRaw, fromB64url, parseAuthData, readRegistration, toB64url, verifyAssertion } from './passkey'

/**
 * The checks a Face ID unlock stands on.
 *
 * A real passkey cannot be made in Node, but everything the lock does with
 * one can be: a P-256 key pair from WebCrypto stands in for the phone's
 * keychain, signs authenticatorData ‖ SHA-256(clientDataJSON) exactly as an
 * authenticator does, and each test bends one part of that answer to see
 * that it is refused.
 */

const RP = 'spendr.test'
const ORIGIN = 'https://spendr.test'
const enc = new TextEncoder()

/** @param {Uint8Array} a @param {Uint8Array} b */
function join(a, b) {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/** @param {Uint8Array} bytes */
async function sha(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}

/** r ‖ s as DER, the way an authenticator sends a signature. @param {Uint8Array} raw */
function rawToDer(raw) {
  /** @param {Uint8Array} half */
  const int = (half) => {
    let i = 0
    while (i < half.length - 1 && half[i] === 0) i++
    const v = [...half.subarray(i)]
    return v[0] & 0x80 ? [0x02, v.length + 1, 0, ...v] : [0x02, v.length, ...v]
  }
  const body = [...int(raw.subarray(0, 32)), ...int(raw.subarray(32))]
  return new Uint8Array([0x30, body.length, ...body])
}

/**
 * The fixed head of authenticatorData.
 *
 * @param {{ rpId?: string, flags?: number, count?: number }} [o]
 */
async function authData({ rpId = RP, flags = 0x05, count = 0 } = {}) {
  const out = new Uint8Array(37)
  out.set(await sha(enc.encode(rpId)), 0)
  out[32] = flags
  new DataView(out.buffer).setUint32(33, count)
  return out
}

/** @type {CryptoKeyPair} */ let keys
/** @type {CryptoKeyPair} */ let stranger
/** @type {string} */ let spki
/** @type {string} */ let credentialId

beforeAll(async () => {
  keys = /** @type {CryptoKeyPair} */ (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']))
  stranger = /** @type {CryptoKeyPair} */ (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']))
  spki = toB64url(await crypto.subtle.exportKey('spki', keys.publicKey))
  credentialId = toB64url(crypto.getRandomValues(new Uint8Array(16)))
})

/**
 * A signed answer from the saved passkey, with any one part bent.
 *
 * @param {{
 *   client?: Record<string, unknown>,
 *   auth?: { rpId?: string, flags?: number, count?: number },
 *   signWith?: CryptoKeyPair,
 *   id?: string,
 *   bend?: (parts: { authData: Uint8Array, signature: Uint8Array }) => void,
 *   clientDataJSON?: Uint8Array,
 * }} [o]
 */
async function answer({ client = {}, auth = {}, signWith, id, bend, clientDataJSON } = {}) {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const cdj = clientDataJSON ?? enc.encode(JSON.stringify({
    type: 'webauthn.get', challenge: toB64url(challenge), origin: ORIGIN, crossOrigin: false, ...client,
  }))
  const ad = await authData(auth)
  const raw = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, (signWith ?? keys).privateKey, join(ad, await sha(cdj)),
  ))
  const signature = rawToDer(raw)
  bend?.({ authData: ad, signature })
  const credential = /** @type {any} */ ({
    type: 'public-key',
    rawId: fromB64url(id ?? credentialId).buffer,
    response: { clientDataJSON: cdj.buffer, authenticatorData: ad.buffer, signature: signature.buffer },
  })
  return { credential, challenge }
}

/** @param {{ credential: any, challenge: Uint8Array }} a */
const check = (a) => verifyAssertion(a, { credentialId, publicKey: spki, rpId: RP, origin: ORIGIN })

describe('verifyAssertion', () => {
  it('opens on the saved passkey, signed just now, with Face ID', async () => {
    const r = await check(await answer())
    expect(r.ok).toBe(true)
    expect(r.ok && r.flags.uv).toBe(true)
  })

  it('refuses an answer to some other challenge', async () => {
    const a = await answer()
    const r = await check({ ...a, challenge: crypto.getRandomValues(new Uint8Array(32)) })
    expect(r).toEqual({ ok: false, reason: 'challenge' })
  })

  it('refuses an answer given to another origin, or across origins', async () => {
    expect(await check(await answer({ client: { origin: 'https://spendr.evil' } }))).toEqual({ ok: false, reason: 'origin' })
    expect(await check(await answer({ client: { crossOrigin: true } }))).toEqual({ ok: false, reason: 'origin' })
  })

  it('refuses a registration passed off as an unlock', async () => {
    expect(await check(await answer({ client: { type: 'webauthn.create' } }))).toEqual({ ok: false, reason: 'type' })
  })

  it('refuses a passkey made for another site', async () => {
    expect(await check(await answer({ auth: { rpId: 'spendr.evil' } }))).toEqual({ ok: false, reason: 'site' })
  })

  it('refuses when Face ID was not used, or nobody was there', async () => {
    expect(await check(await answer({ auth: { flags: 0x01 } }))).toEqual({ ok: false, reason: 'verification' })
    expect(await check(await answer({ auth: { flags: 0x04 } }))).toEqual({ ok: false, reason: 'presence' })
  })

  it('refuses a different passkey', async () => {
    const other = toB64url(crypto.getRandomValues(new Uint8Array(16)))
    expect(await check(await answer({ id: other }))).toEqual({ ok: false, reason: 'credential' })
  })

  it('refuses a signature by any other key', async () => {
    expect(await check(await answer({ signWith: stranger }))).toEqual({ ok: false, reason: 'signature' })
  })

  it('refuses a signature bent by one bit', async () => {
    const r = await check(await answer({ bend: ({ signature }) => { signature[signature.length - 1] ^= 0x01 } }))
    expect(r).toEqual({ ok: false, reason: 'signature' })
  })

  it('refuses authenticatorData changed after it was signed', async () => {
    const r = await check(await answer({ bend: ({ authData }) => { authData[36] ^= 0x01 } }))
    expect(r).toEqual({ ok: false, reason: 'signature' })
  })

  it('says no, rather than throwing, to an answer it cannot read', async () => {
    expect(await check(await answer({ clientDataJSON: enc.encode('not json') }))).toEqual({ ok: false, reason: 'malformed' })
    const a = await answer()
    expect(await verifyAssertion(a, { credentialId, publicKey: 'AAAA', rpId: RP, origin: ORIGIN }))
      .toEqual({ ok: false, reason: 'malformed' })
    expect(await check({ credential: null, challenge: a.challenge })).toEqual({ ok: false, reason: 'credential' })
  })
})

describe('derToRaw', () => {
  it('right-aligns a short INTEGER and drops the sign byte of a long one', async () => {
    const raw = new Uint8Array(64)
    raw.set([0x00, 0x00, 0x7f], 0)       // r starts with zeros: a 30-byte INTEGER
    raw.fill(0x11, 3, 32)
    raw[32] = 0x80                       // s has its top bit set: a 33-byte INTEGER
    raw.fill(0x22, 33)
    const der = rawToDer(raw)
    expect(der[3]).toBe(30)
    expect(derToRaw(der)).toEqual(raw)
  })

  it('reads a real signature back to the 64 bytes that were signed', async () => {
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, enc.encode('x')))
    expect(derToRaw(rawToDer(raw))).toEqual(raw)
  })

  it('refuses anything that is not exactly SEQUENCE { INTEGER, INTEGER }', () => {
    const good = rawToDer(new Uint8Array(64).fill(0x33))
    expect(derToRaw(new Uint8Array([0x31, ...good.subarray(1)]))).toBeNull()      // not a SEQUENCE
    expect(derToRaw(new Uint8Array([...good, 0x00]))).toBeNull()                  // trailing byte
    expect(derToRaw(good.subarray(0, good.length - 1))).toBeNull()                // cut short
    const long = new Uint8Array([0x30, 0x26, 0x02, 0x22, 0x01, ...new Uint8Array(33).fill(0x44), 0x02, 0x00])
    expect(derToRaw(long)).toBeNull()                                             // r wider than 32 bytes
  })
})

describe('readRegistration', () => {
  /**
   * A new passkey as the browser hands it over.
   *
   * @param {{ alg?: number, flags?: number, api?: boolean, challengeOf?: Uint8Array }} [o]
   */
  async function made({ alg = ES256, flags = 0x45, api = true, challengeOf } = {}) {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const ad = await authData({ flags })
    const key = await crypto.subtle.exportKey('spki', keys.publicKey)
    const id = crypto.getRandomValues(new Uint8Array(16))
    const response = {
      clientDataJSON: enc.encode(JSON.stringify({
        type: 'webauthn.create', challenge: toB64url(challengeOf ?? challenge), origin: ORIGIN,
      })).buffer,
      ...(api ? {
        getPublicKey: () => key,
        getPublicKeyAlgorithm: () => alg,
        getAuthenticatorData: () => ad.buffer,
      } : {}),
    }
    const credential = /** @type {any} */ ({
      type: 'public-key', rawId: id.buffer, authenticatorAttachment: 'platform', response,
      getClientExtensionResults: () => ({ credProps: { rk: true } }),
    })
    return { made: { credential, challenge }, id: toB64url(id), spki: toB64url(key) }
  }
  const where = { rpId: RP, origin: ORIGIN }

  it('keeps the id and the public key of a passkey made with Face ID', async () => {
    const m = await made()
    const r = await readRegistration(m.made, where)
    expect(r).toMatchObject({ ok: true, id: m.id, publicKey: m.spki, alg: ES256, attachment: 'platform', discoverable: true })
    expect(r.flags).toMatchObject({ up: true, uv: true })
  })

  it('and the key it keeps verifies what that passkey signs', async () => {
    const m = await made()
    const r = await readRegistration(m.made, where)
    const a = await answer()
    expect(await verifyAssertion(a, { credentialId, publicKey: /** @type {string} */ (r.publicKey), rpId: RP, origin: ORIGIN }))
      .toMatchObject({ ok: true })
  })

  it('turns down what the lock could not check later', async () => {
    expect((await readRegistration((await made({ alg: -257 })).made, where)).reason).toBe('algorithm')
    expect((await readRegistration((await made({ flags: 0x41 })).made, where)).reason).toBe('verification')
    expect((await readRegistration((await made({ api: false })).made, where)).reason).toBe('unsupported')
    expect((await readRegistration((await made({ challengeOf: new Uint8Array(32) })).made, where)).reason).toBe('challenge')
    expect((await readRegistration((await made()).made, { rpId: 'spendr.evil', origin: ORIGIN })).reason).toBe('site')
  })
})

describe('the plumbing', () => {
  it('writes base64url without padding, and reads it back', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = crypto.getRandomValues(new Uint8Array(n))
      const s = toB64url(bytes)
      expect(s).not.toMatch(/[+/=]/)
      expect(fromB64url(s)).toEqual(bytes)
    }
  })

  it('reads the flags and the counter from authenticatorData', async () => {
    const parsed = parseAuthData(await authData({ flags: 0x1d, count: 258 }))
    expect(parsed?.flags).toEqual({ up: true, uv: true, be: true, bs: true })
    expect(parsed?.signCount).toBe(258)
    expect(parseAuthData(new Uint8Array(36))).toBeNull()
  })
})
