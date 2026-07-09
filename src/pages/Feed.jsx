import { useState, useEffect, useRef } from "react"
import { getGames, getTeams, getPlayers, getGameStats, getLeagueSetting, getPosts, getMyLikes } from "@/lib/api"
import { getItemLikes, getItemCommentCounts } from "@/lib/reactions"
import { Newspaper, RefreshCw } from "lucide-react"
import { motion } from "framer-motion"
import { useSeasonMode } from "@/App"
import { buildFeed } from "@/lib/feed"
import { attachEventPhotos } from "@/lib/eventPhotos"
import { getPhotoIndex } from "@/lib/media"
import FeedPost from "@/components/feed/FeedPost"
import Composer from "@/components/feed/Composer"
import FeedFilters, { matchesFilter } from "@/components/feed/FeedFilters"
import { StandingsWidget, NextGameWidget, LeadersWidget } from "@/components/feed/Widgets"

const SEASON_NAME = "2025-26"
const PAGE_SIZE = 25

export default function Feed() {
  const { seasonMode } = useSeasonMode()
  const [games, setGames] = useState([])
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [gameStats, setGameStats] = useState([])
  const [posts, setPosts] = useState([])
  const [photoIndex, setPhotoIndex] = useState({ photos: [], photoPlayers: [] })
  const [likedPostIds, setLikedPostIds] = useState(() => new Set())
  const [likedItems, setLikedItems] = useState(() => new Set())
  const [itemLikeCounts, setItemLikeCounts] = useState({})
  const [itemCommentCounts, setItemCommentCounts] = useState({})
  const [championId, setChampionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState("all")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)

  useEffect(() => { loadData() }, [])

  // Likes/comments for synthetic feed items (game results, milestones, …).
  // Loaded separately from loadData so it stays decoupled from other feed work.
  useEffect(() => {
    getItemLikes().then(({ counts, mine }) => { setItemLikeCounts(counts); setLikedItems(mine) }).catch(() => {})
    getItemCommentCounts().then(setItemCommentCounts).catch(() => {})
  }, [])

  const loadData = async () => {
    try {
      setLoading(true); setError(null)
      const [g, t, p, s, champ, po, likes, pidx] = await Promise.all([
        getGames(), getTeams(), getPlayers(), getGameStats(), getLeagueSetting('champion_team_id'), getPosts(), getMyLikes(),
        getPhotoIndex().catch(() => ({ photos: [], photoPlayers: [] })),
      ])
      setGames(g); setTeams(t); setPlayers(p); setGameStats(s); setChampionId(champ); setPosts(po); setLikedPostIds(new Set(likes)); setPhotoIndex(pidx)
    } catch (err) { console.error(err); setError("שגיאה בטעינת הנתונים") }
    finally { setLoading(false) }
  }

  // Reset pagination whenever the active filter changes
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [filter])

  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const playersMap = Object.fromEntries(players.map(p => [p.id, p]))

  const feed = attachEventPhotos(
    buildFeed({
      games, teams, players, gameStats, humanPosts: posts,
      championId, seasonName: SEASON_NAME, seasonMode,
    }),
    { photos: photoIndex.photos, photoPlayers: photoIndex.photoPlayers, players }
  )

  const counts = {
    all: feed.length,
    posts: feed.filter(p => matchesFilter(p, "posts")).length,
    results: feed.filter(p => matchesFilter(p, "results")).length,
    highlights: feed.filter(p => matchesFilter(p, "highlights")).length,
  }

  const handlePosted = (newPost) => {
    if (newPost) setPosts(prev => [newPost, ...prev])
  }

  const filtered = feed.filter(p => matchesFilter(p, filter))
  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  // Auto-paginate when the sentinel near the bottom scrolls into view
  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisibleCount(c => c + PAGE_SIZE) },
      { rootMargin: "600px 0px" }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, filtered.length])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="card p-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex flex-col items-center justify-center text-center gap-3 min-h-[300px]">
          <span className="text-red-700 dark:text-red-400 text-sm font-medium">{error}</span>
          <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> נסה שוב
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1500px] mx-auto p-4 sm:p-6 lg:p-8">
      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)_300px] lg:gap-6 lg:items-start">
        {/* (1) Filter rail — right-most in RTL */}
        <aside className="hidden lg:block lg:sticky lg:top-20 self-start">
          <FeedFilters active={filter} onChange={setFilter} counts={counts} />
        </aside>

        {/* (2) Center column — feed */}
        <div className="space-y-5 min-w-0">
          {/* Page header */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="page-title flex items-center gap-2.5">
              <Newspaper className="w-7 h-7 text-orange-500" /> המגרש
            </h1>
            <p className="page-subtitle mt-1">כל מה שקורה בליגה</p>
          </motion.div>

          <Composer onPosted={handlePosted} />

          {/* Mobile-only filters + compact widgets */}
          <div className="lg:hidden space-y-5">
            <FeedFilters orientation="horizontal" active={filter} onChange={setFilter} counts={counts} />
            <StandingsWidget teams={teams} />
            <NextGameWidget games={games} teams={teams} />
          </div>

          {/* Feed list */}
          {filtered.length === 0 ? (
            <div className="card p-10 text-center">
              <Newspaper className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-lg font-semibold text-slate-500 dark:text-slate-400">אין עדכונים להצגה</h3>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">נסו סינון אחר</p>
            </div>
          ) : (
            <div className="space-y-5">
              {visible.map(post => (
                <FeedPost key={post.id} post={post} playersMap={playersMap} teamsMap={teamsMap} likedPostIds={likedPostIds} likedItems={likedItems} itemLikeCounts={itemLikeCounts} itemCommentCounts={itemCommentCounts} />
              ))}
            </div>
          )}

          {/* Infinite-scroll sentinel + status */}
          {filtered.length > 0 && (
            <div className="flex flex-col items-center gap-2 pt-2">
              {hasMore && (
                <div ref={sentinelRef} className="flex items-center justify-center py-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-orange-500 border-t-transparent" />
                </div>
              )}
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                מציג {visible.length} מתוך {filtered.length}
              </p>
            </div>
          )}
        </div>

        {/* (3) Widget rail — left-most in RTL, own scroll */}
        <aside className="hidden lg:block lg:sticky lg:top-20 self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden space-y-5">
          <StandingsWidget teams={teams} />
          <NextGameWidget games={games} teams={teams} />
          <LeadersWidget players={players} teams={teams} />
        </aside>
      </div>
    </div>
  )
}
