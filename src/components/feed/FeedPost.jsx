import { useState, useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { format } from "date-fns"
import { Crown, Flame, Trophy, MapPin, FileText, ChevronDown, Heart, MessageCircle, Send, Loader2, Camera, ExternalLink, BadgeCheck, Check, RefreshCw, ArrowLeft } from "lucide-react"
import TeamLogo from "@/components/TeamLogo"
import { useAuth } from "@/lib/AuthContext"
import { likePost, unlikePost, getComments, createComment, editPost, deletePost, editComment, deleteComment } from "@/lib/api"
import { setPhotoOverride } from "@/lib/photoOverrides"
import ReactionBar from "@/components/feed/ReactionBar"
import ModerationMenu from "@/components/feed/ModerationMenu"
import { RoleBadge, deriveRoleItems } from "@/components/RoleBadges"
import { TARGET_POST, TARGET_COMMENT } from "@/lib/moderation"
import { FRIENDLY_GAME_TYPE } from "@/lib/leagueStats"

function Avatar({ url, name, className = "w-9 h-9" }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?"
  return url
    ? <img src={url} alt="" className={`${className} rounded-full object-cover shrink-0`} />
    : <div className={`${className} rounded-full bg-brand text-white flex items-center justify-center text-sm font-bold shrink-0`}>{initial}</div>
}

/* Wrap children in a link to a team page when the team exists, else render inert. */
function TeamLink({ team, className = "", children }) {
  if (!team?.id) return <span className={className}>{children}</span>
  return <Link to={`/teams/${team.id}`} className={className}>{children}</Link>
}

/* Wrap children in a link to a player page when a playerId is known, else render inert.
   Guest scorers and unpaired posters have no player page, so they stay non-clickable. */
function PlayerLink({ playerId, className = "", children }) {
  if (!playerId) return <span className={className}>{children}</span>
  return <Link to={`/players/${playerId}`} className={className}>{children}</Link>
}

const fmtDate = (d) => format(new Date(d), "d/M/yyyy")

function PostHeader({ icon, label, date, dateLabel }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-[11px] text-slate-400 dark:text-slate-500 mr-auto">{dateLabel || fmtDate(date)}</span>
    </div>
  )
}

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
}

/* ---- Auto-matched game photo (players' faces) attached to an event ---- */
// Feed thumbnails render in a ~360–750px column and are height-cropped (max-h-80),
// so a 1000px-wide source stays crisp on retina while shedding ~40% of the bytes a
// full 1280px source cost (Google Photos oversizing was the page's biggest payload).
const sizedUrl = (url, w = 1000) => (url ? url.replace(/=w\d+(-h\d+)?.*$/, `=w${w}`) : url)

function EventPhoto({ photo, itemKey, candidates = [], onRefreshed }) {
  const { isAdmin, isContentEditor } = useAuth()
  const [current, setCurrent] = useState(photo)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const imgRef = useRef(null)
  const [beamLeft, setBeamLeft] = useState(null)   // 0–1 horizontal center of the spotlight in the displayed image
  const [objPosY, setObjPosY] = useState(null)     // 0–100 % object-position-y that keeps the face in frame

  // Re-sync when the parent re-resolves this card (e.g. after the overrides map updates).
  useEffect(() => { setCurrent(photo) }, [photo])

  // Only single-player achievement photos get the spotlight, and only when we know where
  // the player's face is (faceCx/faceCy are 0–1 fractions of the original image w/h).
  const faceCx = current?.mode === "solo" && typeof current?.faceCx === "number" ? current.faceCx : null
  const faceCy = current?.mode === "solo" && typeof current?.faceCy === "number" ? current.faceCy : null

  // Map the face from image space into the displayed (object-cover cropped) box, so the beam
  // lands on the player horizontally and the vertical crop keeps the face in frame instead of
  // slicing it off with the default center crop.
  useEffect(() => {
    if (faceCx == null && faceCy == null) { setBeamLeft(null); setObjPosY(null); return }
    const el = imgRef.current
    if (!el) return
    const measure = () => {
      const cW = el.clientWidth, cH = el.clientHeight
      const nW = el.naturalWidth, nH = el.naturalHeight
      if (!cW || !cH || !nW || !nH) return
      const scale = Math.max(cW / nW, cH / nH)   // object-cover fills the box
      const dW = nW * scale                       // displayed image width (may exceed cW)
      const dH = nH * scale                        // displayed image height (may exceed cH)
      if (faceCx != null) {
        const offX = (cW - dW) / 2                 // object-position-x stays center (50%)
        setBeamLeft(Math.max(0, Math.min(1, (offX + faceCx * dW) / cW)))
      }
      if (faceCy != null) {
        // r = fraction of the image height that survives the crop. Choose the object-position-y
        // that centers the face in that visible band: p = (faceCy − r/2) / (1 − r), clamped.
        // r ≥ 1 means no vertical crop (e.g. narrow/mobile boxes) → leave it centered.
        const r = cH / dH
        const p = r >= 1 ? 0.5 : (faceCy - r / 2) / (1 - r)
        setObjPosY(Math.max(0, Math.min(1, p)) * 100)
      }
    }
    if (el.complete) measure()
    el.addEventListener("load", measure)
    window.addEventListener("resize", measure)
    return () => { el.removeEventListener("load", measure); window.removeEventListener("resize", measure) }
  }, [faceCx, faceCy, current?.photo_id])

  if (!current || !current.image_url) return null

  const caption = [current.album_title, current.album_date && fmtDate(current.album_date)]
    .filter(Boolean).join(" · ")
  const canCycle = candidates.length >= 2
  const cx100 = beamLeft == null ? null : beamLeft * 100
  const beamId = `beam-${String(itemKey || current.photo_id || "x").replace(/[^a-zA-Z0-9_-]/g, "")}`

  // Advance to the NEXT candidate (wrapping to 0 at the end; an unknown current → 0),
  // pin it for everyone, and update the displayed photo optimistically.
  const cycle = async () => {
    if (!canCycle || busy) return
    const idx = candidates.findIndex(c => c.photo_id === current.photo_id)
    const next = candidates[(idx + 1) % candidates.length]
    if (!next || next.photo_id === current.photo_id) return
    const prev = current
    setFailed(false); setBusy(true); setCurrent(next)
    try {
      await setPhotoOverride(itemKey, next.photo_id)
      onRefreshed?.(itemKey, next)
    } catch {
      setCurrent(prev); setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative mt-3">
      <a href={current.detail_url} target="_blank" rel="noopener noreferrer"
         className="group block relative rounded-xl overflow-hidden bg-slate-900">
        <img ref={imgRef} src={sizedUrl(current.image_url)} alt="" loading="lazy"
             style={objPosY != null ? { objectPosition: `50% ${objPosY}%` } : undefined}
             className="w-full max-h-80 object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
        {cx100 != null && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100"
               preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <filter id={`${beamId}-soft`} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.4" />
              </filter>
              <mask id={beamId}>
                <rect width="100" height="100" fill="white" />
                <polygon points={`${cx100 - 8},0 ${cx100 + 8},0 ${cx100 + 18},100 ${cx100 - 18},100`}
                         fill="black" filter={`url(#${beamId}-soft)`} />
              </mask>
            </defs>
            <rect width="100" height="100" fill="rgba(8,12,22,0.5)" mask={`url(#${beamId})`} />
          </svg>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-3 pt-6 pb-2">
          <Camera className="w-3.5 h-3.5 text-white/80 shrink-0" />
          <span className="text-[11px] font-medium text-white/90 truncate">{caption}</span>
          <ExternalLink className="w-3 h-3 text-white/50 mr-auto shrink-0" />
        </div>
      </a>

      {/* Admins + content editors: swap the auto-matched photo for the next candidate. */}
      {(isAdmin || isContentEditor) && (
        <div className="absolute top-2 left-2 flex items-center gap-2">
          <button
            type="button"
            onClick={cycle}
            disabled={!canCycle || busy}
            title={canCycle ? "החלף תמונה" : "אין תמונה חלופית"}
            aria-label="החלף תמונה"
            className="w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/75 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
          </button>
          {failed && (
            <span className="text-[11px] font-medium text-white bg-red-600/90 rounded-md px-2 py-1">
              השמירה נכשלה
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* ---- Score (respects RTL gotcha: away first, home last) ---- */
function ScoreBlock({ away, home, awayWin, homeWin }) {
  const decisive = awayWin || homeWin
  const cls = (win) => win
    ? "text-emerald-600 dark:text-emerald-400"
    : decisive ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-white"
  return (
    <div className="text-4xl sm:text-5xl font-black tracking-tighter tabular-nums leading-none">
      <span className={cls(awayWin)}>{away}</span>
      <span className="mx-1.5 align-middle text-2xl sm:text-3xl font-bold text-slate-300 dark:text-slate-600">:</span>
      <span className={cls(homeWin)}>{home}</span>
    </div>
  )
}

/* One team on the result row. side="home" flows normally (right in RTL);
   side="away" mirrors to the left. Winner is emerald + trophy, loser muted. */
function ResultTeam({ team, side, isWin, isLoss, label }) {
  const reverse = side === "away"
  return (
    <TeamLink team={team} className={`group flex items-center gap-2.5 flex-1 min-w-0 rounded-xl px-2 py-1.5 transition-colors ${reverse ? "flex-row-reverse" : ""} ${isWin ? "bg-emerald-50 dark:bg-emerald-900/20" : ""}`}>
      <TeamLogo team={team} size={12} />
      <div className={`min-w-0 ${reverse ? "text-left" : ""}`}>
        <p className={`text-sm sm:text-[15px] truncate flex items-center gap-1 group-hover:text-brand transition-colors ${reverse ? "flex-row-reverse" : ""} ${isWin ? "font-extrabold text-emerald-700 dark:text-emerald-300" : isLoss ? "font-semibold text-slate-400 dark:text-slate-500" : "font-bold text-slate-900 dark:text-white"}`}>
          {isWin && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
          <span className="truncate">{team?.name}</span>
        </p>
        <p className={`text-[11px] ${isWin ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-slate-400"}`}>{label}</p>
      </div>
    </TeamLink>
  )
}

/* ============ CHAMPION ============ */
function ChampionPost({ post, likedItems, itemLikeCounts, itemCommentCounts, blockedIds, onPhotoRefreshed }) {
  const { team, seasonName } = post.data
  return (
    <motion.div {...fade} className="card p-5 border-amber-200 dark:border-amber-800 bg-gradient-to-l from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-800">
      <PostHeader
        icon={<Crown className="w-4 h-4 text-amber-500" />}
        label="אלופת העונה"
        dateLabel="סיכום עונה"
      />
      <div className="flex items-center gap-4">
        <TeamLink team={team} className="shrink-0"><TeamLogo team={team} size={14} /></TeamLink>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
            אלופת העונה {seasonName}
          </p>
          <TeamLink team={team} className="block w-fit">
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5 truncate hover:text-brand transition-colors">{team?.name}</h3>
          </TeamLink>
        </div>
        <Trophy className="w-8 h-8 text-amber-400 shrink-0" />
      </div>
      <EventPhoto photo={post.data.photo} itemKey={post.id} candidates={post.data.photoCandidates} onRefreshed={onPhotoRefreshed} />
      <ReactionBar itemKey={post.id} liked={likedItems?.has?.(post.id)} likeCount={itemLikeCounts?.[post.id] || 0} commentCount={itemCommentCounts?.[post.id] || 0} blockedIds={blockedIds} />
    </motion.div>
  )
}

/* ============ TOP SCORER ============ */
function TopScorerPost({ post, likedItems, itemLikeCounts, itemCommentCounts, blockedIds, onPhotoRefreshed }) {
  const { player, team, goals } = post.data
  return (
    <motion.div {...fade} className="card p-5">
      <PostHeader
        icon={<Flame className="w-4 h-4 text-red-500" />}
        label="מלך השערים של העונה"
        dateLabel="סיכום עונה"
      />
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center bg-red-50 dark:bg-red-900/30">
          <Flame className="w-6 h-6 text-red-500" />
        </div>
        <div className="flex-1 min-w-0">
          <PlayerLink playerId={player?.id} className="block w-fit max-w-full">
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white truncate hover:text-brand transition-colors">{player?.first_name} {player?.last_name}</h3>
          </PlayerLink>
          <TeamLink team={team} className="block w-fit max-w-full">
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate hover:text-brand transition-colors">{team?.name || ''}</p>
          </TeamLink>
        </div>
        <div className="text-center shrink-0">
          <p className="text-2xl font-extrabold text-red-500 tabular-nums leading-none">{goals}</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">שערים</p>
        </div>
      </div>
      <EventPhoto photo={post.data.photo} itemKey={post.id} candidates={post.data.photoCandidates} onRefreshed={onPhotoRefreshed} />
      <ReactionBar itemKey={post.id} liked={likedItems?.has?.(post.id)} likeCount={itemLikeCounts?.[post.id] || 0} commentCount={itemCommentCounts?.[post.id] || 0} blockedIds={blockedIds} />
    </motion.div>
  )
}

/* ============ GAME RESULT ============ */
function GameResultPost({ post, playersMap, teamsMap, likedItems, itemLikeCounts, itemCommentCounts, blockedIds, onPhotoRefreshed }) {
  const [open, setOpen] = useState(false)
  const { game, home, away, stats } = post.data
  const teamName = (id) => teamsMap[id]?.name || '—'
  const homeWin = game.home_score > game.away_score
  const awayWin = game.away_score > game.home_score
  const tie = game.home_score === game.away_score

  return (
    <motion.div {...fade} layout className="card-hover overflow-hidden">
      <div className="p-4 sm:p-5">
        {/* Header — label + trophy on the right; type tags + date on the left */}
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">תוצאת משחק</span>
          <div className="mr-auto flex items-center gap-1.5 flex-wrap justify-end">
            {game.game_type === 'פלייאוף' && <span className="stat-pill badge-warning !py-0.5">פלייאוף</span>}
            {game.game_type === FRIENDLY_GAME_TYPE && <span className="stat-pill badge-neutral !py-0.5">ידידותי</span>}
            {game.series_game && <span className="stat-pill badge-info !py-0.5">משחק {game.series_game}</span>}
            <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">{fmtDate(post.date)}</span>
          </div>
        </div>

        {/* Match row — the score is the hero; winning side tinted + trophy-marked.
           RTL gotcha: home team renders first (right); ScoreBlock stays away:home. */}
        <div className="flex items-center gap-1 sm:gap-2">
          <ResultTeam team={home} side="home" isWin={homeWin} isLoss={awayWin}
            label={tie ? 'תיקו' : homeWin ? 'מנצחת' : 'בית'} />
          <div className="px-1 sm:px-2 text-center shrink-0">
            <ScoreBlock away={game.away_score} home={game.home_score} awayWin={awayWin} homeWin={homeWin} />
          </div>
          <ResultTeam team={away} side="away" isWin={awayWin} isLoss={homeWin}
            label={tie ? 'תיקו' : awayWin ? 'מנצחת' : 'חוץ'} />
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
          <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{game.venue || '—'}</span>
          <div className="mr-auto flex items-center gap-2">
            <Link to={`/games/${game.id}`} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold text-brand dark:text-brand-light hover:bg-brand/[0.06] dark:hover:bg-brand/10 transition-colors">
              לעמוד המשחק <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
            {stats.length > 0 && (
              <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                {open ? 'סגור' : 'פרטים'}
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        </div>

        <EventPhoto photo={post.data.photo} itemKey={post.id} candidates={post.data.photoCandidates} onRefreshed={onPhotoRefreshed} />
      </div>

      {/* Expanded box score */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-5 pb-5">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-3">סטטיסטיקות שחקנים</h4>
                {stats.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-4">לא הוזנו סטטיסטיקות למשחק זה</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-6">
                      {[game.home_team_id, game.away_team_id].map(tid => (
                        <div key={tid}>
                          <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">{teamName(tid)}</h5>
                          <div className="space-y-1">
                            {stats.filter(s => playersMap[s.player_id]?.team_id === tid).map(stat => {
                              const p = playersMap[stat.player_id]
                              return (
                                <div key={stat.id} className="flex items-center justify-between py-1 text-xs">
                                  <PlayerLink playerId={stat.player_id} className="text-slate-700 dark:text-slate-300 hover:text-brand transition-colors">{p?.first_name} {p?.last_name}</PlayerLink>
                                  <div className="flex gap-1.5">
                                    {stat.goals > 0 && <span className="stat-pill bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 !py-0 !px-1.5">⚽ {stat.goals}</span>}
                                    {stat.blue_cards > 0 && <span className="stat-pill bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 !py-0 !px-1.5">🟦 {stat.blue_cards}</span>}
                                    {stat.red_cards > 0 && <span className="stat-pill bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 !py-0 !px-1.5">🟥 {stat.red_cards}</span>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    {stats.some(s => s.is_guest_player) && (
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                        <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">אורחים</h5>
                        <div className="space-y-1">
                          {stats.filter(s => s.is_guest_player).map(stat => (
                            <div key={stat.id} className="flex items-center justify-between py-1 text-xs">
                              <span className="text-slate-700 dark:text-slate-300">
                                {stat.guest_player_name}
                                {stat.guest_player_original_team && <span className="text-slate-400"> ({stat.guest_player_original_team})</span>}
                              </span>
                              <div className="flex gap-1.5">
                                {stat.goals > 0 && <span className="stat-pill bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 !py-0 !px-1.5">⚽ {stat.goals}</span>}
                                {stat.blue_cards > 0 && <span className="stat-pill bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 !py-0 !px-1.5">🟦 {stat.blue_cards}</span>}
                                {stat.red_cards > 0 && <span className="stat-pill bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 !py-0 !px-1.5">🟥 {stat.red_cards}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 sm:px-5 pb-4">
        <ReactionBar itemKey={post.id} liked={likedItems?.has?.(post.id)} likeCount={itemLikeCounts?.[post.id] || 0} commentCount={itemCommentCounts?.[post.id] || 0} blockedIds={blockedIds} />
      </div>
    </motion.div>
  )
}

/* ============ MILESTONE ============ */
function MilestonePost({ post, likedItems, itemLikeCounts, itemCommentCounts, blockedIds, onPhotoRefreshed }) {
  const { kind, name, playerId, teamName, goals, home, away, game } = post.data
  const bigGame = kind === 'big_game'
  const emoji = bigGame ? '🔥' : '🎩'
  const label = bigGame ? 'משחק ענק' : 'שלושער'
  const accent = bigGame
    ? "text-brand dark:text-brand-light"
    : "text-emerald-600 dark:text-emerald-400"

  return (
    <motion.div {...fade} className="card p-4">
      <PostHeader
        icon={<span className="text-base leading-none">{emoji}</span>}
        label={label}
        date={post.date}
      />
      <p className="text-sm font-bold text-slate-900 dark:text-white">
        <PlayerLink playerId={playerId} className={`${accent} hover:underline`}>{name}</PlayerLink> כבש {goals} שערים
      </p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
        {teamName ? `(${teamName}) • ` : ''}
        <TeamLink team={home} className="hover:text-brand transition-colors">{home?.name}</TeamLink>{' '}
        {/* dir="ltr" bidi-isolates the score so RTL doesn't split "away:home" and
            mispair each digit with the wrong team (see hockey-league-rtl-score-gotcha). */}
        <span dir="ltr" className="tabular-nums">{game.away_score} : {game.home_score}</span>{' '}
        <TeamLink team={away} className="hover:text-brand transition-colors">{away?.name}</TeamLink>
      </p>
      <EventPhoto photo={post.data.photo} itemKey={post.id} candidates={post.data.photoCandidates} onRefreshed={onPhotoRefreshed} />
      <ReactionBar itemKey={post.id} liked={likedItems?.has?.(post.id)} likeCount={itemLikeCounts?.[post.id] || 0} commentCount={itemCommentCounts?.[post.id] || 0} blockedIds={blockedIds} />
    </motion.div>
  )
}

/* ============ HUMAN POST (Stage B2 + likes/comments) ============ */
function PostCard({ post, likedPostIds, blockedIds, roleBadges }) {
  const { user, openAuth } = useAuth()
  const { post: p, author, team } = post.data
  const name = author?.display_name || "חבר/ת הליגה"
  const linkedPlayerId = author?.player_id || null   // paired → has a player page
  // Author's public league role(s). No teamsMap here → coach shows as "מאמן"
  // (compact) rather than "מאמן · team", keeping the inline header short.
  const authorBadge = roleBadges?.[p.author_id] || null
  const authorRoleItems = authorBadge
    ? deriveRoleItems({ isAdmin: authorBadge.isAdmin, roles: authorBadge.roles })
    : []

  const [liked, setLiked] = useState(() => likedPostIds?.has?.(p.id) || false)
  const [likeCount, setLikeCount] = useState(p.like_count || 0)
  const [commentCount, setCommentCount] = useState(p.comment_count || 0)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [loadedComments, setLoadedComments] = useState(false)
  const [loadingComments, setLoadingComments] = useState(false)
  const [newComment, setNewComment] = useState("")
  const [posting, setPosting] = useState(false)

  // ---- Moderation (edit / soft-delete) for this post ----
  const [postBody, setPostBody] = useState(p.body)
  const [editingPost, setEditingPost] = useState(false)
  const [postDraft, setPostDraft] = useState(p.body)
  const [savingPost, setSavingPost] = useState(false)
  const [removed, setRemoved] = useState(false)   // optimistic delete → hide the whole card
  const [rowError, setRowError] = useState(null)

  // ---- Moderation for comments ----
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [commentDraft, setCommentDraft] = useState("")
  const [savingComment, setSavingComment] = useState(false)

  const startEditPost = () => { setPostDraft(postBody); setRowError(null); setEditingPost(true) }
  const saveEditPost = async () => {
    const text = postDraft.trim()
    if (!text || savingPost) return
    setSavingPost(true); setRowError(null)
    try {
      await editPost(p.id, text)
      setPostBody(text); setEditingPost(false)
    } catch { setRowError("עריכה נכשלה, נסו שוב") }
    finally { setSavingPost(false) }
  }
  const handleDeletePost = async () => {
    setRemoved(true); setRowError(null)
    try { await deletePost(p.id) }
    catch { setRemoved(false); setRowError("מחיקה נכשלה, נסו שוב") }
  }

  const saveEditComment = async (c) => {
    const text = commentDraft.trim()
    if (!text || savingComment) return
    setSavingComment(true)
    try {
      await editComment(c.id, text)
      setComments(cs => cs.map(x => x.id === c.id ? { ...x, body: text } : x))
      setEditingCommentId(null)
    } catch { /* keep the editor open on failure */ }
    finally { setSavingComment(false) }
  }
  const handleDeleteComment = async (c) => {
    const prev = comments
    setComments(cs => cs.filter(x => x.id !== c.id))
    setCommentCount(n => Math.max(0, n - 1))
    try { await deleteComment(c.id) }
    catch { setComments(prev); setCommentCount(n => n + 1) }
  }

  const visibleComments = comments.filter(c => !blockedIds?.has?.(c.author_id))

  const toggleLike = async () => {
    if (!user) { openAuth(); return }
    const next = !liked
    setLiked(next); setLikeCount(c => c + (next ? 1 : -1))
    try {
      next ? await likePost(p.id) : await unlikePost(p.id)
    } catch {
      setLiked(!next); setLikeCount(c => c + (next ? -1 : 1)) // revert
    }
  }

  const toggleComments = async () => {
    const opening = !showComments
    setShowComments(opening)
    if (opening && !loadedComments) {
      setLoadingComments(true)
      try {
        setComments(await getComments(p.id)); setLoadedComments(true)
      } catch { /* ignore */ }
      finally { setLoadingComments(false) }
    }
  }

  const submitComment = async (e) => {
    e.preventDefault()
    if (!user) { openAuth(); return }
    const text = newComment.trim()
    if (!text || posting) return
    setPosting(true)
    try {
      const c = await createComment(p.id, text)
      setComments(prev => [...prev, c])
      setCommentCount(n => n + 1)
      setNewComment("")
    } catch { /* ignore */ }
    finally { setPosting(false) }
  }

  if (removed) return null

  return (
    <motion.div {...fade} className="card p-4">
      {/* Author header */}
      <div className="flex items-center gap-3 mb-3">
        <PlayerLink playerId={linkedPlayerId} className="shrink-0">
          <Avatar url={author?.avatar_url} name={name} className="w-9 h-9" />
        </PlayerLink>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <PlayerLink playerId={linkedPlayerId} className="min-w-0">
              <p className={`text-sm font-bold text-slate-900 dark:text-white truncate ${linkedPlayerId ? "hover:text-brand transition-colors" : ""}`}>{name}</p>
            </PlayerLink>
            {linkedPlayerId ? (
              <span title="מקושר לשחקן — לחצו לעמוד השחקן" className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                <BadgeCheck className="w-3 h-3" /> שחקן
              </span>
            ) : (
              <span title="חשבון שאינו מקושר לשחקן" className="shrink-0 text-[10px] font-medium text-slate-400 dark:text-slate-500">אורח/ת</span>
            )}
            {authorRoleItems.map(it => <RoleBadge key={it.role} role={it.role} size="sm" />)}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <span>{fmtDate(post.date)}</span>
            {team && <>·<TeamLink team={team} className="hover:text-brand transition-colors">{team.name}</TeamLink></>}
          </p>
        </div>
        <ModerationMenu
          targetType={TARGET_POST}
          targetId={p.id}
          authorId={p.author_id}
          onEdit={startEditPost}
          onDelete={handleDeletePost}
        />
      </div>

      {/* Body (inline-editable for the author / admins) */}
      {editingPost ? (
        <div>
          <textarea
            value={postDraft}
            onChange={e => setPostDraft(e.target.value.slice(0, 2000))}
            rows={3}
            autoFocus
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
          />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={saveEditPost} disabled={savingPost || !postDraft.trim()}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50">
              {savingPost ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} שמירה
            </button>
            <button onClick={() => setEditingPost(false)} disabled={savingPost}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50">
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed">{postBody}</p>
      )}
      {rowError && <p className="text-xs text-red-500 mt-2">{rowError}</p>}

      {/* Actions */}
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center gap-5 text-xs">
        <button onClick={toggleLike} className={`flex items-center gap-1.5 font-semibold transition-colors ${liked ? "text-red-500" : "text-slate-500 dark:text-slate-400 hover:text-red-500"}`}>
          <Heart className={`w-4 h-4 ${liked ? "fill-current" : ""}`} />
          {likeCount > 0 ? <span>{likeCount}</span> : <span>אהבתי</span>}
        </button>
        <button onClick={toggleComments} className="flex items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400 hover:text-brand transition-colors">
          <MessageCircle className="w-4 h-4" />
          {commentCount > 0 ? <span>{commentCount}</span> : <span>תגובה</span>}
        </button>
      </div>

      {/* Comments */}
      <AnimatePresence>
        {showComments && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 space-y-3">
              {loadingComments ? (
                <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
              ) : (
                <>
                  {visibleComments.map(c => (
                    <div key={c.id} className="flex items-start gap-2.5">
                      <PlayerLink playerId={c.author?.player_id} className="shrink-0">
                        <Avatar url={c.author?.avatar_url} name={c.author?.display_name} className="w-8 h-8" />
                      </PlayerLink>
                      <div className="min-w-0 flex-1 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2">
                        <PlayerLink playerId={c.author?.player_id} className="w-fit max-w-full">
                          <p className={`text-xs font-bold text-slate-900 dark:text-white truncate ${c.author?.player_id ? "hover:text-brand transition-colors" : ""}`}>{c.author?.display_name || "חבר/ת הליגה"}</p>
                        </PlayerLink>
                        {editingCommentId === c.id ? (
                          <div className="mt-1">
                            <textarea
                              value={commentDraft}
                              onChange={e => setCommentDraft(e.target.value.slice(0, 1000))}
                              rows={2}
                              autoFocus
                              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
                            />
                            <div className="flex items-center gap-2 mt-1.5">
                              <button onClick={() => saveEditComment(c)} disabled={savingComment || !commentDraft.trim()}
                                className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50">
                                {savingComment ? <Loader2 className="w-3 h-3 animate-spin" /> : null} שמירה
                              </button>
                              <button onClick={() => setEditingCommentId(null)} disabled={savingComment}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50">
                                ביטול
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">{c.body}</p>
                        )}
                      </div>
                      <ModerationMenu
                        targetType={TARGET_COMMENT}
                        targetId={c.id}
                        authorId={c.author_id}
                        onEdit={() => { setEditingCommentId(c.id); setCommentDraft(c.body) }}
                        onDelete={() => handleDeleteComment(c)}
                      />
                    </div>
                  ))}
                  {visibleComments.length === 0 && <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-1">היו הראשונים להגיב</p>}

                  {user ? (
                    <form onSubmit={submitComment} className="flex items-center gap-2 pt-1">
                      <input
                        value={newComment}
                        onChange={e => setNewComment(e.target.value.slice(0, 1000))}
                        placeholder="כתבו תגובה…"
                        className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                      />
                      <button type="submit" disabled={posting || !newComment.trim()} className="shrink-0 w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center disabled:opacity-50">
                        {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      </button>
                    </form>
                  ) : (
                    <button onClick={openAuth} className="text-xs text-brand dark:text-brand-light font-semibold hover:underline pt-1">התחברו כדי להגיב</button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ============ Dispatcher ============ */
export default function FeedPost({ post, playersMap, teamsMap, roleBadges, likedPostIds, likedItems, itemLikeCounts, itemCommentCounts, blockedIds, onPhotoRefreshed }) {
  const rx = { likedItems, itemLikeCounts, itemCommentCounts, blockedIds, onPhotoRefreshed }
  switch (post.type) {
    case 'champion':
      return <ChampionPost post={post} {...rx} />
    case 'top_scorer':
      return <TopScorerPost post={post} {...rx} />
    case 'game_result':
      return <GameResultPost post={post} playersMap={playersMap} teamsMap={teamsMap} {...rx} />
    case 'milestone':
      return <MilestonePost post={post} {...rx} />
    case 'post':
      return <PostCard post={post} likedPostIds={likedPostIds} blockedIds={blockedIds} roleBadges={roleBadges} />
    default:
      return null
  }
}
