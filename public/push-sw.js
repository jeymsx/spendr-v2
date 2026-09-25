/* Push reminders, inside the service worker.
 *
 * Pulled into the generated worker with workbox's importScripts (see
 * vite.config.js), so this is plain script, not a module, and runs with the
 * worker as `self`.
 *
 * Every push shows a notification, whatever arrives. iOS revokes the
 * subscription of a web app that receives pushes without showing anything,
 * so even an unreadable payload becomes a generic "Spendr" notice rather
 * than nothing.
 */

self.addEventListener('push', (event) => {
  let data
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Spendr'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    // The same reminder delivered twice replaces itself rather than stacking.
    tag: data.tag || undefined,
    icon: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  }))
})

/* Tapping one opens the app where it points - the card, or the bills. An
   open window is reused and moved there; otherwise a new one is opened. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue
      await client.focus()
      if ('navigate' in client) {
        try { await client.navigate(target) } catch { /* not controlled yet: focus is enough */ }
      }
      return
    }
    await self.clients.openWindow(target)
  })())
})
