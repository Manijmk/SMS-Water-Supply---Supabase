import { useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]

export default function Deliveries() {
  const [deliveries, setDeliveries] = useState([])
  const [trips, setTrips] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [dateFilter, setDateFilter] = useState(today)
  const [tripFilter, setTripFilter] = useState('All')
  const [form, setForm] = useState({ trip_id: '', customer_id: '', delivered: 1, empty_collected: 0, payment_received: 0, payment_mode: 'cash' })
  const [saving, setSaving] = useState(false)

  async function loadData() {
    const [{ data: d }, { data: t }, { data: c }] = await Promise.all([
      supabase.from('deliveries').select('*').eq('date', dateFilter).order('created_at'),
      supabase.from('trips').select('*').eq('date', dateFilter).order('trip_number'),
      supabase.from('customers').select('*').order('name')
    ])
    setDeliveries(d || [])
    setTrips(t || [])
    setCustomers(c || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    const channel = supabase.channel('deliveries-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, loadData)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [dateFilter])

  const enriched = deliveries.map(d => ({
    ...d,
    customer_name: customers.find(c => c.id === d.customer_id)?.name || d.customer_name || '?',
    trip_label: (() => { const t = trips.find(x => x.id === d.trip_id); return t ? `Trip #${t.trip_number} - ${t.delivery_boy}` : '?' })()
  }))

  const filtered = tripFilter === 'All' ? enriched : enriched.filter(d => d.trip_id === tripFilter)
  const totalDelivered = filtered.reduce((s, d) => s + (d.delivered || 0), 0)
  const totalCash = filtered.reduce((s, d) => s + (d.payment_received || 0), 0)
  const totalEmpties = filtered.reduce((s, d) => s + (d.empty_collected || 0), 0)

  async function save() {
    if (!form.trip_id || !form.customer_id) return toast.error('Select trip and customer')
    setSaving(true)
    const c = customers.find(x => x.id === form.customer_id)
    const { error } = await supabase.from('deliveries').insert({
      trip_id: form.trip_id,
      customer_id: form.customer_id,
      customer_name: c?.name,
      delivered: +form.delivered,
      empty_collected: +form.empty_collected,
      payment_received: +form.payment_received,
      payment_mode: form.payment_mode,
      date: dateFilter
    })
    if (error) { toast.error('Error: ' + error.message); setSaving(false); return }
    // Update customer empty balance
    if (c) {
      const newBalance = (c.empty_balance || 0) + (+form.empty_collected) - (+form.delivered)
      await supabase.from('customers').update({ empty_balance: newBalance }).eq('id', c.id)
    }
    toast.success('Delivery recorded!')
    setModal(false)
    setForm({ trip_id: '', customer_id: '', delivered: 1, empty_collected: 0, payment_received: 0, payment_mode: 'cash' })
    setSaving(false)
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  if (loading) return <div className="loading"><div className="spinner" />Loading deliveries...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Deliveries 📦</h1>
          <p className="page-subtitle">{filtered.length} deliveries • {totalDelivered} cans <span style={{ color: 'var(--green)', fontWeight: 700 }}>● live</span></p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ Record Delivery</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '2px solid var(--gray-200)', borderRadius: 8, padding: '8px 14px' }}>
          <span>📅</span>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            style={{ border: 'none', fontSize: 14, fontFamily: 'Nunito', outline: 'none' }} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={tripFilter} onChange={e => setTripFilter(e.target.value)}>
          <option value="All">All Trips</option>
          {trips.map(t => <option key={t.id} value={t.id}>Trip #{t.trip_number} — {t.delivery_boy}</option>)}
        </select>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Cans Delivered', value: totalDelivered, color: 'var(--green)' },
          { label: 'Cash Collected', value: `₹${totalCash}`, color: 'var(--orange)' },
          { label: 'Empties Collected', value: totalEmpties, color: 'var(--sky)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ borderTop: `4px solid ${s.color}` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div className="icon">📦</div><p>No deliveries recorded</p></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Trip</th><th>Delivered</th><th>Empties</th><th>Cash</th><th>Mode</th></tr></thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 700 }}>{d.customer_name}</td>
                    <td style={{ fontSize: 13, color: 'var(--gray-500)' }}>{d.trip_label}</td>
                    <td><span className="badge badge-green">{d.delivered} cans</span></td>
                    <td><span className="badge badge-blue">{d.empty_collected}</span></td>
                    <td style={{ fontWeight: 700, color: 'var(--green)' }}>₹{d.payment_received}</td>
                    <td><span className="badge badge-gray">{d.payment_mode}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <h2 className="modal-title">Record Delivery 📦</h2>
            <div className="form-group">
              <label className="form-label">Trip *</label>
              <select className="form-select" value={form.trip_id} onChange={e => f('trip_id', e.target.value)}>
                <option value="">Select trip...</option>
                {trips.map(t => <option key={t.id} value={t.id}>Trip #{t.trip_number} — {t.delivery_boy} ({t.route})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Customer *</label>
              <select className="form-select" value={form.customer_id} onChange={e => f('customer_id', e.target.value)}>
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.area}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <div className="form-group">
                <label className="form-label">Cans Delivered *</label>
                <input className="form-input" type="number" min={0} value={form.delivered} onChange={e => f('delivered', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Empty Cans Collected</label>
                <input className="form-input" type="number" min={0} value={form.empty_collected} onChange={e => f('empty_collected', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Cash Received (₹)</label>
                <input className="form-input" type="number" min={0} value={form.payment_received} onChange={e => f('payment_received', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Mode</label>
                <select className="form-select" value={form.payment_mode} onChange={e => f('payment_mode', e.target.value)}>
                  <option value="cash">💵 Cash</option>
                  <option value="upi">📱 UPI</option>
                  <option value="credit">📒 Credit</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-success" onClick={save} disabled={saving}>{saving ? 'Saving...' : '✅ Record Delivery'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
