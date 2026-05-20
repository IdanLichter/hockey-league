const cache = new Map()

export async function getAiBackground(homeColor, awayColor, posterType) {
  const key = `${posterType}-${homeColor}-${awayColor}`

  if (cache.has(key)) {
    return cache.get(key)
  }

  try {
    const res = await fetch('/api/generate-poster-bg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
