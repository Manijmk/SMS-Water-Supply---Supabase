import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

export default function Deliveries() {
  const today = new Date().toISOString().split('T')[0]
  const [deliveries, setDeliveries] = useState([])
  const [trips, setTrips] = useState([])
  const [customers, setCustomers] = useState([])
  const [orders, setOrders] = useState([])
  const [date, setDate] = useState(today)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selCust, setSelCust] = useState(null)
  const [form, setForm] = useState({
    trip_id: '', customer_id: '', order_id: '',
    delivered: 1, empty_collected: 0, payment_received: 0, payment_mode: 'cash'
  })

  const dateRef = useRef(date)
  const fetchRef = useRef(null)

  useEffect(() => { dateRef.current = date }, [date])

  const fetchAll = useCallback(async () => {
    try {
      const d = dateRef.current
      const [delRes, tripRes, custRes, ordRes] = await Promise.all([
        supabase.from('deliveries').select('*').eq('date', d).order('created_at', { ascending: false }),
        supabase.from('trips').select('*').eq('date', d).order('trip_number'),
        supabase.from('customers').select('*').order('name'),
        supabase.from('orders').select('*').eq('delivery_date', d).in('status', ['pending', 'out_for_delivery']),
      ])
      setDeliveries(delRes.data || [])
      setTrips(tripRes.data || [])
      setCustomers(custRes.data || [])
      setOrders(ordRes.data || [])
    } catch (err) {
      console.error('Fetch deliveries error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRef.current = fetchAll }, [fetchAll])

  useEffect(() => {
    fetchAll()
    const channel = supabase
      .channel('deliveries-rt-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => fetchRef.current?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchRef.current?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => fetchRef.current?.())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => { fetchAll() }, [date])

  const pickCust = (id) => {
    const c = customers.find(x => x.id === id)
    setSelCust(c || null)
    setForm(f => ({ ...f, customer_id: id }))
    const o = orders.find(x => x.customer_id === id)
    if (o) {
      setForm(f => ({ ...f, order_id: o.id, delivered: o.quantity || 1 }))
    } else {
      setForm(f => ({ ...f, order_id: '' }))
    }
  }

  const calcAmt = () => (parseInt(form.delivered) || 0) * (selCust?.price_per_can || 40)

  const save = async () => {
    if (!form.trip_id) return toast.error('Select a trip')
    if (!form.customer_id) return toast.error('Select a customer')
    if (!selCust) return toast.error('Customer data not loaded')

    const exp = calcAmt()
    const paid = parseInt(form.payment_received) || 0
    const bal = Math.max(0, exp - paid)

    setSaving(true)
    try {
      // Insert delivery
      const { error: delErr } = await supabase.from('deliveries').insert({
        trip_id: form.trip_id,
        customer_id: form.customer_id,
        order_id: form.order_id || null,
        customer_name: selCust.name,
        delivered: parseInt(form.delivered) || 0,
        empty_collected: parseInt(form.empty_collected) || 0,
        payment_received: paid,
        balance_amount: bal,
        payment_mode: form.payment_mode,
        date: dateRef.current,
      })
      if (delErr) throw delErr

      // Update customer due + empties
      const newDue = (selCust.due_amount || 0) + bal
      const newEmpties = (selCust.empty_balance || 0) + (parseInt(form.delivered) || 0) - (parseInt(form.empty_collected) || 0)
      const { error: custErr } = await supabase
        .from('customers')
        .update({ due_amount: newDue, empty_balance: newEmpties })
        .eq('id', selCust.id)
      if (custErr) console.error('Customer update error:', custErr)

      // Update order status
      if (form.order_id) {
        const { error: ordErr } = await supabase
          .from('orders')
          .update({ status: 'delivered' })
          .eq('id', form.order_id)
        if (ordErr) console.error('Order update error:', ordErr)
      }

      toast.success(`Delivered to ${selCust.name}!`)
      setShowModal(false)
      setSelCust(null)
      setForm({ trip_id: '', customer_id: '', order_id: '', delivered: 1, empty_collected: 0, payment_received: 0, payment_mode: 'cash' })
      await fetchAll()
    } catch (e) {
      toast.error('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const del = async id => {
    if (!confirm('Delete this delivery record?')) return
    try {
      await supabase.from('deliveries').delete().eq('id', id)
      toast.success('Deleted')
    } catch (e) {
      toast.error('Failed')
    }
  }

  const tDel = deliveries.reduce((s, d) => s + (d.delivered || 0), 0)
  const tCash = deliveries.reduce((s, d) => s + (d.payment_received || 0), 0)
  const tEmp = deliveries.reduce((s, d) => s + (d.empty_collected || 0), 0)

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>📦 Deliveries</h1>
          <p>{deliveries.length} records · {tDel} cans · ₹{tCash.toLocaleString()}</p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowModal(true)}>+ Record Delivery</button>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Date</label>
            <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card emerald"><div className="stat-icon">📦</div><div className="stat-info"><div className="stat-value">{tDel}</div><div className="stat-label">Cans Delivered</div></div></div>
          <div className="stat-card teal"><div className="stat-icon">💰</div><div className="stat-info"><div className="stat-value">₹{tCash.toLocaleString()}</div><div className="stat-label">Cash Collected</div></div></div>
          <div className="stat-card amber"><div className="stat-icon">♻️</div><div className="stat-info"><div className="stat-value">{tEmp}</div><div className="stat-label">Empties</div></div></div>
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Customer</th><th>Cans</th><th>Empties</th><th>Expected</th><th>Paid</th><th>Balance</th><th>Mode</th><th></th></tr></thead>
              <tbody>
                {deliveries.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state"><span className="empty-icon">📦</span><h3>No deliveries</h3></div></td></tr>
                ) : deliveries.map(d => {
                  const c = customers.find(x => x.id === d.customer_id)
                  const exp = (d.delivered || 0) * (c?.price_per_can || 40)
                  return (
                    <tr key={d.id}>
                      <td><div className="cell-main">{d.customer_name}</div></td>
                      <td><strong>{d.delivered}</strong></td>
                      <td>{d.empty_collected}</td>
                      <td>₹{exp}</td>
                      <td>₹{d.payment_received}</td>
                      <td>{d.balance_amount > 0 ? <span className="due-amount">₹{d.balance_amount}</span> : <span className="due-clear">✓</span>}</td>
                      <td><span className={`badge badge-${d.payment_mode}`}>{d.payment_mode}</span></td>
                      <td><button className="btn btn-sm btn-ghost" style={{ color: 'var(--rose-500)' }} onClick={() => del(d.id)}>🗑️</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Record Delivery</h3><button className="modal-close" onClick={() => setShowModal(false)}>✕</button></div>
            <div className="modal-body">
              <div className="form-group">
                <label>Trip *</label>
                <select className="form-control" value={form.trip_id} onChange={e => setForm({ ...form, trip_id: e.target.value })}>
                  <option value="">Select trip...</option>
                  {trips.map(t => <option key={t.id} value={t.id}>Trip #{t.trip_number} — {t.delivery_boy} ({t.vehicle})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Customer *</label>
                <select className="form-control" value={form.customer_id} onChange={e => pickCust(e.target.value)}>
                  <option value="">Select...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.area} (₹{c.price_per_can}/can)</option>)}
                </select>
              </div>
              {selCust?.due_amount > 0 && <div className="alert alert-danger">⚠️ Existing due: <strong>₹{selCust.due_amount}</strong></div>}
              <div className="form-row">
                <div className="form-group"><label>Cans Delivered</label><input type="number" className="form-control" value={form.delivered} onChange={e => setForm({ ...form, delivered: e.target.value })} min={0} /></div>
                <div className="form-group"><label>Empties Collected</label><input type="number" className="form-control" value={form.empty_collected} onChange={e => setForm({ ...form, empty_collected: e.target.value })} min={0} /></div>
              </div>
              {selCust && <div className="amount-box"><div className="amount-label">Expected Amount</div><div className="amount-value">₹{calcAmt()}</div></div>}
              <div className="form-row">
                <div className="form-group"><label>Amount Received (₹)</label><input type="number" className="form-control" value={form.payment_received} onChange={e => setForm({ ...form, payment_received: e.target.value })} min={0} /></div>
                <div className="form-group"><label>Payment Mode</label><select className="form-control" value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value })}><option value="cash">💵 Cash</option><option value="upi">📱 UPI</option><option value="credit">📕 Credit</option></select></div>
              </div>
              {selCust && parseInt(form.payment_received) < calcAmt() && (
                <div className="alert alert-warning">Shortfall of ₹{calcAmt() - (parseInt(form.payment_received) || 0)} will be added to due</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-success" onClick={save} disabled={saving}>{saving ? '⏳ Saving...' : 'Save Delivery ✓'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}