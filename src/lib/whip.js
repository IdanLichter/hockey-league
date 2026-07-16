// Minimal WHIP publisher for Cloudflare Stream Live — no dependencies.
//
// WHIP handshake: POST an SDP offer (application/sdp) to the ingest URL, get an
// SDP answer. Cloudflare returns that URL as result.webRTC.url. We wait for full
// ICE gathering (non-trickle), POST, then — crucially — WAIT FOR THE ICE
// CONNECTION TO ACTUALLY ESTABLISH. On strict/mobile NATs the handshake succeeds
// but media can't flow without a TURN relay, so we surface that as a real error
// instead of falsely reporting "live". `iceServers` (Cloudflare STUN + TURN) come
// from the stream-golive edge fn; without them we fall back to STUN only (works
// on permissive networks, fails honestly on strict ones).

const DEFAULT_ICE = [{ urls: "stun:stun.cloudflare.com:3478" }]

// Resolve when ICE gathering completes, or after `ms` (generous cap — mobile
// networks can take a few seconds to gather a server-reflexive/relay candidate;
// the old 2s cap was cutting gathering off and shipping a host-only offer).
// Exported for the WHEP viewer path (lib/whep.js).
export function waitForIceGathering(pc, ms = 8000) {
  if (pc.iceGatheringState === "complete") return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      pc.removeEventListener("icegatheringstatechange", check)
      resolve()
    }
    const check = () => { if (pc.iceGatheringState === "complete") finish() }
    const timer = setTimeout(finish, ms)
    pc.addEventListener("icegatheringstatechange", check)
  })
}

// Resolve once media can actually flow (ICE/peer connected); reject on genuine
// failure or after `ms`. Exported for the WHEP viewer path. We listen to BOTH
// state events AND poll (belt-and-suspenders — a single missed event must never
// leave a connected stream reported as failed, which is the bug this replaces),
// and accept either iceConnectionState or the more reliable connectionState.
export function waitForConnection(pc, ms = 30000) {
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      clearInterval(poll)
      clearTimeout(timer)
      pc.removeEventListener("iceconnectionstatechange", check)
      pc.removeEventListener("connectionstatechange", check)
      ok ? resolve() : reject(new Error("ice-failed"))
    }
    const check = () => {
      const i = pc.iceConnectionState
      const c = pc.connectionState
      if (i === "connected" || i === "completed" || c === "connected") finish(true)
      else if (c === "failed" || i === "failed" || i === "closed" || c === "closed") finish(false)
    }
    pc.addEventListener("iceconnectionstatechange", check)
    pc.addEventListener("connectionstatechange", check)
    const poll = setInterval(check, 400)
    const timer = setTimeout(() => finish(false), ms)
    check() // in case it's already connected
  })
}

// Publish a camera+mic MediaStream to a Cloudflare WHIP endpoint.
// Returns { pc, stop }. Throws "ice-failed" if the media connection can't be
// established (needs TURN), or "WHIP <status>" on a bad handshake.
export async function publishWHIP(whipUrl, stream, iceServers) {
  const pc = new RTCPeerConnection({
    iceServers: iceServers?.length ? iceServers : DEFAULT_ICE,
    bundlePolicy: "max-bundle",
  })
  // Track which candidate types we gather — on failure this reveals whether the
  // TURN relay was even reachable (a "relay" candidate present) or the network
  // blocked the TURN ports entirely.
  const candTypes = {}
  pc.addEventListener("icecandidate", (e) => {
    const m = e.candidate && /typ (\w+)/.exec(e.candidate.candidate)
    if (m) candTypes[m[1]] = (candTypes[m[1]] || 0) + 1
  })
  for (const track of stream.getTracks()) pc.addTrack(track, stream)

  await pc.setLocalDescription(await pc.createOffer())
  await waitForIceGathering(pc)

  const res = await fetch(whipUrl, {
    method: "POST",
    headers: { "content-type": "application/sdp" },
    body: pc.localDescription.sdp,
  })
  if (!res.ok) {
    pc.close()
    throw new Error(`WHIP ${res.status}`)
  }
  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() })

  // Confirm the media path actually comes up (fails on strict NATs without TURN).
  // Generous 30s window — TURN-over-TCP/TLS negotiation on locked-down networks
  // is far slower than a direct connection, and cutting it off early looks like a
  // hard failure when it was merely still connecting.
  try {
    await waitForConnection(pc, 30000)
  } catch {
    const cands = Object.keys(candTypes).join("+") || "none"
    const state = pc.iceConnectionState
    try { for (const t of stream.getTracks()) t.stop() } catch { /* ignore */ }
    try { pc.close() } catch { /* ignore */ }
    // Encode a short diagnostic in the message so the UI can surface it: whether a
    // relay candidate was gathered (TURN reachable) and the final ICE state.
    throw new Error(`ice-failed|cands=${cands}|state=${state}`)
  }

  // WHIP hands back a resource URL (Location header) for teardown via DELETE.
  let resourceUrl = null
  const loc = res.headers.get("location")
  if (loc) { try { resourceUrl = new URL(loc, whipUrl).toString() } catch { /* ignore */ } }

  const stop = async () => {
    try { for (const t of stream.getTracks()) t.stop() } catch { /* ignore */ }
    try { pc.close() } catch { /* ignore */ }
    if (resourceUrl) { try { await fetch(resourceUrl, { method: "DELETE" }) } catch { /* ignore */ } }
  }
  return { pc, stop }
}
