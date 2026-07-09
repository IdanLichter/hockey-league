import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [roles, setRoles] = useState([]) // rows from user_roles: { role, team_id }
  const [loading, setLoading] = useState(true)
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadAccount(session.user)
      else setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        setAuthOpen(false) // close the auth modal once signed in
        loadAccount(session.user)
      } else {
        setIsAdmin(false)
        setRoles([])
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Resolve admin status + granted roles for a signed-in user.
  const loadAccount = async (u) => {
    await Promise.all([checkAdmin(u.email), loadRoles(u.id)])
    setLoading(false)
  }

  const checkAdmin = async (email) => {
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('email')
        .eq('email', email)
        .maybeSingle()
      setIsAdmin(!!data && !error)
    } catch {
      setIsAdmin(false)
    }
  }

  const loadRoles = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, team_id')
        .eq('user_id', userId)
      setRoles(error ? [] : (data || []))
    } catch {
      setRoles([])
    }
  }

  // Does the signed-in user hold a given role? Admins implicitly pass every gate.
  const hasRole = (role) => isAdmin || roles.some(r => r.role === role)

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/admin'
      }
    })
    if (error) throw error
  }

  const signUpWithEmail = async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: displayName ? { full_name: displayName } : undefined },
    })
    if (error) throw error
    return data // data.session is null when email confirmation is required
  }

  const signInWithEmail = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    setRoles([])
  }

  const openAuth = () => setAuthOpen(true)
  const closeAuth = () => setAuthOpen(false)

  return (
    <AuthContext.Provider value={{
      user, isAdmin, roles, hasRole, loading, authOpen,
      signInWithGoogle, signUpWithEmail, signInWithEmail, signOut,
      openAuth, closeAuth,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
