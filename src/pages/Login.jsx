import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function Login() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!phone || !password) return toast.error('Enter phone and password')
    setLoading(true)
    try {
      const clean = phone.replace(/\D/g, '').slice(-10)
      const data = await signIn(`${clean}@smswater.app`, password)
      const role = data?.user?.user_metadata?.role || 'customer'
      toast.success('Welcome back!')
      if (role === 'admin') navigate('/')
      else if (role === 'delivery') navigate('/delivery')
      else navigate('/customer')
    } catch (err) {
      toast.error(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo">
          <div className="logo-icon">💧</div>
          <h1>SMS Water Supply</h1>
          <p>Sign in to manage your deliveries</p>
        </div>
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Phone Number</label>
            <input
              type="tel"
              className="form-control"
              placeholder="Enter 10-digit number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={10}
              autoComplete="tel"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              className="form-control"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '⏳ Signing in...' : 'Sign In →'}
          </button>
        </form>
        <div className="login-link">
          New customer? <Link to="/register">Create account</Link>
        </div>
      </div>
    </div>
  )
}