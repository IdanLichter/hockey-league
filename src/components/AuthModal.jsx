import { useState } from "react"
import { X, Mail, Lock, User, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/AuthContext"

function translateAuthError(msg = "") {
  const m = msg.toLowerCase()
  if (m.includes("invalid login")) return "אימייל או סיסמה שגויים"
  if (m.includes("email") && m.includes("invalid")) return "כתובת אימייל לא תקינה"
  if (m.includes("email not confirmed")) return "יש לאמת את כתובת המייל לפני ההתחברות"
  if (m.includes("already registered") || m.includes("already been registered")) return "כתובת המייל כבר רשומה"
  if (m.includes("password")) return "הסיסמה חייבת להכיל לפחות 6 תווים"
  if (m.includes("rate limit") || m.includes("too many")) return "יותר מדי ניסיונות. נסו שוב מאוחר יותר"
  return msg || "אירעה שגיאה. נסו שוב"
}

function Field({ icon: Icon, value, onChange, ...props }) {
  return (
    <div className="relative">
      <Icon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-all"
      />
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.6 2.4 30.1 0 24 0 14.6 0 6.4 5.4 2.6 13.2l7.9 6.2C12.3 13.3 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7C43.8 37.5 46.5 31.5 46.5 24.5z" />
      <path fill="#FBBC05" d="M10.5 28.4c-.5-1.5-.8-3.1-.8-4.9s.3-3.4.8-4.9l-7.9-6.2C1 15.6 0 19.6 0 23.5s1 7.9 2.6 11.1l7.9-6.2z" />
      <path fill="#34A853" d="M24 47c6.1 0 11.3-2 15-5.5l-7.3-5.7c-2 1.4-4.7 2.3-7.7 2.3-6.3 0-11.7-3.8-13.5-9.4l-7.9 6.2C6.4 42.6 14.6 47 24 47z" />
    </svg>
  )
}

export default function AuthModal() {
  const { authOpen, closeAuth, signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth()
  const [mode, setMode] = useState("signin") // 'signin' | 'signup'
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  if (!authOpen) return null

  const close = () => {
    closeAuth()
    setError(null); setSent(false); setPassword("")
  }
  const switchMode = (m) => { setMode(m); setError(null); setSent(false) }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      if (mode === "signup") {
        const data = await signUpWithEmail(email.trim(), password, name.trim())
        if (!data?.session) { setSent(true) } // confirmation email required
      } else {
        await signInWithEmail(email.trim(), password)
        // onAuthStateChange closes the modal on success
      }
    } catch (err) {
      setError(translateAuthError(err?.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      <div className="relative card w-full max-w-sm p-6 shadow-2xl">
        <button
          onClick={close}
          className="absolute top-4 left-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          aria-label="סגור"
        >
          <X className="w-5 h-5" />
        </button>

        {sent ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">בדקו את תיבת המייל</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              שלחנו קישור אימות ל־<span className="font-semibold text-slate-700 dark:text-slate-300">{email}</span>. אשרו אותו כדי להשלים את ההרשמה.
            </p>
            <button onClick={close} className="mt-5 w-full py-2.5 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors">
              הבנתי
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white text-center">
              {mode === "signin" ? "התחברות" : "הרשמה"}
            </h2>
            <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-1">
              {mode === "signin" ? "התחברו לחשבון שלכם" : "הצטרפו לקהילת הליגה"}
            </p>

            <form onSubmit={submit} className="mt-5 space-y-3">
              {mode === "signup" && (
                <Field icon={User} type="text" placeholder="שם תצוגה" value={name} onChange={setName} autoComplete="name" />
              )}
              <Field icon={Mail} type="email" placeholder="אימייל" value={email} onChange={setEmail} required autoComplete="email" />
              <Field icon={Lock} type="password" placeholder="סיסמה (לפחות 6 תווים)" value={password} onChange={setPassword} required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} />

              {error && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-xl bg-orange-500 text-white font-bold hover:bg-orange-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === "signin" ? "התחברות" : "יצירת חשבון"}
              </button>
            </form>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              <span className="text-[11px] text-slate-400">או</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            </div>

            <button
              onClick={() => signInWithGoogle()}
              className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors flex items-center justify-center gap-2"
            >
              <GoogleIcon /> המשך עם Google
            </button>

            <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-5">
              {mode === "signin" ? (
                <>אין לכם חשבון? <button type="button" onClick={() => switchMode("signup")} className="font-bold text-orange-600 dark:text-orange-400 hover:underline">הרשמה</button></>
              ) : (
                <>כבר יש לכם חשבון? <button type="button" onClick={() => switchMode("signin")} className="font-bold text-orange-600 dark:text-orange-400 hover:underline">התחברות</button></>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
