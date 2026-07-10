import { supabase } from './supabase'

const cache = new Map()

// Poster generation is admin-only and every uncached image is a paid DALL·E call,
// so the API route demands a Supabase access token. A rejected call degrades to
// `null` and the poster draws its hand-rolled gradient background instead.
export async function getAiBackground(homeColor, awayColor, posterType) {
  const key = `${posterType}-${homeColor}-${awayColor}`

  if (cache.has(key)) {
    return cache.get(key)
  }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return null

    const res = await fetch('/api/generate-poster-bg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ homeColor, awayColor, posterType }),
    })

    if (!res.ok) return null

    const data = await res.json()
    const src = data.imageUrl || data.imageData
    if (!src) return null

    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.crossOrigin = 'anonymous'
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Failed to load AI background'))
      el.src = src
    })

    cache.set(key, img)
    return img
  } catch (err) {
    console.warn('AI background generation failed, using fallback:', err.message)
    return null
  }
}
