import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase/client'

const AuthContext = createContext()

// Get role from user metadata — no database query needed, instant!
function getRoleFromUser(user) {
  return user?.user_metadata?.role || user?.app_metadata?.role || null
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [linkedId, setLinkedId] = useState(null)
  const [linkedData, setLinkedData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session — no DB calls, just read from token
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        const r = getRoleFromUser(session.user)
        setRole(r || 'admin')
        setLinkedId(session.user.user_metadata?.linked_id || null)
      }
      setLoading(false)
    }).catch(() => setLoading(false))

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setUser(null)
        setRole(null)
        setLinkedId(null)
        setLinkedData(null)
        setLoading(false)
        return
      }
      if (session?.user) {
        setUser(session.user)
        const r = getRoleFromUser(session.user)
        setRole(r || 'admin')
        setLinkedId(session.user.user_metadata?.linked_id || null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Load linked data (customer/delivery record) when linkedId is set
  useEffect(() => {
    if (!linkedId || !role) return
    if (role === 'customer') {
      supabase.from('customers').select('*').eq('id', linkedId).maybeSingle()
        .then(({ data }) => { if (data) setLinkedData(data) })
    } else if (role === 'delivery') {
      supabase.from('delivery_boys').select('*').eq('id', linkedId).maybeSingle()
        .then(({ data }) => { if (data) setLinkedData(data) })
    }
  }, [linkedId, role])

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setRole(null)
    setLinkedId(null)
    setLinkedData(null)
  }

  return (
    <AuthContext.Provider value={{ user, role, linkedId, linkedData, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
