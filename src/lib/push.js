import { supabase } from './supabase'

/**
 * Web Push registration for the "bell". A browser opts in explicitly (a user
 * gesture is required for Notification.requestPermission), we subscribe via the
 * PushManager with our VAPID public key, and persist the subscription in
 * public.push_subscriptions. The send-push edge function delivers to it.
 *
 * iOS Safari only exposes Push when the site is installed to the Home Screen as
 * a PWA (iOS 16.4+); pushSupported() reflects that at runtime.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export function pushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// Register the service worker once (idempotent).
export async function ensureServiceWorker() {
  if (!pushSupported()) return null
  return (await navigator.serviceWorker.getRegistration('/sw.js'))
    || navigator.serviceWorker.register('/sw.js')
}

// Current state for THIS browser: 'on' | 'default' | 'denied' | 'unsupported'.
export async function pushStatus() {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'default'
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = reg && (await reg.pushManager.getSubscription())
  return sub ? 'on' : 'default'
}

// Ask permission, subscribe, persist. Returns { ok, reason? }.
export async function enablePush() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' }
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'no-key' }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'signed-out' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: permission } // 'denied' | 'default'

  const reg = await ensureServiceWorker()
  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const json = sub.toJSON() // { endpoint, keys: { p256dh, auth } }
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    platform: 'web',
    endpoint: json.endpoint,
    keys: json.keys,
    user_agent: navigator.userAgent.slice(0, 300),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' })
  if (error) return { ok: false, reason: error.message }

  return { ok: true }
}

// Unsubscribe this browser and drop the stored row.
export async function disablePush() {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = reg && (await reg.pushManager.getSubscription())
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => {})
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase.from('push_subscriptions').delete()
      .eq('user_id', user.id).eq('endpoint', endpoint)
  }
}
