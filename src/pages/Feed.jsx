import { useState, useEffect, useRef, useMemo } from "react"
import { Link } from "react-router-dom"
import { getGames, getTeams, getPlayers, getGameStats, getLeagueSetting, getPosts, getMyLikes, getRoleBadges } from "@/lib/api"
import { getItemLikes, getItemCommentCounts } from "@/lib/reactions"
import { getMyBlocks } from "@/lib/moderation"
import { useAuth } from "@/lib/AuthContext"
import { RefreshCw, Smartphone } from "lucide-react"
import { Rink } from "@/components/icons/HockeyIcons"
import { motion } from "framer-motion"
import { useSeasonMode } from "@/App"
import { buildFeed } from "@/lib/feed"
import { attachEventPhotos } from "@/lib/eventPhotos"
import { getPhotoIndex } from "@/lib/media"
import { getPhotoOverrides } from "@/lib/photoOverrides"
import FeedPost from "@/components/feed/FeedPost"
import Composer from "@/components/feed/Composer"
import LiveGameBanner from "@/components/LiveGameBanner"
import { useLiveGames } from "@/lib/useLiveGames"
import FeedFilters, { matchesFilter } from "@/components/feed/FeedFilters"
import { StandingsWidget, NextGameWidget, LeadersWidget } from "@/components/feed/Widgets"
import OnlinePresence from "@/components/OnlinePresence"

const SEASON_NAME = "2025-26"
const PAGE_SIZE = 25

export default function Feed() {
  const { seasonMode } = useSeasonMode()
  const { user } = useAuth()
  const [games, setGames] = useState([])
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [gameStats, setGameStats] = useState([])
  const [posts, setPosts] = useState([])
  const [roleBadges, setRoleBadges] = useState({}) // { [userId]: { isAdmin, roles } }
  const [photoIndex, setPhotoIndex] = useState({ photos: [], photoPlayers: [] })
  const [photoOverrides, setPhotoOverrides] = useState({})
  const [likedPostIds, setLikedPostIds] = useState(() => new Set())
  const [likedItems, setLikedItems] = useState(() => new Set())
  const [itemLikeCounts, setItemLikeCounts] = useState({})
  const [itemCommentCounts, setItemCommentCounts] = useState({})
  const [blockedIds, setBlockedIds] = useState(() => new Set())
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

  // The viewer's block list — loaded only when signed in (skips the round trip for
  // guests). Used to hide blocked authors' posts + comments across the feed.
  useEffect(() => {
    if (!user) { setBlockedIds(new Set()); return }
    let alive = true
    getMyBlocks().then(ids => { if (alive) setBlockedIds(new Set(ids)) }).catch(() => {})
    return () => { alive = false }
  }, [user])

  // The photo index is heavy (thousands of rows) and only decorates cards, so it
  // loads separately — the feed paints immediately and photos fill in a moment later.
  // The admin photo overrides ride alongside it (a public read → guests get them too).
  useEffect(() => {
    getPhotoIndex().then(setPhotoIndex).catch(() => {})
    getPhotoOverrides().then(setPhotoOverrides).catch(() => {})
  }, [])

  // League-role badges for post authors — fetched once posts are known so a
  // member's role (מנהל / מאמן / עורך תוכן / שופט) shows next to their name.
  useEffect(() => {
    const authorIds = posts.map(p => p.author_id).filter(Boolean)
    if (!authorIds.length) return
    getRoleBadges(authorIds).then(setRoleBadges).catch(() => {})
  }, [posts])

  const loadData = async () => {
    try {
      setLoading(true); setError(null)
      const [g, t, p, s, champ, po, likes] = await Promise.all([
        getGames(), getTeams(), getPlayers(), getGameStats(), getLeagueSetting('champion_team_id'), getPosts(), getMyLikes(),
      ])
      setGames(g); setTeams(t); setPlayers(p); setGameStats(s); setChampionId(champ); setPosts(po); setLikedPostIds(new Set(likes))
    } catch (err) { console.error(err); setError("שגיאה בטעינת הנתונים") }
    finally { setLoading(false) }
  }

  // Reset pagination whenever the active filter changes
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [filter])

  const teamsMap = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams])
  const playersMap = useMemo(() => Object.fromEntries(players.map(p => [p.id, p])), [players])
  const gamesById = useMemo(() => Object.fromEntries(games.map(g => [g.id, g])), [games])

  // Games being officiated right now — realtime, independent of the feed load.
  const liveGames = useLiveGames()

  // Rebuilds only when the underlying data changes — not on every scroll/like re-render.
  const feed = useMemo(() => attachEventPhotos(
    buildFeed({
      games, teams, players, gameStats,
      humanPosts: posts.filter(p => !blockedIds.has(p.author_id)),
      championId, seasonName: SEASON_NAME, seasonMode,
    }),
    { photos: photoIndex.photos, photoPlayers: photoIndex.photoPlayers, players },
    photoOverrides
  ), [games, teams, players, gameStats, posts, championId, seasonMode, photoIndex, blockedIds, photoOverrides])

  const counts = useMemo(() => ({
    all: feed.length,
    posts: feed.filter(p => matchesFilter(p, "posts")).length,
    results: feed.filter(p => matchesFilter(p, "results")).length,
    highlights: feed.filter(p => matchesFilter(p, "highlights")).length,
  }), [feed])

  const handlePosted = (newPost) => {
    if (newPost) setPosts(prev => [newPost, ...prev])
  }

  // An admin refreshed a card's photo — mirror the new pin into the overrides map so
  // the memo re-resolves that card in place (no refetch). photo === null → "no photo".
  const handlePhotoRefreshed = (itemKey, photo) => {
    setPhotoOverrides(prev => ({ ...prev, [itemKey]: photo?.photo_id ?? null }))
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
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-brand border-t-transparent" />
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
          {/* Page header — title on the right (RTL), "download the app" banner on the left */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="page-title flex items-center gap-2.5">
                  <Rink className="w-7 h-7 text-brand" /> המגרש
                </h1>
                <p className="page-subtitle mt-1">כל מה שקורה בליגה</p>
              </div>
              {/* Live "who's online" count (Realtime Presence), beside the title */}
              <OnlinePresence />
            </div>

            <Link
              to="/app"
              className="group shrink-0 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-l from-brand to-brand-hover px-3.5 py-2.5 text-white shadow-sm ring-1 ring-brand/20 hover:shadow-md hover:brightness-105 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label="הורידו את האפליקציה"
            >
              <Smartphone className="w-5 h-5 shrink-0 transition-transform group-hover:-translate-y-0.5" />
              <span className="leading-tight text-right">
                <span className="block text-[13px] font-black">הורידו את האפליקציה!</span>
                <span className="block text-[11px] font-medium text-white/85">iPhone · Android</span>
              </span>
            </Link>
          </motion.div>

          {/* Live now — pinned above the composer when a game is being officiated */}
          <LiveGameBanner liveGames={liveGames} gamesById={gamesById} teamsMap={teamsMap} />

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
              <Rink className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-lg font-semibold text-slate-500 dark:text-slate-400">אין עדכונים להצגה</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">נסו סינון אחר</p>
            </div>
          ) : (
            <div className="space-y-5">
              {visible.map(post => (
                <FeedPost key={post.id} post={post} playersMap={playersMap} teamsMap={teamsMap} roleBadges={roleBadges} likedPostIds={likedPostIds} likedItems={likedItems} itemLikeCounts={itemLikeCounts} itemCommentCounts={itemCommentCounts} blockedIds={blockedIds} onPhotoRefreshed={handlePhotoRefreshed} />
              ))}
            </div>
          )}

          {/* Infinite-scroll sentinel + status */}
          {filtered.length > 0 && (
            <div className="flex flex-col items-center gap-2 pt-2">
              {hasMore && (
                <div ref={sentinelRef} className="flex items-center justify-center py-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-brand border-t-transparent" />
                </div>
              )}
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
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
