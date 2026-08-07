// Minimal WHEP player for Cloudflare Stream Live — no dependencies.
//
// Cloudflare produces NO HLS for browser-published (WebRTC/WHIP) live streams —
// live playback is WebRTC (WHEP) only. Cloudflare's built-in iframe player does
// WHEP but WITHOUT a TURN relay, so viewers on strict/mobile/CGNAT networks get
// a black screen + spinner (they can't traverse the NAT to Cloudflare). This
// client does the same WHEP handshake but with our TURN `iceServers`, so any
// network can watch (proven: a relay-only WHEP connection receives the stream).
//
// WHEP = the receive-side twin of WHIP: POST an SDP offer (recvonly) as
// application/sdp to the playback URL, get an answer, attach the received tracks.
//
// EVERY step records into a `diag` object and every throw carries it as
// `err.diag`. Without that the viewer path is undebuggable: a viewer who can't
// watch looks identical whether TURN was unreachable, the POST was refused, or
// ICE simply lost — and that ambiguity is exactly what /stream-debug resolves.

import { waitForIceGathering, waitForConnection } from "./whip"

const DEFAULT_ICE = [{ urls: "stun:stun.cloudflare.com:3478" }]

// True when the ICE list carries a real TURN relay (not just STUN). A viewer
// without this can only watch from a permissive network — the single most
// common cause of "works on my wifi, black screen everywhere else".
export function hasTurn(iceServers) {
  return (iceServers || []).some((s) => {
    const urls = Array.isArray(s?.urls) ? s.urls : [s?.urls]
    return urls.some((u) => typeof u === "string" && /^turns?:/.test(u))
  })
}

// Break an RTCIceCandidate down into the two things that matter for diagnosis:
// the candidate TYPE (host/srflx/relay) and, for relays, which transport reached
// the TURN server (udp / tcp / tls). A network that allows only 443 gathers no
// relay at all — Cloudflare's TURN-over-TLS listens on 5349, not 443.
export function summarizeCandidate(c) {
  const line = c?.candidate || ""
  const type = (/ typ (\w+)/.exec(line) || [])[1] || "unknown"
  const proto = (/^candidate:\S+ \d+ (\w+)/.exec(line) || [])[1]
  const url = c?.url || null
  // Which transport carried us TO the TURN server. `relayProtocol` is the direct
  // answer but not every browser sets it, so fall back to the server URL that
  // produced the candidate — turns: is always TLS, otherwise read transport=.
  let transport = c?.relayProtocol || null
  if (!transport && url) {
    if (url.startsWith("turns:")) transport = "tls"
    else transport = (/[?&]transport=(\w+)/.exec(url) || [])[1] || null
  }
  return {
    type,
    proto: proto ? proto.toLowerCase() : null,
    transport,                                // udp | tcp | tls (relay only)
    relayProtocol: c?.relayProtocol || null,   // raw browser value, when present
    url,                                       // which STUN/TURN server produced it
  }
}

const tally = (cands) =>
  cands.reduce((acc, c) => { acc[c.type] = (acc[c.type] || 0) + 1; return acc }, {})

// Gather ICE candidates and report what the network actually allowed — without
// contacting Cloudflare at all. This isolates "can this device reach our TURN
// relay?" from "can it reach the stream?", which is the first fork in the tree.
// `policy: 'relay'` forces relay-only: if that gathers nothing, TURN is blocked.
export async function probeIce(iceServers, { policy = null, timeoutMs = 12000 } = {}) {
  const t0 = performance.now()
  const pc = new RTCPeerConnection({
    iceServers: iceServers?.length ? iceServers : DEFAULT_ICE,
    bundlePolicy: "max-bundle",
    ...(policy ? { iceTransportPolicy: policy } : {}),
  })
  const candidates = []
  const errors = []
  pc.addEventListener("icecandidate", (e) => {
    if (!e.candidate) return
    candidates.push({ ...summarizeCandidate(e.candidate), atMs: Math.round(performance.now() - t0) })
  })
  // Surfaces TURN auth failures (401 = bad/expired credential) and unreachable
  // servers — the difference between "our creds are wrong" and "the network ate it".
  pc.addEventListener("icecandidateerror", (e) => {
    errors.push({ url: e.url || null, code: e.errorCode ?? null, text: e.errorText || null })
  })
  pc.addTransceiver("video", { direction: "recvonly" })
  pc.addTransceiver("audio", { direction: "recvonly" })
  await pc.setLocalDescription(await pc.createOffer())
  await waitForIceGathering(pc, timeoutMs)
  const out = {
    policy: policy || "all",
    gatherMs: Math.round(performance.now() - t0),
    complete: pc.iceGatheringState === "complete",
    types: tally(candidates),
    relayTransports: [...new Set(candidates.filter((c) => c.type === "relay").map((c) => c.transport || "?"))],
    candidates,
    errors,
  }
  try { pc.close() } catch { /* ignore */ }
  return out
}

// Which candidate pair actually carried the media — the honest answer to "did it
// go direct or through the relay?", and whether bytes moved at all.
export async function readSelectedPair(pc) {
  try {
    const stats = await pc.getStats()
    let pairId = null
    stats.forEach((r) => { if (r.type === "transport" && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId })
    let pair = pairId ? stats.get(pairId) : null
    if (!pair) stats.forEach((r) => { if (!pair && r.type === "candidate-pair" && r.state === "succeeded") pair = r })
    if (!pair) return null
    const l = pair.localCandidateId ? stats.get(pair.localCandidateId) : null
    const r = pair.remoteCandidateId ? stats.get(pair.remoteCandidateId) : null
    const fmt = (c) => (c ? `${c.candidateType}/${c.protocol}${c.relayProtocol ? `:${c.relayProtocol}` : ""}` : null)
    return {
      local: fmt(l),
      remote: fmt(r),
      bytesReceived: pair.bytesReceived ?? null,
      rttMs: pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null,
    }
  } catch { return null }
}

// Is real video actually arriving? ICE can connect and still deliver nothing —
// distinguishing those two is the whole point of instrumenting the viewer.
export async function readInbound(pc) {
  try {
    const stats = await pc.getStats()
    const out = { video: null, audio: null }
    stats.forEach((r) => {
      if (r.type !== "inbound-rtp") return
      const kind = r.kind || r.mediaType
      if (kind === "video") out.video = { bytes: r.bytesReceived ?? 0, frames: r.framesDecoded ?? 0, packets: r.packetsReceived ?? 0 }
      if (kind === "audio") out.audio = { bytes: r.bytesReceived ?? 0, packets: r.packetsReceived ?? 0 }
    })
    return out
  } catch { return null }
}

// Play a Cloudflare live input's WHEP stream into `videoEl`.
// Returns { pc, stop, diag }. Throws on failure with `err.diag` attached — the
// `stage` field says exactly where it died: ice-gather | whep-post | connect.
export async function playWHEP(playUrl, iceServers, videoEl, { policy = null } = {}) {
  const t0 = performance.now()
  const diag = {
    stage: "setup",
    policy: policy || "all",
    iceServerCount: iceServers?.length || 0,
    hasTurn: hasTurn(iceServers),
    candidates: [], types: {}, relayTransports: [], iceErrors: [],
    gatherMs: null, gatherComplete: null,
    whepStatus: null, whepMs: null,
    connectMs: null, iceConnectionState: null, connectionState: null,
    selectedPair: null, error: null,
  }
  const fail = (stage, err) => {
    diag.stage = stage
    diag.error = String(err?.message || err)
    diag.iceConnectionState = pc.iceConnectionState
    diag.connectionState = pc.connectionState
    const e = err instanceof Error ? err : new Error(String(err))
    e.diag = diag
    return e
  }

  const pc = new RTCPeerConnection({
    iceServers: iceServers?.length ? iceServers : DEFAULT_ICE,
    bundlePolicy: "max-bundle",
    ...(policy ? { iceTransportPolicy: policy } : {}),
  })
  pc.addEventListener("icecandidate", (e) => {
    if (!e.candidate) return
    diag.candidates.push({ ...summarizeCandidate(e.candidate), atMs: Math.round(performance.now() - t0) })
  })
  pc.addEventListener("icecandidateerror", (e) => {
    diag.iceErrors.push({ url: e.url || null, code: e.errorCode ?? null, text: e.errorText || null })
  })

  const stream = new MediaStream()
  pc.ontrack = (e) => {
    stream.addTrack(e.track)
    if (videoEl && videoEl.srcObject !== stream) videoEl.srcObject = stream
  }
  // We only receive.
  pc.addTransceiver("video", { direction: "recvonly" })
  pc.addTransceiver("audio", { direction: "recvonly" })

  diag.stage = "ice-gather"
  try {
    await pc.setLocalDescription(await pc.createOffer())
    await waitForIceGathering(pc)
  } catch (e) {
    try { pc.close() } catch { /* ignore */ }
    throw fail("ice-gather", e)
  }
  diag.gatherMs = Math.round(performance.now() - t0)
  diag.gatherComplete = pc.iceGatheringState === "complete"
  diag.types = tally(diag.candidates)
  diag.relayTransports = [...new Set(diag.candidates.filter((c) => c.type === "relay").map((c) => c.transport || "?"))]

  diag.stage = "whep-post"
  const tPost = performance.now()
  let res
  try {
    res = await fetch(playUrl, {
      method: "POST",
      headers: { "content-type": "application/sdp" },
      body: pc.localDescription.sdp,
    })
  } catch (e) {
    // A thrown fetch here is CORS / DNS / TLS-interception — NOT an ICE problem.
    try { pc.close() } catch { /* ignore */ }
    throw fail("whep-post", new Error(`WHEP fetch failed: ${e?.message || e}`))
  }
  diag.whepMs = Math.round(performance.now() - tPost)
  diag.whepStatus = res.status
  if (!res.ok) {
    try { pc.close() } catch { /* ignore */ }
    // 409 = Cloudflare has no live media yet (broadcast not started / already ended).
    throw fail("whep-post", new Error(`WHEP ${res.status}`))
  }
  try {
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() })
  } catch (e) {
    try { pc.close() } catch { /* ignore */ }
    throw fail("whep-answer", e)
  }

  // WHEP hands back a resource URL (Location header) for teardown via DELETE.
  // Without this every retry leaves an abandoned session on Cloudflare's side.
  let resourceUrl = null
  const loc = res.headers.get("location")
  if (loc) { try { resourceUrl = new URL(loc, playUrl).toString() } catch { /* ignore */ } }
  const teardown = () => {
    try { pc.close() } catch { /* ignore */ }
    if (videoEl) videoEl.srcObject = null
    if (resourceUrl) { fetch(resourceUrl, { method: "DELETE", keepalive: true }).catch(() => {}) }
  }

  diag.stage = "connect"
  const tConn = performance.now()
  try {
    await waitForConnection(pc)
  } catch (e) {
    diag.connectMs = Math.round(performance.now() - tConn)
    const err = fail("connect", e)
    teardown()
    throw err
  }
  diag.connectMs = Math.round(performance.now() - tConn)
  diag.iceConnectionState = pc.iceConnectionState
  diag.connectionState = pc.connectionState
  diag.selectedPair = await readSelectedPair(pc)
  diag.stage = "playing"

  return { pc, stop: teardown, diag }
}
