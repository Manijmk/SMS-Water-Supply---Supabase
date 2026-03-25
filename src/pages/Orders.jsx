import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

const AREAS = ['All', 'Tondiarpet', 'New Washermanpet', 'Kaladipet', 'Tollgate', 'Thiruvotriyur']
const STATUSES = ['pending', 'out_for_delivery', 'delivered', 'cancelled', 'pending_confirmation']

export default function Orders() {
  const today = new Date().toISOString().split('T')[0]
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [date, setDate] = useState(today)
  const [areaF, setAreaF] = useState('All')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ customer_id: '', quantity: 1, delivery_date: today, notes: '' })

  const dateRef = useRef(date)
  const fetchRef = useRef(null)

  // Keep date ref current
  useEffect(() => {
    dateRef.current = date
  }, [date])

  const fetchOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('delivery_date', dateRef.current)
        .order('created_at', { ascending: false })
      if (error) throw error
      setOrders(data || [])
    } catch (err) {
      console.error('Fetch orders error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCustomers = async () => {
    const { data } = await supabase.from('customers').select('id,name,area').order('name')
    setCustomers(data || [])
  }

  useEffect(() => {
    fetchRef.current = fetchOrders
  }, [fetchOrders])

  useEffect(() => {
    fetchOrders()
    fetchCustomers()

    const channel = supabase
      .channel('orders-rt-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchRef.current?.()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  // Refetch when date changes
  useEffect(() => {
    fetchOrders()
  }, [date])

  const shown = areaF === 'All' ? orders : orders.filter(o => o.area === areaF)
  const totalCans = shown.reduce((s, o) => s + (o.quantity || 0), 0)

  const add = async () => {
    if (!form.customer_id) return toast.error('Select a customer')
    const c = customers.find(x => x.id === form.customer_id)
    if (!c) return toast.error('Customer not found')

    setSaving(true)
    try {
      const { error } = await supabase.from('orders').insert({
        customer_id: form.customer_id,
        customer_name: c.name,
        area: c.area,
        quantity: parseInt(form.quantity) || 1,
        delivery_date: form.delivery_date,
        status: 'pending',
        notes: form.notes,
      })
      if (error) throw error
      toast.success('Order added!')
      setShowModal(false)
      setForm({ customer_id: '', quantity: 1, delivery_date: today, notes: '' })
    } catch (e) {
      toast.error('Failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (id, s) => {
    try {
      const { error } = await supabase.from('orders').update({ status: s }).eq('id', id)
      if (error) throw error
      toast.success(`Status → ${s.replace(/_/g, ' ')}`)
    } catch (e) {
      toast.error('Update failed: ' + e.message)
    }
  }

  const del = async (id) => {
    if (!confirm('Delete this order?')) return
    try {
      const { error } = await supabase.from('orders').delete().eq('id', id)
      if (error) throw error
      toast.success('Deleted')
    } catch (e) {
      toast.error('Delete failed: ' + e.message)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>📋 Orders</h1>
          <p>{shown.length} orders · {totalCans} cans</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Order</button>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Date</label>
            <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div className="chip-group">
          {AREAS.map(a => (
            <button key={a} className={`chip ${areaF === a ? 'active' : ''}`} onClick={() => setAreaF(a)}>
              {a} ({a === 'All' ? orders.length : orders.filter(o => o.area === a).length})
            </button>
          ))}
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Customer</th><th>Area</th><th>Qty</th><th>Status</th><th>Notes</th><th></th></tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">
                        <span className="empty-icon">📭</span>
                        <h3>No orders</h3>
                        <p>No orders for this date</p>
                      </div>
                    </td>
                  </tr>
                ) : shown.map(o => (
                  <tr key={o.id}>
                    <td><div className="cell-main">{o.customer_name}</div></td>
                    <td>{o.area}</td>
                    <td><strong>{o.quantity}</strong></td>
                    <td>
                      <select
                        className="form-control"
                        value={o.status}
                        onChange={e => updateStatus(o.id, e.target.value)}
                        style={{ padding: '6px 32px 6px 10px', fontSize: 12, width: 'auto', minWidth: 150, borderRadius: '9999px' }}
                      >
                        {STATUSES.map(s => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ color: 'var(--n-400)', fontSize: 13 }}>{o.notes || '—'}</td>
                    <td>
                      <button className="btn btn-sm btn-ghost" style={{ color: 'var(--rose-500)' }} onClick={() => del(o.id)}>
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Order Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New Order</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Customer *</label>
                <select className="form-control" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                  <option value="">Select customer...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.area})</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" className="form-control" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} min={1} />
                </div>
                <div className="form-group">
                  <label>Delivery Date</label>
                  <input type="date" className="form-control" value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea className="form-control" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Special instructions..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={add} disabled={saving}>
                {saving ? '⏳' : 'Add Order →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}