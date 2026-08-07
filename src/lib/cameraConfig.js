/**
 * Broadcast quality: what we ask the camera for, and what we let the encoder send.
 *
 * These are two different levers and both matter:
 *   - CAPTURE  (getUserMedia / track.applyConstraints) — the raw frames.
 *   - ENCODER  (RTCRtpSender.setParameters) — what actually goes on the wire.
 * Capturing 1080p60 and then letting the encoder choose is how you get a stream that
 * looks worse than 720p: the encoder spreads too few bits over too many pixels.
 *
 * THE CONSTRAINT THAT SHAPES ALL OF THIS: Cloudflare's WebRTC beta has no simulcast,
 * so there is exactly ONE quality and every viewer gets it. There is no adaptive
 * ladder to catch someone on a weak phone connection — pick high and they get nothing.
 * That is why the default is conservative and the UI states the cost out loud.
 */

const STORE_KEY = "stream_quality"

// Resolutions we offer. `kbps` is the encoder cap at 30fps — deliberately modest,
// since every viewer pays this bitrate and it bills against the TURN allowance.
export const RESOLUTIONS = [
  { id: "480", label: "480p — חסכוני", width: 854, height: 480, kbps: 800 },
  { id: "720", label: "720p — רגיל", width: 1280, height: 720, kbps: 1500 },
  { id: "1080", label: "1080p — איכות גבוהה", width: 1920, height: 1080, kbps: 3000 },
]

export const FRAME_RATES = [
  { id: 30, label: "30 fps — רגיל" },
  { id: 60, label: "60 fps — חלק (מומלץ לספורט)" },
]

// 60fps costs roughly 60% more bits, not 100% — consecutive frames differ less.
const FPS60_MULTIPLIER = 1.6

export const DEFAULT_QUALITY = { resolution: "720", frameRate: 30 }

const findRes = (id) => RESOLUTIONS.find((r) => r.id === id) || RESOLUTIONS[1]

// Target bitrate in kbps for a chosen quality — drives both the encoder cap and the
// "what will this cost" line in the UI.
export function targetKbps(quality) {
  const res = findRes(quality?.resolution)
  return Math.round(res.kbps * (quality?.frameRate === 60 ? FPS60_MULTIPLIER : 1))
}

// GB one viewer consumes per hour at this quality. Relay-first playback means this
// bills against the Cloudflare TURN allowance, so it is real money, not trivia.
export function gbPerViewerHour(quality) {
  return (targetKbps(quality) * 3600) / 8 / 1e6
}

export function loadQuality() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return { ...DEFAULT_QUALITY }
    const q = JSON.parse(raw)
    return {
      resolution: RESOLUTIONS.some((r) => r.id === q?.resolution) ? q.resolution : DEFAULT_QUALITY.resolution,
      frameRate: q?.frameRate === 60 ? 60 : 30,
    }
  } catch { return { ...DEFAULT_QUALITY } }
}

export function saveQuality(quality) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(quality)) } catch { /* private mode */ }
}

// `ideal` rather than `exact` throughout: a camera that can't do 60fps should hand back
// 30 instead of throwing OverconstrainedError and killing the broadcast outright.
export function videoConstraints(quality) {
  const res = findRes(quality?.resolution)
  return {
    facingMode: "environment",
    width: { ideal: res.width },
    height: { ideal: res.height },
    frameRate: { ideal: quality?.frameRate === 60 ? 60 : 30 },
  }
}

// Re-aim the camera mid-broadcast. No renegotiation needed — the track keeps its
// identity, only its output changes.
export async function applyQualityToTrack(track, quality) {
  if (!track) return null
  try {
    await track.applyConstraints(videoConstraints(quality))
  } catch { /* camera refused; getSettings() below reports what we actually have */ }
  return readSettings(track)
}

// Tell the encoder what to do with those frames.
// `maintain-framerate` is the right call for hockey: when bandwidth tightens, lose
// sharpness rather than smoothness — a smeared puck you can follow beats a crisp
// slideshow. `contentHint: motion` pushes the same preference into the encoder.
export async function applyQualityToSender(pc, quality) {
  if (!pc) return false
  const sender = pc.getSenders?.().find((s) => s.track?.kind === "video")
  if (!sender) return false
  try {
    const params = sender.getParameters()
    if (!params.encodings || !params.encodings.length) params.encodings = [{}]
    params.encodings[0].maxBitrate = targetKbps(quality) * 1000
    params.encodings[0].maxFramerate = quality?.frameRate === 60 ? 60 : 30
    params.degradationPreference = "maintain-framerate"
    await sender.setParameters(params)
    if (sender.track) sender.track.contentHint = "motion"
    return true
  } catch {
    // Safari ignores parts of setParameters; capture constraints still applied.
    return false
  }
}

// What the camera ACTUALLY gave us. Never show the request back to the user as if it
// were the result — asking for 60fps and silently getting 30 is the common case.
export function readSettings(track) {
  try {
    const s = track?.getSettings?.()
    if (!s) return null
    return {
      width: s.width ?? null,
      height: s.height ?? null,
      frameRate: s.frameRate ? Math.round(s.frameRate) : null,
    }
  } catch { return null }
}

// True when the camera fell short of what was asked — the UI says so plainly.
export function isDowngraded(actual, quality) {
  if (!actual) return false
  const res = findRes(quality?.resolution)
  const wantFps = quality?.frameRate === 60 ? 60 : 30
  const shortRes = actual.height != null && actual.height < res.height
  const shortFps = actual.frameRate != null && actual.frameRate < wantFps - 5
  return shortRes || shortFps
}
