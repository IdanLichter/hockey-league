/* rinkhockeyIL service worker — Web Push only.
 * Receives encrypted push payloads from the send-push edge function and shows a
 * system notification; clicking it focuses/opens the app at the deep link.
 * Kept intentionally minimal (no offline caching) so it never serves stale HTML. */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* non-JSON payload */ }

  const title = data.title || 'הוקי גלגיליות'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/favicon-32.png',
    dir: 'rtl',
    lang: 'he',
    tag: data.tag || 'rinkhockeyil',
    renotify: true,
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of all) {
      // Reuse an already-open app tab.
      if ('focus' in client) {
        try { await client.navigate(target) } catch { /* cross-origin guard */ }
        return client.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target)
  })())
})
