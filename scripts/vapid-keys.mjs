/**
 * Make a VAPID key pair for push reminders.
 *
 *   node scripts/vapid-keys.mjs
 *
 * Prints two lines to paste into Supabase, Edge Functions > Secrets. Run it
 * ONCE: every device that turns reminders on is subscribed against the public
 * key, so a new pair means every one of them has to turn reminders on again.
 *
 * The private key is a secret. It goes into Supabase and nowhere else - not
 * into the repo, not into Vercel, not into a chat.
 *
 * Same format as `npx web-push generate-vapid-keys`: the public key is the raw
 * 65-byte point and the private key the 32-byte scalar, both base64url.
 */
const b64u = (bytes) => Buffer.from(bytes).toString('base64url')

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const publicKey = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
const { d: privateKey } = await crypto.subtle.exportKey('jwk', pair.privateKey)

console.log(`VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${privateKey}`)
