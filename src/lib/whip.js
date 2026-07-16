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
function waitForIceGathering(pc, ms = 8000) {
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

// Resolve once media can actually flow (ICE connected); reject if it fails or
// never connects. This is what turns a silent "handshake ok but no video" into a
// visible error the UI can act on.
function waitForConnection(pc, ms = 15000) {
  return new Promise((resolve, reject) => {
    const settle = (ok) => {
      clearTimeout(timer)
      pc.removeEventListener("iceconnectionstatechange", check)
      ok ? resolve() : reject(new Error("ice-failed"))
    }
    const check = () => {
      const s = pc.iceConnectionState
      if (s === "connected" || s === "completed") settle(true)
      else if (s === "failed" || s === "closed") settle(false)
    }
    const timer = setTimeout(() => settle(false), ms)
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
  try {
    await waitForConnection(pc)
  } catch (e) {
    try { for (const t of stream.getTracks()) t.stop() } catch { /* ignore */ }
    try { pc.close() } catch { /* ignore */ }
    throw e
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
