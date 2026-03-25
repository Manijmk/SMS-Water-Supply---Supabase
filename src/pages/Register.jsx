import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

export default function Register() {
  const [step, setStep] = useState(1)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const verifyPhone = async () => {
    if (!phone || phone.length !== 10) return toast.error('Enter valid 10-digit phone')
    setLoading(true)
    try {
      const clean = phone.replace(/\D/g, '').slice(-10)
      let { data } = await supabase.from('customers').select('*').eq('primary_phone', clean).maybeSingle()
      if (!data) {
        const r = await supabase.from('customers').select('*').contains('phones', [clean]).maybeSingle()
        data = r.data
      }
      if (!data) return toast.error('Phone not found. Contact admin to register.')
      if (data.user_id) return toast.error('Already registered. Please login.')
      setCustomer(data)
      setStep(2)
      toast.success(`Welcome, ${data.name}!`)
    } catch (err) {
      toast.error('Verification failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (password !== confirm) return toast.error('Passwords do not match')
    if (password.length < 6) return toast.error('Min 6 characters')
    setLoading(true)
    try {
      const clean = phone.replace(/\D/g, '').slice(-10)
      const email = `${clean}@smswater.app`
      const { data: signUpData, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { role: 'customer', linked_id: customer.id, name: customer.name } }
      })
      if (error) throw error
      const userId = signUpData.user.id
      await supabase.from('customers').update({ user_id: userId, primary_phone: clean }).eq('id', customer.id)
      await supabase.from('user_roles').upsert({ user_id: userId, role: 'customer', linked_id: customer.id })
      await supabase.auth.signInWithPassword({ email, password })
      toast.success('Account created!')
      navigate('/customer')
    } catch (err) {
      toast.error(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo">
          <div className="logo-icon">💧</div>
          <h1>Create Account</h1>
          <p>Register as a customer</p>
        </div>

        {step === 1 && (
          <>
            <div className="form-group">
              <label>Phone Number</label>
              <input type="tel" className="form-control" placeholder="Your 10-digit phone" value={phone} onChange={e => setPhone(e.target.value)} maxLength={10} />
            </div>
            <button className="btn btn-primary" onClick={verifyPhone} disabled={loading} style={{ width: '100%' }}>
              {loading ? '⏳ Verifying...' : 'Verify Phone →'}
            </button>
          </>
        )}

        {step === 2 && customer && (
          <form onSubmit={handleRegister}>
            <div className="alert alert-success">
              ✅ Found: <strong>{customer.name}</strong> — {customer.area}
            </div>
            <div className="form-group">
              <label>Create Password</label>
              <input type="password" className="form-control" placeholder="Min 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Confirm Password</label>
              <input type="password" className="form-control" placeholder="Re-enter password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '⏳ Creating...' : 'Create Account →'}
            </button>
          </form>
        )}

        <div className="login-link">
          Already registered? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  )
}