// Minimal WHIP publisher for Cloudflare Stream Live — no dependencies.
//
// WHIP (WebRTC-HTTP Ingestion Protocol) is a one-shot handshake: POST an SDP
// offer with Content-Type: application/sdp to the ingest URL, get an SDP answer
// back. Cloudflare returns that ingest URL as result.webRTC.url when a live input
// is created (see supabase/functions/stream-golive). Cloudflare supports
// non-trickle ICE, so we gather candidates first, then POST once.

const ICE_SERVERS = [{ urls: "stun:stun.cloudflare.com:3478" }]

// Resolve when ICE gathering completes, or after `ms` as a backstop — host+srflx
// candidates gather in well under 2s on normal networks; the timeout keeps a
// stalled network from hanging "go live" forever.
function waitForIceGathering(pc, ms = 2000) {
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

// Publish a camera+mic MediaStream to a Cloudflare WHIP endpoint.
// Returns { pc, stop } where stop() tears the broadcast down. Throws on a failed
// handshake (caller stops the tracks + surfaces the error).
export async function publishWHIP(whipUrl, stream) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: "max-bundle" })
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
