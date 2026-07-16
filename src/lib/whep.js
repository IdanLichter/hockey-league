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

import { waitForIceGathering, waitForConnection } from "./whip"

const DEFAULT_ICE = [{ urls: "stun:stun.cloudflare.com:3478" }]

// Play a Cloudflare live input's WHEP stream into `videoEl`. Returns { pc, stop }.
// Throws "WHEP <status>" on a bad handshake, or "ice-failed" if the media
// connection can't be established (caller falls back to the VOD/iframe).
export async function playWHEP(playUrl, iceServers, videoEl) {
  const pc = new RTCPeerConnection({
    iceServers: iceServers?.length ? iceServers : DEFAULT_ICE,
    bundlePolicy: "max-bundle",
  })
  const stream = new MediaStream()
  pc.ontrack = (e) => {
    stream.addTrack(e.track)
    if (videoEl && videoEl.srcObject !== stream) videoEl.srcObject = stream
  }
  // We only receive.
  pc.addTransceiver("video", { direction: "recvonly" })
  pc.addTransceiver("audio", { direction: "recvonly" })

  await pc.setLocalDescription(await pc.createOffer())
  await waitForIceGathering(pc)

  const res = await fetch(playUrl, {
    method: "POST",
    headers: { "content-type": "application/sdp" },
    body: pc.localDescription.sdp,
  })
  if (!res.ok) {
    pc.close()
    throw new Error(`WHEP ${res.status}`)
  }
  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() })

  try {
    await waitForConnection(pc)
  } catch (e) {
    try { pc.close() } catch { /* ignore */ }
    throw e
  }

  const stop = () => {
    try { pc.close() } catch { /* ignore */ }
    if (videoEl) videoEl.srcObject = null
  }
  return { pc, stop }
}
