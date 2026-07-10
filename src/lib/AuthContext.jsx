import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [roles, setRoles] = useState([]) // rows from user_roles: { role, team_id }
  // Editable profile + the linked player's team color, for the navbar avatar.
  // Shape: { display_name, avatar_url, player_id, player, teamColor } | null
  const [profile, setProfile] = useState(null)
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
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Resolve admin status + granted roles + profile for a signed-in user.
  const loadAccount = async (u) => {
    await Promise.all([checkAdmin(u.email), loadRoles(u.id), loadProfile(u.id)])
    setLoading(false)
  }

  // Load the editable profile and, if the account is linked to a player,
  // that player's team color (for the navbar avatar's "paired" state).
  // Players/teams are fetched separately, matching the rest of the app
  // (see the embed-ambiguity gotcha — no nested profiles→players embed).
  const loadProfile = async (userId) => {
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, player_id')
        .eq('id', userId)
        .maybeSingle()
      if (!prof) { setProfile(null); return }

      let player = null
      let teamColor = null
      if (prof.player_id) {
        const { data: pl } = await supabase
          .from('players')
          .select('first_name, last_name, team_id')
          .eq('id', prof.player_id)
          .maybeSingle()
        player = pl || null
        if (pl?.team_id) {
          const { data: team } = await supabase
            .from('teams')
            .select('primary_color')
            .eq('id', pl.team_id)
            .maybeSingle()
          teamColor = team?.primary_color || null
        }
      }
      setProfile({ ...prof, player, teamColor })
    } catch {
      setProfile(null)
    }
  }

  // Re-fetch the profile (e.g. after the user edits their avatar on /me).
  const refreshProfile = async () => {
    const { data: { user: u } } = await supabase.auth.getUser()
    if (u) await loadProfile(u.id)
    else setProfile(null)
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

  // Team ids this user coaches (role='coach' rows carry a team_id). NOTE: an
  // admin passes hasRole('coach') via the bypass above but has NO coach teams,
  // so this stays empty for admins — coach-scoped code must branch on isAdmin first.
  const coachTeamIds = roles.filter(r => r.role === 'coach' && r.team_id).map(r => r.team_id)

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
    setProfile(null)
  }

  const openAuth = () => setAuthOpen(true)
  const closeAuth = () => setAuthOpen(false)

  return (
    <AuthContext.Provider value={{
      user, isAdmin, roles, hasRole, coachTeamIds, profile, refreshProfile, loading, authOpen,
      signInWithGoogle, signUpWithEmail, signInWithEmail, signOut,
      openAuth, closeAuth,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
