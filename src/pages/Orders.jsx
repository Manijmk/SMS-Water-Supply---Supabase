import { useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

const AREAS = ['Tondiarpet', 'New Washermanpet', 'Kaladipet', 'Tollgate', 'Thiruvotriyur']
const today = new Date().toISOString().split('T')[0]

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [dateFilter, setDateFilter] = useState(today)
  const [areaFilter, setAreaFilter] = useState('All')
  const [form, setForm] = useState({ customer_id: '', quantity: 1, delivery_date: today, notes: '' })
  const [saving, setSaving] = useState(false)

  async function loadOrders() {
    const { data } = await supabase.from('orders')
      .select('*, customers(name, area, price_per_can)')
      .eq('delivery_date', dateFilter)
      .order('created_at')
    setOrders(data || [])
    setLoading(false)
  }

  async function loadCustomers() {
    const { data } = await supabase.from('customers').select('*').order('name')
    setCustomers(data || [])
  }

  useEffect(() => {
    loadOrders()
    loadCustomers()
    const channel = supabase.channel('orders-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadOrders)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [dateFilter])

  const enriched = orders.map(o => ({
    ...o,
    customer_name: o.customers?.name || o.customer_name || '?',
    area: o.customers?.area || o.area || '?',
    price_per_can: o.customers?.price_per_can || 0
  }))

  const filtered = areaFilter === 'All' ? enriched : enriched.filter(o => o.area === areaFilter)
  const totalCans = filtered.reduce((s, o) => s + (o.quantity || 0), 0)

  async function save() {
    if (!form.customer_id || !form.quantity) return toast.error('Select customer and quantity')
    setSaving(true)
    const c = customers.find(x => x.id === form.customer_id)
    const { error } = await supabase.from('orders').insert({
      customer_id: form.customer_id,
      customer_name: c?.name,
      area: c?.area,
      quantity: +form.quantity,
      delivery_date: form.delivery_date,
      notes: form.notes,
      status: 'pending'
    })
    if (error) toast.error('Error: ' + error.message)
    else { toast.success('Order added!'); setModal(false); setForm({ customer_id: '', quantity: 1, delivery_date: today, notes: '' }) }
    setSaving(false)
  }

  async function del(id) {
    if (!confirm('Delete this order?')) return
    await supabase.from('orders').delete().eq('id', id)
    toast.success('Deleted')
  }

  async function updateStatus(id, status) {
    await supabase.from('orders').update({ status }).eq('id', id)
    const labels = { delivered: '✅ Delivered', cancelled: '❌ Cancelled', out_for_delivery: '🚚 Out for delivery', pending: '⏳ Pending' }
    toast.success(labels[status] || 'Updated')
  }

  if (loading) return <div className="loading"><div className="spinner" />Loading orders...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Orders 📋</h1>
          <p className="page-subtitle">{filtered.length} orders • {totalCans} cans <span style={{ color: 'var(--green)', fontWeight: 700 }}>● live</span></p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ Add Order</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '2px solid var(--gray-200)', borderRadius: 8, padding: '8px 14px' }}>
          <span>📅</span>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            style={{ border: 'none', fontSize: 14, fontFamily: 'Nunito', outline: 'none' }} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={areaFilter} onChange={e => setAreaFilter(e.target.value)}>
          <option>All</option>
          {AREAS.map(a => <option key={a}>{a}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {AREAS.map(area => {
          const count = enriched.filter(o => o.area === area).reduce((s, o) => s + o.quantity, 0)
          if (!count) return null
          return (
            <div key={area} onClick={() => setAreaFilter(area === areaFilter ? 'All' : area)}
              style={{ padding: '6px 14px', borderRadius: 99, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: areaFilter === area ? 'var(--sky)' : 'white', color: areaFilter === area ? 'white' : 'var(--sky)', border: '2px solid var(--sky)', transition: 'all 0.15s' }}>
              {area} ({count})
            </div>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div className="icon">📋</div><p>No orders for this date</p></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Area</th><th>Qty</th><th>Amount</th><th>Notes</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 700 }}>{o.customer_name}</td>
                    <td><span className="badge badge-blue">{o.area}</span></td>
                    <td style={{ fontWeight: 800, color: 'var(--sky-dark)' }}>{o.quantity}</td>
                    <td>₹{o.quantity * o.price_per_can}</td>
                    <td style={{ color: 'var(--gray-500)', fontSize: 13 }}>{o.notes || '—'}</td>
                    <td>
                      <select value={o.status || 'pending'} onChange={e => updateStatus(o.id, e.target.value)}
                        style={{ border: '2px solid var(--gray-200)', borderRadius: 6, padding: '4px 8px', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: o.status === 'delivered' ? '#166534' : o.status === 'out_for_delivery' ? '#1e40af' : o.status === 'cancelled' ? '#991b1b' : '#9a3412' }}>
                        <option value="pending">⏳ Pending</option>
                        <option value="out_for_delivery">🚚 Out</option>
                        <option value="delivered">✅ Delivered</option>
                        <option value="cancelled">❌ Cancelled</option>
                      </select>
                    </td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => del(o.id)}>🗑️</button></td>
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
            <h2 className="modal-title">Add Order 📋</h2>
            <div className="form-group">
              <label className="form-label">Customer *</label>
              <select className="form-select" value={form.customer_id} onChange={e => setForm(p => ({ ...p, customer_id: e.target.value }))}>
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.area} ({c.type})</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <div className="form-group">
                <label className="form-label">Quantity *</label>
                <input className="form-input" type="number" min={1} value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Delivery Date</label>
                <input className="form-input" type="date" value={form.delivery_date} onChange={e => setForm(p => ({ ...p, delivery_date: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <input className="form-input" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Special instructions..." />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : '➕ Add Order'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
