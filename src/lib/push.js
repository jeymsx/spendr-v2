import { supabase, isSupabaseConfigured } from './supabase'
import { reminderDigest } from './reminders'

/**
 * Push reminders, from the device's side: permission, the subscription, and
 * keeping the server's list of reminders in step with the ledger.
 *
 * ── The iPhone rules this is shaped around ──
 *
 *   A web app can receive pushes only once it is on the Home Screen and
 *   opened from there - never in a Safari tab - and only on iOS 16.4 or
 *   later. In a tab, PushManager simply does not exist.
 *
 *   Permission can only be asked for inside a tap. Anything awaited first
 *   can use the tap up, and then the prompt never appears and the request is
 *   refused as though the person had said no. So enableReminders asks FIRST
 *   and does its network work after.
 *
 *   Every push must show a notification. A silent one gets the subscription
 *   revoked - which the service worker's push handler guarantees.
 *
 * ── What the server gets ──
 *
 * The device's push address, and the reminder list lib/reminders.js makes:
 * a time, a title and a line of text each. Never the ledger.
 */

/** This device turned reminders on. Per device, because a subscription is. */
const FLAG_KEY = 'spendr-reminders'
/** The last list uploaded, per user, so an unchanged one is not sent again. */
const DIGEST_KEY = 'spendr-reminders-digest'
const FUNCTION = 'send-reminders'
/** Fired on window when this device turns reminders on or off, so
 *  ReminderSync uploads the list now instead of at the next edit. */
export const REMINDERS_CHANGED = 'spendr-reminders-changed'

function announce() {
  try { window.dispatchEvent(new Event(REMINDERS_CHANGED)) } catch { /* no window */ }
}

function readFlag() {
  try { return localStorage.getItem(FLAG_KEY) === 'on' } catch { return false }
}
/** @param {boolean} on */
function writeFlag(on) {
  try { on ? localStorage.setItem(FLAG_KEY, 'on') : localStorage.removeItem(FLAG_KEY) } catch { /* private mode */ }
}

export function isIos() {
  const ua = navigator.userAgent || ''
  // iPadOS reports itself as a Mac, and gives itself away with touch.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || /** @type {any} */ (navigator).standalone === true
}

/**
 * What this device can do about reminders, as one word.
 *
 *   'unconfigured'  the build has no Supabase, so there is no server at all
 *   'ios-install'   an iPhone or iPad in a browser tab: add it to the Home Screen
 *   'unsupported'   no Push API - an old iOS, or a browser without it
 *   'blocked'       notifications were refused for this app
 *   'ok'            it can be turned on
 *
 * @returns {'unconfigured'|'ios-install'|'unsupported'|'blocked'|'ok'}
 */
export function pushSupport() {
  if (!isSupabaseConfigured) return 'unconfigured'
  const hasApi = typeof window !== 'undefined'
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (isIos() && !isStandalone()) return 'ios-install'
  if (!hasApi) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return 'ok'
}

/** @param {string} s */
function b64uToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

/** @type {Promise<string|null>|null} */
let keyRequest = null

/**
 * The server's public key, fetched once per session. Null when the edge
 * function is not deployed or not configured - which is how the app tells
 * "reminders are not set up on the server" apart from "you are offline".
 *
 * @returns {Promise<string|null>}
 */
export function serverKey() {
  if (!keyRequest) {
    keyRequest = supabase.functions.invoke(FUNCTION, { method: 'GET' })
      .then(({ data, error }) => {
        if (error || !data?.publicKey) { keyRequest = null; return null }
        return String(data.publicKey)
      })
      .catch(() => { keyRequest = null; return /** @type {string|null} */ (null) })
  }
  return keyRequest
}

/** @returns {Promise<PushSubscription|null>} */
export async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager?.getSubscription()) ?? null
}

/**
 * Whether this device is on: the flag, AND a subscription that still exists.
 * A browser can drop a subscription on its own, and the flag alone would then
 * claim reminders that can no longer arrive.
 */
export async function remindersOn() {
  if (!readFlag()) return false
  try { return !!(await currentSubscription()) } catch { return false }
}

/**
 * @param {string} userId
 * @param {PushSubscription} sub
 */
async function saveSubscription(userId, sub) {
  const j = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: j.endpoint,
    p256dh: j.keys?.p256dh,
    auth: j.keys?.auth,
    user_agent: (navigator.userAgent || '').slice(0, 200),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' })
  if (error) throw new Error(error.message)
}

/** @param {PushSubscription} sub @param {string} key */
function sameKey(sub, key) {
  const k = sub.options?.applicationServerKey
  if (!k) return true
  const a = new Uint8Array(k)
  const b = b64uToBytes(key)
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/**
 * Turn reminders on for this device. Call it straight from the tap.
 *
 * @param {string} userId
 * @param {string|null} [prefetchedKey]  fetched when the sheet opened, so the
 *   tap does not have to wait on the network before asking
 * @returns {Promise<{ok: true} | {ok: false, reason: 'blocked'|'dismissed'|'server'|'failed', message?: string}>}
 */
export async function enableReminders(userId, prefetchedKey = null) {
  // First, while the tap still counts. See the note at the top.
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: permission === 'denied' ? 'blocked' : 'dismissed' }
  }

  const key = prefetchedKey ?? await serverKey()
  if (!key) return { ok: false, reason: 'server' }

  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    // Subscribed against an older key: it would never receive anything.
    if (sub && !sameKey(sub, key)) { await sub.unsubscribe(); sub = null }
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) })
    }
    await saveSubscription(userId, sub)
    writeFlag(true)
    forgetDigest(userId)
    announce()
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: 'failed', message: e?.message ?? String(e) }
  }
}

/**
 * Turn reminders off for this device - and, when it was the last device,
 * clear the schedule on the server too, since nothing is left to send it to.
 *
 * @param {string} userId
 */
export async function disableReminders(userId) {
  writeFlag(false)
  const sub = await currentSubscription().catch(() => /** @type {PushSubscription|null} */ (null))
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', sub.endpoint)
    await sub.unsubscribe().catch(() => {})
  }
  const { count } = await supabase.from('push_subscriptions')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId)
  if (!count) {
    await supabase.from('reminders').delete().eq('user_id', userId).is('sent_at', null)
  }
  forgetDigest(userId)
}

/**
 * Ask the server for a test notification on this device.
 *
 * @returns {Promise<{ok: boolean, message?: string}>}
 */
export async function sendTestReminder() {
  const sub = await currentSubscription().catch(() => /** @type {PushSubscription|null} */ (null))
  if (!sub) return { ok: false, message: 'Reminders are not on for this device.' }
  const { data, error } = await supabase.functions.invoke(FUNCTION, {
    body: { action: 'test', endpoint: sub.endpoint },
  })
  if (error) {
    let message = 'Could not reach the server.'
    try { message = (await error.context?.json())?.error ?? message } catch { /* not json */ }
    return { ok: false, message }
  }
  return data?.sent > 0 ? { ok: true } : { ok: false, message: 'The push service did not accept it.' }
}

/**
 * On every launch: re-send this device's subscription, which also picks up a
 * push address the browser rotated on its own. A subscription that vanished
 * turns the flag off rather than leaving it claiming something untrue.
 *
 * @param {string} userId
 */
export async function refreshSubscription(userId) {
  if (!readFlag() || pushSupport() !== 'ok') return
  const sub = await currentSubscription()
  if (!sub) { writeFlag(false); return }
  await saveSubscription(userId, sub)
}

/** @param {string} userId */
function digestKey(userId) { return `${DIGEST_KEY}:${userId}` }
/** @param {string} userId */
function forgetDigest(userId) {
  try { localStorage.removeItem(digestKey(userId)) } catch { /* private mode */ }
}

/**
 * Bring the server's reminder list in step with this one.
 *
 * Skipped outright when the list has not changed since the last upload, which
 * is nearly every time - most edits touch nothing a reminder says. Otherwise
 * it checks whether ANY of this person's devices has reminders on (the list
 * is per person, and a laptop keeps the phone's schedule current); with none,
 * nothing is uploaded at all.
 *
 * @param {string} userId
 * @param {import('./reminders').Reminder[]} list
 * @returns {Promise<'unchanged'|'no-devices'|'uploaded'>}
 */
export async function syncReminders(userId, list) {
  const digest = reminderDigest(list)
  let last = null
  try { last = localStorage.getItem(digestKey(userId)) } catch { /* private mode */ }
  if (last === digest || last === `none:${digest}`) return 'unchanged'

  const { count, error: countErr } = await supabase.from('push_subscriptions')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId)
  if (countErr) throw new Error(countErr.message)
  if (!count) {
    try { localStorage.setItem(digestKey(userId), `none:${digest}`) } catch { /* private mode */ }
    return 'no-devices'
  }

  if (list.length) {
    const rows = list.map(r => ({
      user_id: userId, tag: r.tag, fire_at: r.fireAt, title: r.title, body: r.body, url: r.url,
    }))
    const { error } = await supabase.from('reminders').upsert(rows, { onConflict: 'user_id,tag' })
    if (error) throw new Error(error.message)
  }

  // Whatever is still waiting and no longer on the list - a card paid off, a
  // bill deleted - goes. Sent rows are the server's and are left alone.
  let stale = supabase.from('reminders').delete().eq('user_id', userId).is('sent_at', null)
  if (list.length) stale = stale.not('tag', 'in', `(${list.map(r => `"${r.tag}"`).join(',')})`)
  const { error: delErr } = await stale
  if (delErr) throw new Error(delErr.message)

  try { localStorage.setItem(digestKey(userId), digest) } catch { /* private mode */ }
  return 'uploaded'
}
