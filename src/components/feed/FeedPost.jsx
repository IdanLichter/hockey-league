import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { format } from "date-fns"
import { Crown, Flame, Trophy, MapPin, FileText, ChevronDown, Heart, MessageCircle, Send, Loader2 } from "lucide-react"
import TeamLogo from "@/components/TeamLogo"
import { useAuth } from "@/lib/AuthContext"
import { likePost, unlikePost, getComments, createComment } from "@/lib/api"

function Avatar({ url, name, className = "w-9 h-9" }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?"
  return url
    ? <img src={url} alt="" className={`${className} rounded-full object-cover shrink-0`} />
    : <div className={`${className} rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold shrink-0`}>{initial}</div>
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

/* ---- Score (respects RTL gotcha: away first, home last) ---- */
function ScoreBlock({ away, home }) {
  return (
    <div className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white tabular-nums">
      <span>{away}</span>
      <span className="text-slate-300 dark:text-slate-600 mx-1">:</span>
      <span>{home}</span>
    </div>
  )
}

/* ============ CHAMPION ============ */
function ChampionPost({ post }) {
  const { team, seasonName } = post.data
  return (
    <motion.div {...fade} className="card p-5 border-amber-200 dark:border-amber-800 bg-gradient-to-l from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-800">
      <PostHeader
        icon={<Crown className="w-4 h-4 text-amber-500" />}
        label="אלופת העונה"
        dateLabel="סיכום עונה"
      />
      <div className="flex items-center gap-4">
        <TeamLogo team={team} size={14} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
            אלופת העונה {seasonName}
          </p>
          <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5 truncate">{team?.name}</h3>
        </div>
        <Trophy className="w-8 h-8 text-amber-400 shrink-0" />
      </div>
    </motion.div>
  )
}

/* ============ TOP SCORER ============ */
function TopScorerPost({ post }) {
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
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-white truncate">{player?.first_name} {player?.last_name}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{team?.name || ''}</p>
        </div>
        <div className="text-center shrink-0">
          <p className="text-2xl font-extrabold text-red-500 tabular-nums leading-none">{goals}</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">שערים</p>
        </div>
      </div>
    </motion.div>
  )
}

/* ============ GAME RESULT ============ */
const statusPill = "stat-pill bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"

function GameResultPost({ post, playersMap, teamsMap }) {
  const [open, setOpen] = useState(false)
  const { game, home, away, stats } = post.data
  const teamName = (id) => teamsMap[id]?.name || '—'

  return (
    <motion.div {...fade} layout className="card-hover overflow-hidden">
      <div className="p-4 sm:p-5">
        <PostHeader
          icon={<Trophy className="w-4 h-4 text-emerald-500" />}
          label="תוצאת משחק"
          date={post.date}
        />

        {/* Tags row */}
        <div className="flex items-center gap-2 mb-3">
          <span className={statusPill}>הסתיים</span>
          {game.game_type === 'פלייאוף' && <span className="stat-pill bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">פלייאוף</span>}
          {game.series_game && <span className="stat-pill bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">משחק {game.series_game}</span>}
        </div>

        {/* Match row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <TeamLogo team={home} size={10} />
            <div className="min-w-0">
              <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{home?.name}</p>
              <p className="text-[11px] text-slate-400">בית</p>
            </div>
          </div>

          {/* RTL gotcha: away_score first, home_score last */}
          <div className="px-4 text-center shrink-0">
            <ScoreBlock away={game.away_score} home={game.home_score} />
          </div>

          <div className="flex items-center gap-3 flex-1 min-w-0 flex-row-reverse">
            <TeamLogo team={away} size={10} />
            <div className="min-w-0 text-left">
              <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{away?.name}</p>
              <p className="text-[11px] text-slate-400">חוץ</p>
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
          <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{game.venue || '—'}</span>
          {stats.length > 0 && (
            <button
              onClick={() => setOpen(o => !o)}
              className="mr-auto flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              {open ? 'סגור' : 'פרטים'}
              <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
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
                                  <span className="text-slate-700 dark:text-slate-300">{p?.first_name} {p?.last_name}</span>
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
    </motion.div>
  )
}

/* ============ MILESTONE ============ */
function MilestonePost({ post }) {
  const { kind, name, teamName, goals, home, away, game } = post.data
  const bigGame = kind === 'big_game'
  const emoji = bigGame ? '🔥' : '🎩'
  const label = bigGame ? 'משחק ענק' : 'שלושער'
  const accent = bigGame
    ? "text-orange-600 dark:text-orange-400"
    : "text-emerald-600 dark:text-emerald-400"

  return (
    <motion.div {...fade} className="card p-4">
      <PostHeader
        icon={<span className="text-base leading-none">{emoji}</span>}
        label={label}
        date={post.date}
      />
      <p className="text-sm font-bold text-slate-900 dark:text-white">
        <span className={accent}>{name}</span> כבש {goals} שערים
      </p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
        {teamName ? `(${teamName}) • ` : ''}
        {home?.name} <span className="tabular-nums">{game.away_score} : {game.home_score}</span> {away?.name}
      </p>
    </motion.div>
  )
}

/* ============ HUMAN POST (Stage B2 + likes/comments) ============ */
function PostCard({ post, likedPostIds }) {
  const { user, openAuth } = useAuth()
  const { post: p, author, team } = post.data
  const name = author?.display_name || "חבר/ת הליגה"

  const [liked, setLiked] = useState(() => likedPostIds?.has?.(p.id) || false)
  const [likeCount, setLikeCount] = useState(p.like_count || 0)
  const [commentCount, setCommentCount] = useState(p.comment_count || 0)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [loadedComments, setLoadedComments] = useState(false)
  const [loadingComments, setLoadingComments] = useState(false)
  const [newComment, setNewComment] = useState("")
  const [posting, setPosting] = useState(false)

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

  return (
    <motion.div {...fade} className="card p-4">
      {/* Author header */}
      <div className="flex items-center gap-3 mb-3">
        <Avatar url={author?.avatar_url} name={name} className="w-9 h-9" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{name}</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {fmtDate(post.date)}{team ? ` · ${team.name}` : ""}
          </p>
        </div>
      </div>

      {/* Body */}
      <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed">{p.body}</p>

      {/* Actions */}
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center gap-5 text-xs">
        <button onClick={toggleLike} className={`flex items-center gap-1.5 font-semibold transition-colors ${liked ? "text-red-500" : "text-slate-500 dark:text-slate-400 hover:text-red-500"}`}>
          <Heart className={`w-4 h-4 ${liked ? "fill-current" : ""}`} />
          {likeCount > 0 ? <span>{likeCount}</span> : <span>אהבתי</span>}
        </button>
        <button onClick={toggleComments} className="flex items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400 hover:text-orange-500 transition-colors">
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
                  {comments.map(c => (
                    <div key={c.id} className="flex items-start gap-2.5">
                      <Avatar url={c.author?.avatar_url} name={c.author?.display_name} className="w-8 h-8" />
                      <div className="min-w-0 flex-1 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{c.author?.display_name || "חבר/ת הליגה"}</p>
                        <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">{c.body}</p>
                      </div>
                    </div>
                  ))}
                  {comments.length === 0 && <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-1">היו הראשונים להגיב</p>}

                  {user ? (
                    <form onSubmit={submitComment} className="flex items-center gap-2 pt-1">
                      <input
                        value={newComment}
                        onChange={e => setNewComment(e.target.value.slice(0, 1000))}
                        placeholder="כתבו תגובה…"
                        className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                      />
                      <button type="submit" disabled={posting || !newComment.trim()} className="shrink-0 w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center disabled:opacity-50">
                        {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      </button>
                    </form>
                  ) : (
                    <button onClick={openAuth} className="text-xs text-orange-600 dark:text-orange-400 font-semibold hover:underline pt-1">התחברו כדי להגיב</button>
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
export default function FeedPost({ post, playersMap, teamsMap, likedPostIds }) {
  switch (post.type) {
    case 'champion':
      return <ChampionPost post={post} />
    case 'top_scorer':
      return <TopScorerPost post={post} />
    case 'game_result':
      return <GameResultPost post={post} playersMap={playersMap} teamsMap={teamsMap} />
    case 'milestone':
      return <MilestonePost post={post} />
    case 'post':
      return <PostCard post={post} likedPostIds={likedPostIds} />
    default:
      return null
  }
}
