import { useAuth } from "@/lib/AuthContext"
import { Gavel, Lock } from "lucide-react"

/**
 * Gates judge-only screens. Renders children only for admins or judge-role
 * users; otherwise shows a spinner / sign-in prompt / not-authorized state.
 * (hasRole('judge') already returns true for admins.)
 */
export default function JudgeGate({ children }) {
  const { user, hasRole, loading, openAuth } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-md mx-auto">
        <div className="card p-8 flex flex-col items-center text-center gap-3 min-h-[300px] justify-center">
          <Gavel className="w-10 h-10 text-orange-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">אזור שיפוט</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">התחבר/י כדי לנהל משחקים בזמן אמת</p>
          <button onClick={openAuth} className="mt-1 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors">
            התחברות
          </button>
        </div>
      </div>
    )
  }

  if (!hasRole("judge")) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-md mx-auto">
        <div className="card p-8 flex flex-col items-center text-center gap-3 min-h-[300px] justify-center">
          <Lock className="w-10 h-10 text-slate-400 dark:text-slate-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">אזור שיפוט</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">אזור זה מיועד לשופטים בלבד. פנה/י למנהל הליגה כדי לקבל הרשאת שיפוט.</p>
        </div>
      </div>
    )
  }

  return children
}
