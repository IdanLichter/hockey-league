import { User } from "lucide-react"
import { useAuth } from "@/lib/AuthContext"

export default function Composer() {
  const { user, openAuth } = useAuth()

  const initial = user?.email?.charAt(0)?.toUpperCase() || null
  const placeholder = user
    ? "פרסום עדכונים יתאפשר בקרוב"
    : "התחברו כדי לשתף עדכון…"

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-bold text-white bg-orange-500">
          {initial ? initial : <User className="w-5 h-5" />}
        </div>

        {/* Disabled pseudo-input */}
        <div className="flex-1 min-w-0 rounded-full bg-slate-100 dark:bg-slate-700/60 px-4 py-2.5 text-sm text-slate-400 dark:text-slate-500 select-none truncate">
          {placeholder}
        </div>

        {/* Disabled post button */}
        <button
          type="button"
          disabled
          className="shrink-0 px-4 py-2 rounded-full bg-orange-500 text-white text-sm font-semibold opacity-60 cursor-not-allowed"
        >
          פרסם
        </button>
      </div>

      {/* Footer line */}
      {user ? (
        <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
          בקרוב — פרסום פתוח לחברי הליגה
        </p>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>רוצים לפרסם? התחברו לחשבון</span>
          <button
            type="button"
            onClick={openAuth}
            className="font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors"
          >
            התחברות
          </button>
        </div>
      )}
    </div>
  )
}
