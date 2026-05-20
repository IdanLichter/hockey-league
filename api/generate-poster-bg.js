import { createClient } from '@supabase/supabase-js'

const COLOR_NAMES = {
  '#ffffff': 'white and silver',
  '#15f919': 'bright green',
  '#155af9': 'royal blue',
  '#f91515': 'fiery red',
  '#969696': 'steel gray and silver',
  '#15d3f9': 'cyan and electric teal',
  '#2e8e41': 'deep emerald green',
}

function colorToName(hex) {
  const normalized = hex?.toLowerCase()
  return COLOR_NAMES[normalized] || 'orange'
}

function buildPrompt(homeColor, awayColor, posterType) {
  const homeName = colorToName(homeColor)
  const awayName = colorToName(awayColor)

  if (posterType === 'matchday') {
    return `Abstract dramatic inline hockey arena background for a match day poster. Dark professional sports broadcast atmosphere with subtle orange and deep blue energy accents. Ice arena with dramatic overhead spotlights, volumetric fog, and epic arena atmosphere. Cinematic wide shot. Large clean dark center area suitable for text overlay. No text, no logos, no people, no faces, no letters, no numbers, no words, no watermarks. Professional sports broadcast quality, ultra high detail, cinematic lighting, 4K.`
  }

  return `Abstract dramatic sports arena background for an inline hockey match poster. An intense visual clash of two powerful color energies: ${homeName} energy surging from the right side and ${awayName} energy surging from the left side, colliding explosively in the center with bright light effects and particle bursts. Dark moody ice arena atmosphere, dramatic volumetric lighting from above, lens flares at the collision point, swirling energy particles, epic cinematic tone. No text, no logos, no people, no faces, no letters, no numbers, no words, no watermarks. Professional sports broadcast quality, ultra high detail, cinematic, 4K.`
}

function getCacheKey(homeColor, awayColor, posterType) {
  const h = (homeColor || '').replace('#', '')
  const a = (awayColor || '').replace('#', '')
  return `${posterType}-${h}-${a}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { homeColor, awayColor, posterType } = req.body || {}
  if (!posterType) {
    return res.status(400).json({ error: 'Missing posterType' })
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return res.status(503).json({ error: 'OPENAI_API_KEY not configured' })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const cacheKey = getCacheKey(homeColor, awayColor, posterType)
  const bucketPath = `${cacheKey}.png`

  let supabase = null
  if (supabaseUrl && supabaseServiceKey) {
    supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: existing } = supabase.storage
      .from('poster-backgrounds')
      .getPublicUrl(bucketPath)

    if (existing?.publicUrl) {
      try {
        const check = await fetch(existing.publicUrl, { method: 'HEAD' })
        if (check.ok) {
          return res.status(200).json({ imageUrl: existing.publicUrl, cached: true })
        }
      } catch {}
    }
  }

  try {
    const prompt = buildPrompt(homeColor, awayColor, posterType)

    const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'hd',
        response_format: 'b64_json',
      }),
    })

    if (!openaiRes.ok) {
      const err = await openaiRes.text()
      console.error('OpenAI API error:', err)
      return res.status(502).json({ error: 'AI generation failed' })
    }

    const openaiData = await openaiRes.json()
    const b64 = openaiData.data?.[0]?.b64_json
    if (!b64) {
      return res.status(502).json({ error: 'No image data returned' })
    }

    const imageBuffer = Buffer.from(b64, 'base64')

    if (supabase) {
      try {
        await supabase.storage
          .from('poster-backgrounds')
          .upload(bucketPath, imageBuffer, {
            contentType: 'image/png',
            upsert: true,
          })

        const { data: publicUrl } = supabase.storage
          .from('poster-backgrounds')
          .getPublicUrl(bucketPath)

        if (publicUrl?.publicUrl) {
          return res.status(200).json({ imageUrl: publicUrl.publicUrl, cached: false })
        }
      } catch (storageErr) {
        console.error('Supabase Storage error:', storageErr)
      }
    }

    res.setHeader('Content-Type', 'application/json')
    return res.status(200).json({
      imageData: `data:image/png;base64,${b64}`,
      cached: false,
    })
  } catch (err) {
    console.error('Poster generation error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
