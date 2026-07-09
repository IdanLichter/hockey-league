import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Heart, MessageCircle, Send, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/AuthContext"
import { likeItem, unlikeItem, getItemComments, createItemComment } from "@/lib/reactions"

/**
 * Reusable like + comment bar for SYNTHETIC feed cards (game results,
 * milestones, champion, top-scorer). Same look/behaviour as the human
 * PostCard actions, but backed by feed_item_likes / feed_item_comments,
 * keyed by the feed item's stable `itemKey` (post.id from lib/feed.js).
 */

function CommentAvatar({ url, name, className = "w-8 h-8" }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?"
  return url
    ? <img src={url} alt="" className={`${className} rounded-full object-cover shrink-0`} />
    : <div className={`${className} rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold shrink-0`}>{initial}</div>
}

export default function ReactionBar({ itemKey, liked: likedInit = false, likeCount: likeInit = 0, commentCount: commentInit = 0 }) {
  const { user, openAuth } = useAuth()

  const [liked, setLiked] = useState(likedInit)
  const [likeCount, setLikeCount] = useState(likeInit)
  const [commentCount, setCommentCount] = useState(commentInit)
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
      next ? await likeItem(itemKey) : await unlikeItem(itemKey)
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
        setComments(await getItemComments(itemKey)); setLoadedComments(true)
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
      const c = await createItemComment(itemKey, text)
      setComments(prev => [...prev, c])
      setCommentCount(n => n + 1)
      setNewComment("")
    } catch { /* ignore */ }
    finally { setPosting(false) }
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
      {/* Actions */}
      <div className="flex items-center gap-5 text-xs">
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
                      <CommentAvatar url={c.author?.avatar_url} name={c.author?.display_name} className="w-8 h-8" />
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
    </div>
  )
}
