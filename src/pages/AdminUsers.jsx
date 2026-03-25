import { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

export default function AdminUsers() {
  const [dbs, setDbs] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', phone2: '', phone3: '', password: '' })

  useEffect(() => { fetchDBs() }, [])

  const fetchDBs = async () => {
    try {
      const { data } = await supabase.from('delivery_boys').select('*').order('name')
      setDbs(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const create = async () => {
    if (!form.name.trim()) return toast.error('Name is required')
    if (!form.phone || form.phone.length < 10) return toast.error('Enter valid 10-digit phone')
    if (!form.password) return toast.error('Password is required')
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters')

    setCreating(true)
    try {
      const clean = form.phone.replace(/\D/g, '').slice(-10)
      const email = `${clean}@smswater.app`
      const phones = [form.phone, form.phone2, form.phone3].filter(Boolean)

      // ★ KEY FIX: Save admin session BEFORE creating new user
      const { data: { session: adminSession } } = await supabase.auth.getSession()

      // Create auth user for delivery boy
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          data: {
            role: 'delivery',
            name: form.name.trim(),
          }
        }
      })

      if (authErr) {
        // Check for specific errors
        if (authErr.message?.includes('already registered')) {
          throw new Error('This phone number is already registered')
        }
        throw authErr
      }

      // ★ KEY FIX: Restore admin session immediately
      if (adminSession) {
        await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        })
      }

      const userId = authData?.user?.id || null

      // Insert delivery boy record
      const { error: dbErr } = await supabase.from('delivery_boys').insert({
        name: form.name.trim(),
        phones,
        primary_phone: clean,
        user_id: userId,
        is_active: true,
      })
      if (dbErr) throw dbErr

      // Add user role
      if (userId) {
        await supabase.from('user_roles').upsert({
          user_id: userId,
          role: 'delivery',
          linked_id: null,
        })
      }

      toast.success(`✅ ${form.name} created!\n📱 Login: ${clean}\n🔑 Password: ${form.password}`, { duration: 6000 })
      setShowModal(false)
      setForm({ name: '', phone: '', phone2: '', phone3: '', password: '' })
      fetchDBs()
    } catch (e) {
      console.error('Create delivery boy error:', e)
      toast.error('Failed: ' + (e.message || 'Unknown error'))

      // ★ SAFETY: Try to restore admin session even on error
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          toast.error('Session lost — please log in again')
          window.location.href = '/login'
        }
      } catch (_) {}
    } finally {
      setCreating(false)
    }
  }

  const toggle = async db => {
    try {
      const { error } = await supabase
        .from('delivery_boys')
        .update({ is_active: !db.is_active })
        .eq('id', db.id)
      if (error) throw error
      toast.success(`${db.name} ${db.is_active ? 'deactivated' : 'activated'}`)
      fetchDBs()
    } catch (e) {
      toast.error('Failed: ' + e.message)
    }
  }

  const del = async db => {
    if (!confirm(`Delete ${db.name}? This cannot be undone.`)) return
    try {
      const { error } = await supabase.from('delivery_boys').delete().eq('id', db.id)
      if (error) throw error
      toast.success('Deleted')
      fetchDBs()
    } catch (e) {
      toast.error('Failed: ' + e.message)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>🔑 Users</h1>
          <p>{dbs.length} delivery boys</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Delivery Boy</button>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {dbs.length === 0 ? (
                  <tr><td colSpan={4}><div className="empty-state"><span className="empty-icon">👤</span><h3>No delivery boys</h3><p>Add your first delivery boy</p></div></td></tr>
                ) : dbs.map(d => (
                  <tr key={d.id}>
                    <td><div className="cell-main">{d.name}</div></td>
                    <td>{d.primary_phone}</td>
                    <td>
                      <span className={`badge ${d.is_active ? 'badge-delivered' : 'badge-cancelled'}`}>
                        <span className="dot" />{d.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="btn-group">
                        <button className={`btn btn-sm ${d.is_active ? 'btn-warning' : 'btn-success'}`} onClick={() => toggle(d)}>
                          {d.is_active ? '⏸' : '▶'}
                        </button>
                        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--rose-500)' }} onClick={() => del(d)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>ℹ️ How Delivery Boy Login Works</h3></div>
          <div className="card-body">
            <div className="alert alert-info" style={{ marginBottom: 0 }}>
              <div>
                <strong>1.</strong> You create the account here with phone + password<br />
                <strong>2.</strong> Delivery boy opens the app and goes to <strong>/login</strong><br />
                <strong>3.</strong> They enter their phone number and the password you set<br />
                <strong>4.</strong> They're automatically redirected to the delivery panel
              </div>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => !creating && setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Delivery Boy</h3>
              <button className="modal-close" onClick={() => !creating && setShowModal(false)} disabled={creating}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Full Name *</label>
                <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Raju Kumar" disabled={creating} />
              </div>
              <div className="form-group">
                <label>Phone (Primary) * — used for login</label>
                <input className="form-control" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="10-digit number" maxLength={10} disabled={creating} />
              </div>
              <div className="form-row">
                <div className="form-group"><label>Phone 2</label><input className="form-control" value={form.phone2} onChange={e => setForm({ ...form, phone2: e.target.value })} maxLength={10} disabled={creating} /></div>
                <div className="form-group"><label>Phone 3</label><input className="form-control" value={form.phone3} onChange={e => setForm({ ...form, phone3: e.target.value })} maxLength={10} disabled={creating} /></div>
              </div>
              <div className="form-group">
                <label>Password * — share this with the delivery boy</label>
                <input type="text" className="form-control" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters (visible for sharing)" disabled={creating} />
                <div className="form-hint">Password is shown as text so you can share it</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)} disabled={creating}>Cancel</button>
              <button className="btn btn-primary" onClick={create} disabled={creating}>
                {creating ? '⏳ Creating account...' : 'Create Account →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}