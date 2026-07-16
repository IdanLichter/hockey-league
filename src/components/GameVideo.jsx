import { useState, useEffect, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { Video, Radio, Plus, Trash2, ExternalLink, Youtube, Tag, Camera, Square } from "lucide-react"
import { useAuth } from "@/lib/AuthContext"
import {
  getGameVideo, attachVideo, detachVideo, addMarker, deleteMarker,
  subscribeGameVideo, parseYouTubeId, fmtClock, goLiveCloudflare, getViewerIceServers,
} from "@/lib/video"
import { publishWHIP } from "@/lib/whip"
import { playWHEP } from "@/lib/whep"

// Marker kinds → Hebrew label + emoji + pill colour (reuses the StatPills palette).
const KINDS = {
  goal:      { he: "גול",   emoji: "⚽", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500" },
  penalty:   { he: "עונשין", emoji: "🟥", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", dot: "bg-red-500" },
  period:    { he: "תקופה",  emoji: "⏱", cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300", dot: "bg-indigo-500" },
  save:      { he: "הצלה",   emoji: "🧤", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", dot: "bg-blue-500" },
  highlight: { he: "שיא",    emoji: "⭐", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", dot: "bg-amber-500" },
  other:     { he: "אחר",    emoji: "📍", cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300", dot: "bg-slate-400" },
}

// ---- YouTube IFrame API: load the script once, resolve when window.YT is ready.
let ytApiPromise = null
function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script")
      tag.id = "youtube-iframe-api"
      tag.src = "https://www.youtube.com/iframe_api"
      document.head.appendChild(tag)
    }
  })
  return ytApiPromise
}

// Embedded player. YT replaces a child node with an iframe, so we keep a stable
// host div and append/clear a child around it — safe across videoId changes.
function YouTubePlayer({ videoId, onReady }) {
  const hostRef = useRef(null)
  useEffect(() => {
    let cancelled = false, player = null
    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return
      const el = document.createElement("div")
      hostRef.current.appendChild(el)
      player = new YT.Player(el, {
        videoId,
        width: "100%", height: "100%",
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: { onReady: () => onReady?.(player) },
      })
    }).catch(() => {})
    return () => {
      cancelled = true
      try { player?.destroy?.() } catch { /* ignore */ }
      if (hostRef.current) hostRef.current.innerHTML = ""
    }
  }, [videoId])
  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" />
    </div>
  )
}

// Spectator player for a Cloudflare Stream live input.
//
// While LIVE we play via WHEP (WebRTC) with OUR TURN relay — Cloudflare produces
// no HLS for browser-published live, and its built-in player does WHEP without
// TURN, so viewers on strict/mobile networks get a black spinner. Our WHEP+TURN
// path works on any network (proven with a relay-only connection). For the
// recorded REPLAY (not live) Cloudflare serves HLS, so the standard iframe is
// fine and universal — we also fall back to it if the live WHEP can't connect
// (e.g. the broadcast already ended).
function CloudflarePlayer({ video, isLive }) {
  const code = video.cf_customer_code
  const videoRef = useRef(null)
  const sessionRef = useRef(null)
  const [mode, setMode] = useState("whep") // always try the live WHEP+TURN path first
  const [status, setStatus] = useState("connecting") // connecting | playing

  // Re-attempt the live path when the stream/liveness changes. We deliberately do
  // NOT gate WHEP on game.status (it can be stale) — we just try WHEP, and fall
  // back to the iframe (recording) only if there's no live broadcast to receive.
  useEffect(() => { setMode("whep") }, [video.video_id, isLive])

  useEffect(() => {
    if (mode !== "whep" || !code) return
    let cancelled = false
    let attempts = 0
    const maxAttempts = isLive ? 15 : 3 // live: ride out startup; VOD: fail fast to the recording
    setStatus("connecting")
    const tryPlay = async () => {
      try {
        const iceServers = await getViewerIceServers()
        if (cancelled) return
        const playUrl = `https://customer-${code}.cloudflarestream.com/${video.video_id}/webRTC/play`
        const session = await playWHEP(playUrl, iceServers, videoRef.current)
        if (cancelled) { session.stop(); return }
        sessionRef.current = session
        setStatus("playing")
      } catch {
        if (cancelled) return
        // The broadcast may not be live yet (Cloudflare 409 "not started"), or a
        // transient hiccup — retry for ~35s before giving up to the recording.
        attempts += 1
        if (attempts < maxAttempts) setTimeout(tryPlay, 3000)
        else setMode("iframe")
      }
    }
    tryPlay()
    return () => { cancelled = true; sessionRef.current?.stop?.(); sessionRef.current = null }
  }, [mode, code, video.video_id, isLive])

  if (!code) {
    return (
      <div className="w-full aspect-video bg-black rounded-xl grid place-items-center text-slate-400 text-sm">
        השידור נטען…
      </div>
    )
  }

  if (mode === "iframe") {
    const src = `https://customer-${code}.cloudflarestream.com/${video.video_id}/iframe?autoplay=true&muted=true&preload=auto`
    return (
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
        <iframe src={src} className="absolute inset-0 w-full h-full border-0" title="שידור"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowFullScreen />
      </div>
    )
  }

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
      <video ref={videoRef} autoPlay playsInline muted controls className="absolute inset-0 w-full h-full object-contain bg-black" />
      {status === "connecting" && (
        <div className="absolute inset-0 grid place-items-center bg-black/60 text-white text-sm">
          <span className="flex items-center gap-2"><Radio className="w-4 h-4 animate-pulse text-red-500" /> מתחבר לשידור…</span>
        </div>
      )}
    </div>
  )
}

// The streamer's own view while broadcasting: the local camera preview (instant,
// no round-trip) with a live pill and a stop control. Spectators meanwhile watch
// the CloudflarePlayer embed.
function LocalBroadcast({ previewRef, starting, onStop }) {
  return (
    <div className="space-y-3">
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
        <video ref={previewRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/60 text-white text-xs font-semibold">
          <Radio className="w-3.5 h-3.5 animate-pulse text-red-500" />
          {starting ? "מתחבר…" : "משדר"}
        </div>
      </div>
      <button onClick={onStop}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 transition-colors">
        <Square className="w-4 h-4 fill-current" /> הפסק שידור
      </button>
    </div>
  )
}

export default function GameVideo({ game, home, away, players = [] }) {
  const { user, isAdmin, isContentEditor, isJudgeRole, coachTeamIds, openAuth } = useAuth()
  const [video, setVideo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState(null)
  const [duration, setDuration] = useState(0)
  const [showAttach, setShowAttach] = useState(false)
  const [broadcast, setBroadcast] = useState(null) // null | 'starting' | { stop }
  const previewRef = useRef(null)
  const sessionRef = useRef(null)

  const gameId = game?.id
  const isLive = game?.status === "in_progress"
  // Video is managed by content creators (content_editor) + admin only — mirrors
  // the can_stream_game() backend gate. (Was admin/editor/judge/coach.)
  const canStream = isContentEditor || isAdmin
  const canMark = isAdmin || isContentEditor

  const load = useCallback(async () => {
    if (!gameId) return
    try { setVideo(await getGameVideo(gameId)) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [gameId])

  useEffect(() => { load() }, [load])

  // Live auto-appear: when the streamer attaches a video, spectators already on
  // the page see it without reloading.
  useEffect(() => {
    if (!gameId) return
    return subscribeGameVideo(gameId, load)
  }, [gameId, load])

  const onPlayerReady = (p) => {
    setPlayer(p)
    try { setDuration(p.getDuration?.() || 0) } catch { /* live: unknown */ }
  }
  const seek = (sec) => {
    if (!player) return
    try { player.seekTo(sec, true); player.playVideo?.() } catch { /* ignore */ }
  }

  // ---- Cloudflare browser broadcast (streamer side) ------------------------
  // getUserMedia → mint a live input (edge fn gates + inserts the row) → publish
  // the camera via WHIP. The row insert is what spectators see; this component
  // keeps the session so the local preview survives the row refresh.
  const startBroadcast = async () => {
    setBroadcast("starting")
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, audio: true,
      })
    } catch {
      alert("לא ניתן לגשת למצלמה/מיקרופון")
      setBroadcast(null)
      return
    }
    if (previewRef.current) {
      previewRef.current.srcObject = stream
      previewRef.current.muted = true
      previewRef.current.play?.().catch(() => {})
    }
    let data
    try {
      data = await goLiveCloudflare(gameId)
      if (!data?.whipUrl) throw new Error("no whip url")
      const session = await publishWHIP(data.whipUrl, stream, data.iceServers)
      sessionRef.current = session
      setBroadcast(session)
      load() // refresh the row (badge/kind); spectators already got the realtime insert
    } catch (e) {
      try { stream.getTracks().forEach((t) => t.stop()) } catch { /* ignore */ }
      if (previewRef.current) previewRef.current.srcObject = null
      // The edge fn already inserted the game_videos row; if the media never
      // connected, remove it so spectators don't see a dead "live" embed.
      if (data?.videoRowId) { try { await detachVideo(data.videoRowId) } catch { /* ignore */ } }
      const msg = String(e?.message || "")
      alert(msg.startsWith("ice-failed")
        ? `החיבור לשידור נכשל — הרשת חוסמת את השידור. נסו רשת אחרת.\n\n(טכני: ${msg.replace("ice-failed|", "")})`
        : (msg || "שגיאה בהתחלת השידור"))
      setBroadcast(null)
      load()
    }
  }

  const stopBroadcast = async () => {
    const session = sessionRef.current
    sessionRef.current = null
    setBroadcast(null)
    const s = previewRef.current?.srcObject
    if (s) { s.getTracks().forEach((t) => t.stop()); previewRef.current.srcObject = null }
    try { await session?.stop?.() } catch { /* ignore */ }
    load()
  }

  // Tear a live broadcast down if the streamer navigates away mid-stream.
  useEffect(() => () => {
    sessionRef.current?.stop?.()
    const s = previewRef.current?.srcObject
    if (s) s.getTracks?.().forEach((t) => t.stop())
  }, [])

  if (loading) return null
  // Nothing to show and the viewer can't add one → render nothing at all.
  if (!video && !canStream) return null

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
          {(isLive && video) || broadcast
            ? <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400"><Radio className="w-4 h-4 animate-pulse" /> שידור חי</span>
            : <><Video className="w-4 h-4 text-orange-500" /> וידאו מהמשחק</>}
        </h2>
        {video && canStream && (
          <button onClick={onDetach(video, load)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> הסר
          </button>
        )}
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {broadcast ? (
          <LocalBroadcast previewRef={previewRef} starting={broadcast === "starting"} onStop={stopBroadcast} />
        ) : video ? (
          <>
            {video.provider === "cloudflare"
              ? <CloudflarePlayer video={video} isLive={isLive} />
              : <YouTubePlayer videoId={video.video_id} onReady={onPlayerReady} />}

            {/* Proportional marker strip (hidden for live / unknown duration) */}
            {duration > 0 && video.markers.length > 0 && (
              <div className="relative h-2.5 rounded-full bg-slate-100 dark:bg-slate-800" dir="ltr">
                {video.markers.map((m) => (
                  <button key={m.id} onClick={() => seek(m.video_seconds)}
                    title={`${KINDS[m.kind]?.he || m.kind} · ${fmtClock(m.video_seconds)}`}
                    style={{ left: `${Math.min(100, (m.video_seconds / duration) * 100)}%` }}
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${KINDS[m.kind]?.dot || "bg-slate-400"} hover:scale-125 transition-transform`} />
                ))}
              </div>
            )}

            {/* Chapter list — click to seek */}
            {video.markers.length > 0 && (
              <div className="space-y-0.5">
                {video.markers.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 group">
                    <button onClick={() => seek(m.video_seconds)}
                      className="flex-1 flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-right">
                      <span dir="ltr" className="text-xs font-bold tabular-nums text-orange-500 shrink-0 w-12 text-left">{fmtClock(m.video_seconds)}</span>
                      <span className={`stat-pill !py-0 !px-1.5 shrink-0 ${KINDS[m.kind]?.cls}`}>{KINDS[m.kind]?.emoji} {KINDS[m.kind]?.he}</span>
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{m.label || ""}</span>
                    </button>
                    {canMark && (
                      <button onClick={onDeleteMarker(m.id, load)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canMark && (
              <MarkerForm player={player} videoRef={video.id} home={home} away={away} players={players} onAdded={load} />
            )}

            <a href={`https://www.youtube.com/watch?v=${video.video_id}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-orange-500 transition-colors">
              <ExternalLink className="w-3 h-3" /> פתח ב-YouTube
            </a>
          </>
        ) : (
          <div className="space-y-3">
            {isLive && canStream && (
              <button onClick={startBroadcast}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors">
                <Camera className="w-4 h-4" /> שדר עכשיו מהמצלמה
              </button>
            )}
            <AttachCard
              isLive={isLive} show={showAttach} setShow={setShowAttach}
              onAttach={onAttach(gameId, isLive, load)} requireAuth={!user ? openAuth : null}
              secondary={isLive && canStream}
            />
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ---- editor/streamer action handlers (curried so JSX stays flat) ------------
const onDetach = (video, reload) => async () => {
  if (!confirm("להסיר את הווידאו מהמשחק?")) return
  try { await detachVideo(video.id); reload() } catch (e) { alert(e.message) }
}
const onDeleteMarker = (id, reload) => async () => {
  try { await deleteMarker(id); reload() } catch (e) { alert(e.message) }
}
const onAttach = (gameId, isLive, reload) => async (url) => {
  await attachVideo(gameId, { url, kind: isLive ? "live" : "full" })
  reload()
}

// "Go live" / "add video" card shown to streamers when a game has no video yet.
function AttachCard({ isLive, show, setShow, onAttach, requireAuth, secondary = false }) {
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (requireAuth) { requireAuth(); return }
    if (!parseYouTubeId(url)) { setErr("קישור YouTube לא תקין"); return }
    try { setBusy(true); setErr(null); await onAttach(url); setUrl("") }
    catch (e2) { setErr(e2.message || "שגיאה") } finally { setBusy(false) }
  }

  if (!show) {
    // When the camera "go live" button is the primary CTA, this steps back to a
    // quiet "or paste a YouTube link" affordance.
    if (secondary) {
      return (
        <button onClick={() => setShow(true)}
          className="w-full text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
          או הדבק קישור YouTube לשידור
        </button>
      )
    }
    return (
      <button onClick={() => setShow(true)}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-colors ${isLive ? "bg-red-500 hover:bg-red-600" : "bg-orange-500 hover:bg-orange-600"}`}>
        {isLive ? <><Radio className="w-4 h-4" /> התחל שידור חי</> : <><Plus className="w-4 h-4" /> הוסף וידאו מהמשחק</>}
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {isLive && (
        <ol className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed list-decimal pr-4 space-y-0.5">
          <li>פתחו את אפליקציית YouTube (או Streamlabs) והתחילו שידור חי כ<span className="font-semibold">לא רשום</span> (Unlisted).</li>
          <li>העתיקו את הקישור לשידור.</li>
          <li>הדביקו כאן — השידור יופיע לכל הצופים באתר ובאפליקציה.</li>
        </ol>
      )}
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 focus-within:border-orange-400">
        <Youtube className="w-4 h-4 text-red-500 shrink-0" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" autoFocus
          placeholder="https://youtu.be/..." className="w-full bg-transparent py-2.5 text-sm outline-none text-left" />
      </div>
      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
      {isLive && <p className="text-[11px] text-slate-400">שימו לב: מוזיקת רקע במגרש עלולה להשתיק את השידור (זכויות יוצרים).</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-colors ${isLive ? "bg-red-500 hover:bg-red-600" : "bg-orange-500 hover:bg-orange-600"}`}>
          {busy ? "מחבר..." : isLive ? "שדר עכשיו" : "הוסף"}
        </button>
        <button type="button" onClick={() => setShow(false)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
          ביטול
        </button>
      </div>
    </form>
  )
}

// Editor tool: capture the player's current time and tag it as a marker.
function MarkerForm({ player, videoRef, home, away, players, onAdded }) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(0)
  const [kind, setKind] = useState("goal")
  const [label, setLabel] = useState("")
  const [playerId, setPlayerId] = useState("")
  const [busy, setBusy] = useState(false)

  const teamIds = [home?.id, away?.id].filter(Boolean)
  const roster = players.filter((p) => teamIds.includes(p.team_id))

  const capture = () => {
    if (!player) return
    try { setAt(Math.round(player.getCurrentTime?.() || 0)) } catch { /* ignore */ }
    setOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    try {
      setBusy(true)
      const p = roster.find((r) => r.id === playerId)
      await addMarker(videoRef, {
        videoSeconds: at, kind,
        label: label || (p ? `${p.first_name} ${p.last_name}` : null),
        playerId: playerId || null, teamId: p?.team_id || null,
      })
      setLabel(""); setPlayerId(""); setOpen(false); onAdded()
    } catch (e2) { alert(e2.message) } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button onClick={capture} disabled={!player}
        className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 disabled:opacity-50 transition-colors">
        <Tag className="w-3.5 h-3.5" /> סמן את המיקום הנוכחי
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500 dark:text-slate-400">בזמן</span>
        <span dir="ltr" className="font-bold tabular-nums text-orange-500">{fmtClock(at)}</span>
      </div>
      <div className="flex gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="filter-input text-sm flex-1">
          {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.he}</option>)}
        </select>
        <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="filter-input text-sm flex-1">
          <option value="">— ללא שחקן —</option>
          {roster.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
        </select>
      </div>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="תיאור (רשות)" className="filter-input w-full text-sm" />
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="flex-1 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-60 transition-colors">
          {busy ? "שומר..." : "הוסף סימון"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
          ביטול
        </button>
      </div>
    </form>
  )
}
