import { useState } from "react"
import { User, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/AuthContext"
import { createPost } from "@/lib/api"

const MAX = 2000

function translatePostError(msg = "") {
  const m = msg.toLowerCase()
  if (m.includes("post_rate_limit")) return "אפשר לפרסם פוסט אחד ביום — נסו שוב מחר 🙂"
  if (m.includes("row-level security") || m.includes("policy") || m.includes("permission")) return "אין לך הרשאה לפרסם"
  if (m.includes("not authenticated")) return "יש להתחבר כדי לפרסם"
  return "הפרסום נכשל. נסו שוב"
}

export default function Composer({ onPosted }) {
  const { user, canPost, openAuth } = useAuth()
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const initial = user?.email?.charAt(0)?.toUpperCase() || null

  // ---- Logged out: sign-in prompt ----
  if (!user) {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-bold text-white bg-orange-500">
            <User className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0 rounded-full bg-slate-100 dark:bg-slate-700/60 px-4 py-2.5 text-sm text-slate-400 dark:text-slate-500 select-none truncate">
            התחברו כדי לשתף עדכון…
          </div>
          <button type="button" disabled className="shrink-0 px-4 py-2 rounded-full bg-orange-500 text-white text-sm font-semibold opacity-60 cursor-not-allowed">
            פרסם
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>רוצים לפרסם? התחברו לחשבון</span>
          <button type="button" onClick={openAuth} className="font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors">
            התחברות
          </button>
        </div>
      </div>
    )
  }

  // ---- Signed in but not league staff: hide the composer entirely ----
  if (!canPost) return null

  // ---- Logged in: real composer ----
  const submit = async () => {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true); setError(null)
    try {
      const newPost = await createPost({ body: text })
      setBody("")
      onPosted && onPosted(newPost)
    } catch (err) {
      setError(translatePostError(err?.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-4">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-bold text-white bg-orange-500">
          {initial || <User className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX))}
            placeholder="מה קורה בליגה?"
            rows={3}
            className="w-full resize-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-all"
          />
          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 dark:text-slate-500">{body.length}/{MAX}</span>
            <button
              onClick={submit}
              disabled={busy || !body.trim()}
              className="px-5 py-2 rounded-full bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              פרסם
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
