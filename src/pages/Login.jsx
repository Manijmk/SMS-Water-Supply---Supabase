import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

export default function Login() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    const cleanPhone = phone.trim().replace(/\s/g, '')
    if (!cleanPhone || !password) return toast.error('Enter phone and password')
    if (cleanPhone.length !== 10) return toast.error('Enter valid 10-digit phone number')

    setLoading(true)
    try {
      const email = `${cleanPhone}@smswater.app`
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        toast.error('Wrong phone number or password')
        setLoading(false)
        return
      }

      // Read role directly from user metadata — instant, no DB query!
      const userRole = data.user?.user_metadata?.role
        || data.user?.app_metadata?.role
        || 'admin'

      toast.success('Welcome back! 👋')

      if (userRole === 'delivery') navigate('/delivery', { replace: true })
      else if (userRole === 'customer') navigate('/customer', { replace: true })
      else navigate('/', { replace: true })

    } catch (e) {
      console.error('Login error:', e)
      toast.error('Something went wrong. Try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 80, height: 80, background: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 40 }}>💧</div>
          <h1 style={{ color: 'white', fontSize: 28, fontFamily: "'Baloo 2', cursive", margin: 0 }}>SMS Water Supply</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4 }}>Management System</p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Sign In</h2>
          <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 20 }}>Works for Admin, Delivery Boys & Customers</p>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-500)', fontSize: 14 }}>+91</span>
                <input
                  className="form-input"
                  type="tel"
                  maxLength={10}
                  placeholder="9876543210"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                  style={{ paddingLeft: 44 }}
                  autoComplete="tel"
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <button
              className="btn btn-primary btn-full btn-lg"
              type="submit"
              disabled={loading}
              style={{ marginTop: 8 }}
            >
              {loading
                ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />Signing in...</>
                : '🔐 Sign In'
              }
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--gray-100)' }}>
            <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>
              New customer?{' '}
              <Link to="/register" style={{ color: 'var(--sky)', fontWeight: 700 }}>Register here →</Link>
            </p>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
            Your role is automatically detected based on your phone number
          </p>
        </div>
      </div>
    </div>
  )
}
