import { getTeamLogoPath } from './posterTeamLogos'
import { format } from 'date-fns'

const W = 1080, H = 1080
const FONT = 'Heebo'
const LEAGUE_LOGO_PATH = '/logos/main-logo.png'

// ─── Helpers ──────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

async function ensureFont() {
  await document.fonts.load(`bold 48px ${FONT}`)
  await document.fonts.load(`800 72px ${FONT}`)
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

function darkenColor(hex, amount = 0.4) {
  const { r, g, b } = hexToRgb(hex)
  return `rgb(${Math.floor(r * (1 - amount))},${Math.floor(g * (1 - amount))},${Math.floor(b * (1 - amount))})`
}

function drawCircularImage(ctx, img, x, y, radius) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2)
  ctx.restore()
}

function drawCircleFallback(ctx, x, y, radius, color, letter) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = color || '#6366f1'
  ctx.fill()
  ctx.font = `bold ${radius}px ${FONT}`
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(letter, x, y + 2)
  ctx.restore()
}

async function loadTeamLogo(team) {
  const path = getTeamLogoPath(team)
  if (!path) return null
  try { return await loadImage(path) } catch { return null }
}

function drawDiagonalStripes(ctx, w, h, color, alpha = 0.06) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  for (let i = -h; i < w + h; i += 60) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + h, h)
    ctx.stroke()
  }
  ctx.restore()
}

function drawAngularShape(ctx, points, color, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function formatHebrewDate(dateStr) {
  const d = new Date(dateStr)
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  const day = days[d.getDay()]
  return `יום ${day} | ${format(d, 'dd/MM/yyyy')}`
}

function formatTime(dateStr) {
  return format(new Date(dateStr), 'HH:mm')
}

function downloadCanvas(canvas, filename) {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

// ─── Match Day Poster ─────────────────────────────────────

export async function generateMatchDayPoster(games, teamsMap) {
  await ensureFont()

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Background: vibrant gradient
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#1a1a2e')
  bg.addColorStop(0.4, '#16213e')
  bg.addColorStop(1, '#0f3460')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Decorative diagonal stripes
  drawDiagonalStripes(ctx, W, H, '#f97316', 0.04)

  // Accent angular shapes
  drawAngularShape(ctx, [[0, 0], [400, 0], [0, 250]], '#f97316', 0.12)
  drawAngularShape(ctx, [[W, H], [W - 400, H], [W, H - 250]], '#e94560', 0.12)

  // Top orange accent bar
  const topBar = ctx.createLinearGradient(0, 0, W, 0)
  topBar.addColorStop(0, '#f97316')
  topBar.addColorStop(1, '#e94560')
  ctx.fillStyle = topBar
  ctx.fillRect(0, 0, W, 6)

  // League logo
  try {
    const logo = await loadImage(LEAGUE_LOGO_PATH)
    drawCircularImage(ctx, logo, W / 2, 80, 50)
  } catch {}

  // Title
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 64px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText('יום משחקים', W / 2, 175)

  // Date (from first game)
  if (games.length > 0) {
    ctx.font = `600 30px ${FONT}`
    const dateGrad = ctx.createLinearGradient(W / 2 - 200, 0, W / 2 + 200, 0)
    dateGrad.addColorStop(0, '#f97316')
    dateGrad.addColorStop(1, '#fb923c')
    ctx.fillStyle = dateGrad
    ctx.fillText(formatHebrewDate(games[0].game_date), W / 2, 225)
  }

  // Divider line
  const divGrad = ctx.createLinearGradient(240, 0, W - 240, 0)
  divGrad.addColorStop(0, 'transparent')
  divGrad.addColorStop(0.5, 'rgba(249,115,22,0.5)')
  divGrad.addColorStop(1, 'transparent')
  ctx.strokeStyle = divGrad
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(240, 260)
  ctx.lineTo(W - 240, 260)
  ctx.stroke()

  // Game cards
  const cardAreaTop = 290
  const cardAreaHeight = H - cardAreaTop - 80
  const cardH = Math.min(220, cardAreaHeight / games.length - 20)
  const totalCardsH = games.length * cardH + (games.length - 1) * 20
  const startY = cardAreaTop + (cardAreaHeight - totalCardsH) / 2

  for (let i = 0; i < games.length; i++) {
    const game = games[i]
    const homeTeam = teamsMap[game.home_team_id]
    const awayTeam = teamsMap[game.away_team_id]
    const y = startY + i * (cardH + 20)

    // Card background
    ctx.save()
    const cardX = 60, cardW = W - 120
    ctx.beginPath()
    const cr = 20
    ctx.roundRect(cardX, y, cardW, cardH, cr)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()

    const centerY = y + cardH / 2
    const logoRadius = Math.min(55, cardH * 0.22)

    // Home team (right side — RTL)
    const homeX = W - 180
    const homeLogo = homeTeam ? await loadTeamLogo(homeTeam) : null
    if (homeLogo) {
      drawCircularImage(ctx, homeLogo, homeX, centerY - 15, logoRadius)
    } else if (homeTeam) {
      drawCircleFallback(ctx, homeX, centerY - 15, logoRadius, homeTeam.primary_color, homeTeam.name[0])
    }
    ctx.textAlign = 'center'
    ctx.font = `700 20px ${FONT}`
    ctx.fillStyle = '#ffffff'
    if (homeTeam) ctx.fillText(homeTeam.name, homeX, centerY + logoRadius + 20)

    // Away team (left side)
    const awayX = 180
    const awayLogo = awayTeam ? await loadTeamLogo(awayTeam) : null
    if (awayLogo) {
      drawCircularImage(ctx, awayLogo, awayX, centerY - 15, logoRadius)
    } else if (awayTeam) {
      drawCircleFallback(ctx, awayX, centerY - 15, logoRadius, awayTeam.primary_color, awayTeam.name[0])
    }
    ctx.textAlign = 'center'
    ctx.font = `700 20px ${FONT}`
    ctx.fillStyle = '#ffffff'
    if (awayTeam) ctx.fillText(awayTeam.name, awayX, centerY + logoRadius + 20)

    // VS badge
    ctx.beginPath()
    ctx.arc(W / 2, centerY - 10, 28, 0, Math.PI * 2)
    const vsBg = ctx.createRadialGradient(W / 2, centerY - 10, 0, W / 2, centerY - 10, 28)
    vsBg.addColorStop(0, '#f97316')
    vsBg.addColorStop(1, '#ea580c')
    ctx.fillStyle = vsBg
    ctx.fill()
    ctx.font = `800 22px ${FONT}`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('VS', W / 2, centerY - 8)

    // Time
    ctx.font = `700 26px ${FONT}`
    ctx.fillStyle = '#f97316'
    ctx.fillText(formatTime(game.game_date), W / 2, centerY + 30)

    // Venue
    if (game.venue) {
      ctx.font = `400 18px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillText(game.venue, W / 2, centerY + 58)
    }
  }

  // Bottom bar
  ctx.fillStyle = 'rgba(249,115,22,0.15)'
  ctx.fillRect(0, H - 50, W, 50)
  ctx.font = `500 16px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.textAlign = 'center'
  ctx.fillText('ליגת הוקי גלגליות ישראל', W / 2, H - 22)

  // Bottom accent bar
  const botBar = ctx.createLinearGradient(0, 0, W, 0)
  botBar.addColorStop(0, '#f97316')
  botBar.addColorStop(1, '#e94560')
  ctx.fillStyle = botBar
  ctx.fillRect(0, H - 6, W, 6)

  return canvas
}

// ─── Single Match Poster ──────────────────────────────────

export async function generateSingleMatchPoster(game, teamsMap) {
  await ensureFont()

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  const homeTeam = teamsMap[game.home_team_id]
  const awayTeam = teamsMap[game.away_team_id]
  const homeColor = homeTeam?.primary_color || '#f97316'
  const awayColor = awayTeam?.primary_color || '#3b82f6'

  // Background: dark base
  ctx.fillStyle = '#0a0a1a'
  ctx.fillRect(0, 0, W, H)

  // Team color diagonal panels
  // Home team: right diagonal panel
  drawAngularShape(ctx, [[W, 0], [W * 0.45, 0], [W, H * 0.65]], homeColor, 0.25)
  drawAngularShape(ctx, [[W, 0], [W * 0.55, 0], [W, H * 0.5]], homeColor, 0.15)

  // Away team: left diagonal panel
  drawAngularShape(ctx, [[0, H], [W * 0.55, H], [0, H * 0.35]], awayColor, 0.25)
  drawAngularShape(ctx, [[0, H], [W * 0.45, H], [0, H * 0.5]], awayColor, 0.15)

  // Center glow
  const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 400)
  glow.addColorStop(0, 'rgba(249,115,22,0.08)')
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // Diagonal stripes overlay
  drawDiagonalStripes(ctx, W, H, '#fff', 0.02)

  // Top accent bar
  const topBar = ctx.createLinearGradient(0, 0, W, 0)
  topBar.addColorStop(0, homeColor)
  topBar.addColorStop(1, awayColor)
  ctx.fillStyle = topBar
  ctx.fillRect(0, 0, W, 6)

  // League logo
  try {
    const logo = await loadImage(LEAGUE_LOGO_PATH)
    drawCircularImage(ctx, logo, W / 2, 75, 45)
  } catch {}

  // "Match Day" subtitle
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 28px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText('ליגת הוקי גלגליות', W / 2, 140)

  // Team logos — large
  const logoRadius = 120
  const logoY = H / 2 - 40

  // Home team (right)
  const homeX = W - 230
  const homeLogo = homeTeam ? await loadTeamLogo(homeTeam) : null

  // Home glow
  ctx.save()
  ctx.beginPath()
  ctx.arc(homeX, logoY, logoRadius + 30, 0, Math.PI * 2)
  const homeGlow = ctx.createRadialGradient(homeX, logoY, logoRadius - 20, homeX, logoY, logoRadius + 30)
  homeGlow.addColorStop(0, homeColor + '40')
  homeGlow.addColorStop(1, 'transparent')
  ctx.fillStyle = homeGlow
  ctx.fill()
  ctx.restore()

  // Home logo circle border
  ctx.beginPath()
  ctx.arc(homeX, logoY, logoRadius + 4, 0, Math.PI * 2)
  ctx.strokeStyle = homeColor
  ctx.lineWidth = 3
  ctx.stroke()

  if (homeLogo) {
    drawCircularImage(ctx, homeLogo, homeX, logoY, logoRadius)
  } else if (homeTeam) {
    drawCircleFallback(ctx, homeX, logoY, logoRadius, homeColor, homeTeam.name[0])
  }

  // Home team name
  ctx.textAlign = 'center'
  ctx.font = `800 32px ${FONT}`
  ctx.fillStyle = '#ffffff'
  if (homeTeam) ctx.fillText(homeTeam.name, homeX, logoY + logoRadius + 45)

  // Away team (left)
  const awayX = 230
  const awayLogo = awayTeam ? await loadTeamLogo(awayTeam) : null

  // Away glow
  ctx.save()
  ctx.beginPath()
  ctx.arc(awayX, logoY, logoRadius + 30, 0, Math.PI * 2)
  const awayGlow = ctx.createRadialGradient(awayX, logoY, logoRadius - 20, awayX, logoY, logoRadius + 30)
  awayGlow.addColorStop(0, awayColor + '40')
  awayGlow.addColorStop(1, 'transparent')
  ctx.fillStyle = awayGlow
  ctx.fill()
  ctx.restore()

  // Away logo circle border
  ctx.beginPath()
  ctx.arc(awayX, logoY, logoRadius + 4, 0, Math.PI * 2)
  ctx.strokeStyle = awayColor
  ctx.lineWidth = 3
  ctx.stroke()

  if (awayLogo) {
    drawCircularImage(ctx, awayLogo, awayX, logoY, logoRadius)
  } else if (awayTeam) {
    drawCircleFallback(ctx, awayX, logoY, logoRadius, awayColor, awayTeam.name[0])
  }

  // Away team name
  ctx.textAlign = 'center'
  ctx.font = `800 32px ${FONT}`
  ctx.fillStyle = '#ffffff'
  if (awayTeam) ctx.fillText(awayTeam.name, awayX, logoY + logoRadius + 45)

  // VS element — center
  const vsY = logoY
  // VS glow background
  ctx.save()
  const vsGlow = ctx.createRadialGradient(W / 2, vsY, 0, W / 2, vsY, 80)
  vsGlow.addColorStop(0, 'rgba(249,115,22,0.3)')
  vsGlow.addColorStop(1, 'transparent')
  ctx.fillStyle = vsGlow
  ctx.beginPath()
  ctx.arc(W / 2, vsY, 80, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // VS diamond shape
  ctx.save()
  ctx.translate(W / 2, vsY)
  ctx.rotate(Math.PI / 4)
  const vsSize = 42
  ctx.beginPath()
  ctx.roundRect(-vsSize, -vsSize, vsSize * 2, vsSize * 2, 12)
  const vsBg = ctx.createLinearGradient(-vsSize, -vsSize, vsSize, vsSize)
  vsBg.addColorStop(0, '#f97316')
  vsBg.addColorStop(1, '#ea580c')
  ctx.fillStyle = vsBg
  ctx.fill()
  ctx.restore()

  ctx.font = `900 48px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('VS', W / 2, vsY + 2)

  // Bottom info bar
  const barY = H - 160
  const barH = 100
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.beginPath()
  ctx.roundRect(60, barY, W - 120, barH, 16)
  ctx.fill()

  // Thin color accent on info bar
  const barAccent = ctx.createLinearGradient(60, 0, W - 60, 0)
  barAccent.addColorStop(0, homeColor)
  barAccent.addColorStop(1, awayColor)
  ctx.fillStyle = barAccent
  ctx.fillRect(80, barY, W - 160, 3)

  // Date
  ctx.font = `700 28px ${FONT}`
  ctx.fillStyle = '#f97316'
  ctx.textAlign = 'center'
  ctx.fillText(formatHebrewDate(game.game_date), W / 2, barY + 38)

  // Time and venue
  const timeVenue = `${formatTime(game.game_date)}${game.venue ? '  •  ' + game.venue : ''}`
  ctx.font = `500 22px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText(timeVenue, W / 2, barY + 72)

  // Bottom accent bar
  const botBar = ctx.createLinearGradient(0, 0, W, 0)
  botBar.addColorStop(0, homeColor)
  botBar.addColorStop(1, awayColor)
  ctx.fillStyle = botBar
  ctx.fillRect(0, H - 6, W, 6)

  return canvas
}

export { downloadCanvas }
