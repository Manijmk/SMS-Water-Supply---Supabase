import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabase/client'

const AuthContext = createContext({})
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [linkedId, setLinkedId] = useState(null)
  const [loading, setLoading] = useState(true)

  const extractRole = (session) => {
    if (!session?.user) {
      setUser(null)
      setRole(null)
      setLinkedId(null)
      setLoading(false)
      return
    }
    const u = session.user
    setUser(u)
    const meta = u.user_metadata || {}
    setRole(meta.role || 'customer')
    setLinkedId(meta.linked_id || null)
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => extractRole(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => extractRole(session))
    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  const signUp = async (email, password, metadata = {}) => {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: metadata } })
    if (error) throw error
    return data
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setRole(null)
    setLinkedId(null)
  }

  return (
    <AuthContext.Provider value={{ user, role, linkedId, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}