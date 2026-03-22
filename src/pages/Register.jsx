import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

export default function Register() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [step, setStep] = useState(1)
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function checkPhone(e) {
    e.preventDefault()
    const cleanPhone = phone.trim().replace(/\s/g, '')
    if (cleanPhone.length !== 10) return toast.error('Enter valid 10-digit phone number')
    setLoading(true)
    try {
      // Try primary_phone first
      let { data } = await supabase
        .from('customers')
        .select('*')
        .eq('primary_phone', cleanPhone)
        .maybeSingle()

      // If not found, try phones array
      if (!data) {
        const { data: data2 } = await supabase
          .from('customers')
          .select('*')
          .contains('phones', [cleanPhone])
          .maybeSingle()
        data = data2
      }

      if (!data) {
        toast.error('❌ Phone not registered. Contact SMS Water Supply.')
        setLoading(false)
        return
      }
      if (data.user_id) {
        toast.error('Account already exists. Please login instead.')
        setLoading(false)
        return
      }
      setCustomer(data)
      setStep(2)
      toast.success(`✅ Found! Welcome ${data.name}`)
    } catch (e) {
      toast.error('Something went wrong.')
    }
    setLoading(false)
  }

  async function createAccount(e) {
    e.preventDefault()
    if (password.length < 6) return toast.error('Password must be at least 6 characters')
    if (password !== confirm) return toast.error('Passwords do not match')
    setLoading(true)
    try {
      const email = `${phone}@smswater.app`

      // Store role + linked_id IN the user_metadata so no DB query needed at login
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: 'customer',
            linked_id: customer.id,
            name: customer.name,
            phone: phone
          }
        }
      })

      if (authError) {
        toast.error(authError.message.includes('already registered')
          ? 'Account exists. Please login.'
          : authError.message)
        setLoading(false)
        return
      }

      const userId = authData.user?.id
      if (!userId) { toast.error('Could not create account.'); setLoading(false); return }

      // Link user to customer record
      await supabase.from('customers').update({ user_id: userId }).eq('id', customer.id)

      // Also save to user_roles as backup
      await supabase.from('user_roles').insert({
        user_id: userId, role: 'customer', linked_id: customer.id
      }).then(() => {})  // ignore errors

      // Sign in immediately
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        toast.success('Account created! Please login.')
        navigate('/login', { replace: true })
        return
      }

      toast.success('🎉 Account created successfully!')
      navigate('/customer', { replace: true })
    } catch (e) {
      toast.error('Something went wrong.')
    }
    setLoading(false)
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
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4 }}>Customer Registration</p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {['Verify Phone', 'Set Password'].map((s, i) => (
              <div key={s} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: step > i + 1 ? 'var(--green)' : step === i + 1 ? 'var(--sky)' : 'var(--gray-200)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, margin: '0 auto 6px' }}>
                  {step > i + 1 ? '✓' : i + 1}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: step === i + 1 ? 'var(--sky)' : 'var(--gray-400)' }}>{s}</div>
              </div>
            ))}
          </div>

          {step === 1 && (
            <form onSubmit={checkPhone}>
              <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Verify Your Phone</h2>
              <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 20 }}>Enter the phone number you gave us when you became a customer</p>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-500)', fontSize: 14 }}>+91</span>
                  <input className="form-input" type="tel" maxLength={10} placeholder="9876543210"
                    value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                    style={{ paddingLeft: 44 }} autoFocus />
                </div>
              </div>
              <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
                {loading ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />Checking...</> : 'Verify Phone →'}
              </button>
            </form>
          )}

          {step === 2 && customer && (
            <form onSubmit={createAccount}>
              <div style={{ background: 'var(--green-light)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, border: '1px solid #bbf7d0' }}>
                <div style={{ fontWeight: 800, color: '#166534' }}>👤 {customer.name}</div>
                <div style={{ fontSize: 13, color: '#166534', marginTop: 2 }}>📍 {customer.area} • {customer.type}</div>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Set Your Password</h2>
              <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 20 }}>Choose a password for your account</p>
              <div className="form-group">
                <label className="form-label">Password (min 6 characters)</label>
                <input className="form-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input className="form-input" type="password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setStep(1)} style={{ flex: 1 }}>← Back</button>
                <button type="submit" className="btn btn-success" disabled={loading} style={{ flex: 2 }}>
                  {loading ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />Creating...</> : '🎉 Create Account'}
                </button>
              </div>
            </form>
          )}

          <div style={{ textAlign: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--gray-100)' }}>
            <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>
              Already have an account?{' '}
              <Link to="/login" style={{ color: 'var(--sky)', fontWeight: 700 }}>Sign in →</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
