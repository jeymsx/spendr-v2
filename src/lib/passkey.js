/**
 * Passkeys, for locking the app with Face ID: making one, asking for it, and
 * checking the answer.
 *
 * ── Why a passkey ──
 *
 * iOS's own "Require Face ID" does nothing for a web app on the home screen.
 * The one way a web page can ask for Face ID is WebAuthn: a passkey made on
 * this device and kept in its keychain, which the phone unlocks with its
 * owner's face. There is no server in any of this. The challenge is made here
 * and checked here, against the public key saved when the passkey was made.
 *
 * ── An answer is checked, never trusted ──
 *
 * navigator.credentials.get resolving means a prompt closed with an answer.
 * It does not mean the answer is good. What comes back is a signature by the
 * passkey's private key, so verifyAssertion checks all of it: ES256 over
 * authenticatorData ‖ SHA-256(clientDataJSON) against the saved public key,
 * the challenge and origin inside clientDataJSON, and the site's hash and the
 * user-verified flag inside authenticatorData. Anything short of all of it is
 * a no, and so is anything that throws on the way.
 *
 * ── The browser call comes first ──
 *
 * Safari before 17.4 accepted WebAuthn only inside the tap that asked for it,
 * and slow work awaited first could use that tap up. createPasskey and
 * getAssertion build their options synchronously and call the browser before
 * they await anything, so a tap handler that calls them straight away is
 * inside its tap on every version. 17.4 replaced the rule with a rate limit
 * that backs off when prompts come too close together.
 */

const encoder = new TextEncoder()

/** COSE's number for ES256, ECDSA on P-256 with SHA-256: the only kind asked for. */
export const ES256 = -7

/**
 * Why an answer or a new passkey was turned down, in words.
 *
 * @type {Record<string, string>}
 */
export const PASSKEY_PROBLEMS = {
  malformed:    'The answer could not be read.',
  type:         'It answered a different kind of request.',
  challenge:    'It signed a different challenge.',
  origin:       'It came from a different origin.',
  site:         'It belongs to a different site.',
  presence:     'No one was there to confirm it.',
  verification: 'Face ID or the passcode was not used.',
  unsupported:  'This browser cannot hand over the public key.',
  algorithm:    'The key is not ES256.',
  key:          'No public key came with it.',
  credential:   'A different passkey answered.',
  signature:    'The signature does not match the saved key.',
}

/**
 * @typedef {object} AuthFlags
 * @property {boolean} up  user present
 * @property {boolean} uv  user verified: Face ID, Touch ID or the passcode
 * @property {boolean} be  backup eligible: a synced passkey
 * @property {boolean} bs  backed up
 */

/**
 * Bytes as base64url, the alphabet WebAuthn writes challenges and ids in.
 *
 * @param {ArrayBuffer | ArrayBufferView} buf
 */
export function toB64url(buf) {
  const bytes = asBytes(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** @param {string} str */
export function fromB64url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** @param {ArrayBuffer | ArrayBufferView} buf */
function asBytes(buf) {
  return ArrayBuffer.isView(buf)
    ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    : new Uint8Array(buf)
}

/** @param {Uint8Array} a @param {Uint8Array} b */
function sameBytes(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** @param {Uint8Array} a @param {Uint8Array} b */
function concat(a, b) {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

/** @param {Uint8Array} bytes */
async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}

/**
 * The fixed head of authenticatorData: the site's hash, the flags, and the
 * signature counter. null when it is too short to be one.
 *
 * @param {Uint8Array} bytes
 * @returns {{ rpIdHash: Uint8Array, flags: AuthFlags, signCount: number } | null}
 */
export function parseAuthData(bytes) {
  if (bytes.length < 37) return null
  const f = bytes[32]
  return {
    rpIdHash: bytes.subarray(0, 32),
    flags: { up: !!(f & 0x01), uv: !!(f & 0x04), be: !!(f & 0x08), bs: !!(f & 0x10) },
    signCount: new DataView(bytes.buffer, bytes.byteOffset + 33, 4).getUint32(0),
  }
}

/**
 * An ECDSA signature the way WebAuthn gives it, ASN.1 DER - SEQUENCE { r
 * INTEGER, s INTEGER } - as the 64 bytes r ‖ s that WebCrypto verifies.
 *
 * Each INTEGER is as long as its value needs: 33 bytes when the top bit is
 * set (a 0x00 in front keeps it positive), fewer than 32 when it starts with
 * zeros. So each is stripped of that padding and set right-aligned into its
 * 32. null for anything that is not exactly that shape.
 *
 * @param {Uint8Array} der
 * @param {number} [size] bytes per half: 32 for P-256
 * @returns {Uint8Array | null}
 */
export function derToRaw(der, size = 32) {
  let i = 0
  if (der[i++] !== 0x30) return null
  let len = der[i++]
  if (len === 0x81) len = der[i++]
  else if (len & 0x80) return null
  if (len !== der.length - i) return null
  const out = new Uint8Array(size * 2)
  for (let half = 0; half < 2; half++) {
    if (der[i++] !== 0x02) return null
    const n = der[i++]
    if (!n || i + n > der.length) return null
    let int = der.subarray(i, i + n)
    i += n
    while (int.length > size && int[0] === 0) int = int.subarray(1)
    if (int.length > size) return null
    out.set(int, half * size + (size - int.length))
  }
  return i === der.length ? out : null
}

/**
 * @param {ArrayBuffer} buf
 * @returns {{ type?: string, challenge?: string, origin?: string, crossOrigin?: boolean } | null}
 */
function readClientData(buf) {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(buf))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * What is wrong with a clientDataJSON, or null when it is this page's answer
 * to this page's question.
 *
 * @param {ReturnType<typeof readClientData>} client
 * @param {'webauthn.create' | 'webauthn.get'} type
 * @param {Uint8Array} challenge
 * @param {string} origin
 */
function clientProblem(client, type, challenge, origin) {
  if (!client) return 'malformed'
  if (client.type !== type) return 'type'
  if (client.challenge !== toB64url(challenge)) return 'challenge'
  if (client.origin !== origin || client.crossOrigin === true) return 'origin'
  return null
}

/**
 * @typedef {object} Asked
 * @property {PublicKeyCredential} credential  what the browser handed back, unchecked
 * @property {Uint8Array} challenge            what it had to sign
 */

/**
 * Ask this device to make a passkey, verified with Face ID. Resolves with
 * the new credential and the challenge it signed. Rejects with the browser's
 * own error, a DOMException whose name says why - NotAllowedError for a
 * dismissed prompt among others.
 *
 * @param {{ userId: Uint8Array, name: string, displayName: string, rpId?: string }} who
 * @returns {Promise<Asked>}
 */
export async function createPasskey({ userId, name, displayName, rpId = location.hostname }) {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const credential = /** @type {PublicKeyCredential | null} */ (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { id: rpId, name: 'Spendr' },
      user: { id: userId, name, displayName },
      pubKeyCredParams: [{ type: 'public-key', alg: ES256 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
        requireResidentKey: false,
      },
      attestation: 'none',
      timeout: 60_000,
      extensions: { credProps: true },
    },
  }))
  if (!credential) throw new DOMException('No passkey came back.', 'NotAllowedError')
  return { credential, challenge }
}

/**
 * @typedef {object} Registration
 * @property {boolean} ok
 * @property {string} [reason]           a key of PASSKEY_PROBLEMS, when not ok
 * @property {string} id                 the credential id, base64url
 * @property {string | null} publicKey   SPKI, base64url: what verifyAssertion checks against
 * @property {number | null} alg
 * @property {AuthFlags | null} flags
 * @property {string | null} attachment  'platform' for this device's own
 * @property {boolean | null} discoverable
 */

/**
 * A new passkey, read and checked: made for this page's challenge, on this
 * site, with Face ID, as an ES256 key the browser can hand over. Everything
 * it could read comes back either way, and `ok` says whether it passed.
 *
 * @param {Asked} made
 * @param {{ rpId?: string, origin?: string }} [where]
 * @returns {Promise<Registration>}
 */
export async function readRegistration({ credential, challenge }, { rpId = location.hostname, origin = location.origin } = {}) {
  const res = /** @type {AuthenticatorAttestationResponse} */ (credential.response)
  const hasApi = typeof res.getPublicKey === 'function'
    && typeof res.getPublicKeyAlgorithm === 'function'
    && typeof res.getAuthenticatorData === 'function'
  const key = hasApi ? res.getPublicKey() : null
  const alg = hasApi ? res.getPublicKeyAlgorithm() : null
  const auth = hasApi ? parseAuthData(asBytes(res.getAuthenticatorData())) : null
  const info = {
    id: toB64url(credential.rawId),
    publicKey: key ? toB64url(key) : null,
    alg,
    flags: auth?.flags ?? null,
    attachment: credential.authenticatorAttachment ?? null,
    discoverable: credential.getClientExtensionResults?.().credProps?.rk ?? null,
  }
  let reason = clientProblem(readClientData(res.clientDataJSON), 'webauthn.create', challenge, origin)
  if (!reason) {
    if (!hasApi) reason = 'unsupported'
    else if (alg !== ES256) reason = 'algorithm'
    else if (!key) reason = 'key'
    else if (!auth) reason = 'malformed'
    else if (!sameBytes(auth.rpIdHash, await sha256(encoder.encode(rpId)))) reason = 'site'
    else if (!auth.flags.up) reason = 'presence'
    else if (!auth.flags.uv) reason = 'verification'
  }
  return reason ? { ok: false, reason, ...info } : { ok: true, ...info }
}

/**
 * Ask Face ID for one saved passkey. Resolves with its answer and the
 * challenge the answer had to sign - unchecked, which is verifyAssertion's
 * job. Rejects with the browser's own error.
 *
 * 'internal' only: the passkey is on this phone, and offering the hybrid
 * transport as well would put "use a nearby device" in front of a lock.
 *
 * @param {{ credentialId: string, rpId?: string, signal?: AbortSignal }} ask
 * @returns {Promise<Asked>}
 */
export async function getAssertion({ credentialId, rpId = location.hostname, signal }) {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const credential = /** @type {PublicKeyCredential | null} */ (await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId,
      allowCredentials: [{ type: 'public-key', id: fromB64url(credentialId), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60_000,
    },
    signal,
  }))
  if (!credential) throw new DOMException('No answer came back.', 'NotAllowedError')
  return { credential, challenge }
}

/**
 * Whether an answer really is the saved passkey, just now, with Face ID: the
 * one test the lock opens on.
 *
 * @param {Asked} answer
 * @param {{ credentialId: string, publicKey: string, rpId?: string, origin?: string }} saved
 * @returns {Promise<{ ok: true, flags: AuthFlags, signCount: number } | { ok: false, reason: string }>}
 */
export async function verifyAssertion({ credential, challenge }, { credentialId, publicKey, rpId = location.hostname, origin = location.origin }) {
  /** @param {string} reason @returns {{ ok: false, reason: string }} */
  const no = (reason) => ({ ok: false, reason })
  try {
    if (credential?.type !== 'public-key' || toB64url(credential.rawId) !== credentialId) return no('credential')
    const res = /** @type {AuthenticatorAssertionResponse} */ (credential.response)
    const problem = clientProblem(readClientData(res.clientDataJSON), 'webauthn.get', challenge, origin)
    if (problem) return no(problem)
    const authData = asBytes(res.authenticatorData)
    const auth = parseAuthData(authData)
    if (!auth) return no('malformed')
    if (!sameBytes(auth.rpIdHash, await sha256(encoder.encode(rpId)))) return no('site')
    if (!auth.flags.up) return no('presence')
    if (!auth.flags.uv) return no('verification')
    const signature = derToRaw(asBytes(res.signature))
    if (!signature) return no('signature')
    const key = await crypto.subtle.importKey(
      'spki', fromB64url(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    )
    const signed = concat(authData, await sha256(asBytes(res.clientDataJSON)))
    const good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, signed)
    return good ? { ok: true, flags: auth.flags, signCount: auth.signCount } : no('signature')
  } catch {
    return no('malformed')
  }
}
