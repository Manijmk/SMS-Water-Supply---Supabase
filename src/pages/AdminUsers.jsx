import { useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

const EMPTY = { name: '', primary_phone: '', phones: [], password: '', is_active: true }

export default function AdminUsers() {
  const [deliveryBoys, setDeliveryBoys] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [extraPhone, setExtraPhone] = useState(['', '']) // up to 2 extra phones
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('boys') // boys | customers

  async function load() {
    const { data } = await supabase.from('delivery_boys').select('*').order('name')
    setDeliveryBoys(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function createDeliveryBoy(e) {
    e.preventDefault()
    if (!form.name || !form.primary_phone || !form.password)
      return toast.error('Name, phone and password are required')
    if (form.primary_phone.length !== 10)
      return toast.error('Enter valid 10-digit phone number')
    if (form.password.length < 6)
      return toast.error('Password must be at least 6 characters')

    setSaving(true)
    try {
      const allPhones = [form.primary_phone, ...extraPhone.filter(p => p.length === 10)]
      const email = `${form.primary_phone}@smswater.app`

      // Create Supabase auth user
      // Create auth user with role stored in metadata
      const { data: authData, error: authError } = await supabase.auth.admin
        ? await supabase.auth.signUp({ email, password: form.password })
        : await supabase.auth.signUp({ email, password: form.password })

      if (authError) { toast.error('Auth error: ' + authError.message); setSaving(false); return }

      const userId = authData.user?.id
      if (!userId) { toast.error('Could not create user'); setSaving(false); return }

      // Insert delivery boy record
      const { data: boyData, error: boyError } = await supabase.from('delivery_boys').insert({
        name: form.name,
        primary_phone: form.primary_phone,
        phones: allPhones,
        user_id: userId,
        is_active: true
      }).select().single()

      if (boyError) { toast.error('Error: ' + boyError.message); setSaving(false); return }

      // Create user role
      await supabase.from('user_roles').insert({
        user_id: userId,
        role: 'delivery',
        linked_id: boyData.id
      })

      toast.success(`✅ Account created for ${form.name}!`)
      setModal(false)
      setForm(EMPTY)
      setExtraPhone(['', ''])
      load()
    } catch (e) {
      toast.error('Something went wrong: ' + e.message)
    }
    setSaving(false)
  }

  async function toggleActive(boy) {
    await supabase.from('delivery_boys').update({ is_active: !boy.is_active }).eq('id', boy.id)
    toast.success(boy.is_active ? 'Account deactivated' : 'Account activated')
    load()
  }

  if (loading) return <div className="loading"><div className="spinner" />Loading...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">User Management 👤</h1>
          <p className="page-subtitle">Manage delivery boy accounts</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ Add Delivery Boy</button>
      </div>

      {/* Login info box */}
      <div style={{ background: 'var(--sky-pale)', border: '1px solid var(--sky-light)', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
        <div style={{ fontWeight: 800, color: 'var(--ocean)', marginBottom: 8 }}>ℹ️ How Logins Work</div>
        <div style={{ fontSize: 13, color: 'var(--gray-700)', display: 'grid', gap: 4 }}>
          <div>🔐 <strong>Admin:</strong> Uses email + password (set in Supabase)</div>
          <div>🚚 <strong>Delivery Boys:</strong> Admin creates account here with phone + password</div>
          <div>👥 <strong>Customers:</strong> Self-register at <strong>/register</strong> using their phone number</div>
          <div>🌐 <strong>All roles use the same login page</strong> — role is auto-detected</div>
        </div>
      </div>

      {/* Delivery Boys List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-100)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 800 }}>🚚 Delivery Boys ({deliveryBoys.length})</h2>
        </div>
        {deliveryBoys.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🚚</div>
            <p>No delivery boys added yet</p>
            <span>Click "Add Delivery Boy" to create an account</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Primary Phone</th><th>Other Phones</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {deliveryBoys.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 700 }}>{b.name}</td>
                    <td>📞 {b.primary_phone}</td>
                    <td style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                      {b.phones?.filter(p => p !== b.primary_phone).join(', ') || '—'}
                    </td>
                    <td>
                      <span className={`badge ${b.is_active ? 'badge-green' : 'badge-red'}`}>
                        {b.is_active ? '✅ Active' : '❌ Inactive'}
                      </span>
                    </td>
                    <td>
                      <button className={`btn btn-sm ${b.is_active ? 'btn-danger' : 'btn-success'}`}
                        onClick={() => toggleActive(b)}>
                        {b.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Delivery Boy Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <h2 className="modal-title">Add Delivery Boy 🚚</h2>
            <form onSubmit={createDeliveryBoy}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Delivery boy name" />
              </div>
              <div className="form-group">
                <label className="form-label">Primary Phone * (used for login)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-500)', fontSize: 14 }}>+91</span>
                  <input className="form-input" type="tel" maxLength={10} placeholder="9876543210"
                    value={form.primary_phone} onChange={e => setForm(p => ({ ...p, primary_phone: e.target.value.replace(/\D/g, '') }))}
                    style={{ paddingLeft: 44 }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Alternate Phone 1 (optional)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-500)', fontSize: 14 }}>+91</span>
                  <input className="form-input" type="tel" maxLength={10} placeholder="9876543210"
                    value={extraPhone[0]} onChange={e => setExtraPhone(p => [e.target.value.replace(/\D/g, ''), p[1]])}
                    style={{ paddingLeft: 44 }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Alternate Phone 2 (optional)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-500)', fontSize: 14 }}>+91</span>
                  <input className="form-input" type="tel" maxLength={10} placeholder="9876543210"
                    value={extraPhone[1]} onChange={e => setExtraPhone(p => [p[0], e.target.value.replace(/\D/g, '')])}
                    style={{ paddingLeft: 44 }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Password * (min 6 characters)</label>
                <input className="form-input" type="password" placeholder="••••••••"
                  value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
              </div>
              <div style={{ background: 'var(--sky-pale)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--ocean)' }}>
                ℹ️ The delivery boy will login at <strong>/login</strong> using their primary phone number and this password
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Creating...' : '✅ Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
