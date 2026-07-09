import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { format } from "date-fns"
import { Crown, Flame, Trophy, MapPin, FileText, ChevronDown } from "lucide-react"
import TeamLogo from "@/components/TeamLogo"

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

/* ============ HUMAN POST (Stage B2) ============ */
function HumanPostCard({ post }) {
  const { post: p, author, team } = post.data
  const name = author?.display_name || "חבר/ת הליגה"
  const initial = name.trim().charAt(0).toUpperCase() || "?"
  return (
    <motion.div {...fade} className="card p-4">
      <div className="flex items-center gap-3 mb-3">
        {author?.avatar_url ? (
          <img src={author.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold shrink-0">{initial}</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{name}</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {fmtDate(post.date)}{team ? ` · ${team.name}` : ""}
          </p>
        </div>
      </div>
      <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed">{p.body}</p>
    </motion.div>
  )
}

/* ============ Dispatcher ============ */
export default function FeedPost({ post, playersMap, teamsMap }) {
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
      return <HumanPostCard post={post} />
    default:
      return null
  }
}
