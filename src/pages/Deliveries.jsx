import { useEffect, useState, useCallback } from 'react'
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

  const loadDeliveries = useCallback(async () => {
    const { data } = await supabase.from('deliveries').select('*').eq('date', dateFilter).order('created_at')
    setDeliveries(data || [])
    setLoading(false)
  }, [dateFilter])

  const loadTrips = useCallback(async () => {
    const { data } = await supabase.from('trips').select('*').eq('date', dateFilter).order('trip_number')
    setTrips(data || [])
  }, [dateFilter])

  const loadCustomers = useCallback(async () => {
    const { data } = await supabase.from('customers').select('*').order('name')
    setCustomers(data || [])
  }, [])

  useEffect(() => {
    setLoading(true)
    // Parallel fetch — all 3 at once
    Promise.all([loadDeliveries(), loadTrips(), loadCustomers()])

    const channel = supabase
      .channel(`deliveries-${dateFilter}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setDeliveries(prev => [...prev, payload.new])
        } else if (payload.eventType === 'UPDATE') {
          setDeliveries(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d))
        } else if (payload.eventType === 'DELETE') {
          setDeliveries(prev => prev.filter(d => d.id !== payload.old.id))
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setTrips(prev => prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t))
        } else {
          loadTrips()
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setCustomers(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c))
        } else {
          loadCustomers()
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [dateFilter, loadDeliveries, loadTrips, loadCustomers])

  const enriched = deliveries.map(d => ({
    ...d,
    customer_name: customers.find(c => c.id === d.customer_id)?.name || d.customer_name || '?',
    trip_label: (() => { const t = trips.find(x => x.id === d.trip_id); return t ? `Trip #${t.trip_number} - ${t.delivery_boy}` : '?' })()
  }))

  const filtered = tripFilter === 'All' ? enriched : enriched.filter(d => d.trip_id === tripFilter)
  const totalDelivered = filtered.reduce((s, d) => s + (d.delivered || 0), 0)
  const totalCash = filtered.reduce((s, d) => s + (d.payment_received || 0), 0)
  const totalEmpties = filtered.reduce((s, d) => s + (d.empty_collected || 0), 0)
  const totalBalance = filtered.reduce((s, d) => s + (d.balance_amount || 0), 0)

  const selectedCustomer = customers.find(c => c.id === form.customer_id)
  const calculatedAmount = +form.delivered * (selectedCustomer?.price_per_can || 0)
  const shortfall = calculatedAmount - +form.payment_received

  function f(k, v) {
    setForm(p => {
      const updated = { ...p, [k]: v }
      if (k === 'delivered' || k === 'customer_id') {
        const cust = customers.find(x => x.id === (k === 'customer_id' ? v : p.customer_id))
        if (cust) updated.payment_received = +updated.delivered * cust.price_per_can
      }
      return updated
    })
  }

  async function save() {
    if (!form.trip_id || !form.customer_id) return toast.error('Select trip and customer')
    setSaving(true)
    const c = customers.find(x => x.id === form.customer_id)
    const calcAmount = +form.delivered * (c?.price_per_can || 0)
    const balanceAmount = calcAmount - +form.payment_received

    const { data: newDel, error } = await supabase.from('deliveries').insert({
      trip_id: form.trip_id,
      customer_id: form.customer_id,
      customer_name: c?.name,
      delivered: +form.delivered,
      empty_collected: +form.empty_collected,
      payment_received: +form.payment_received,
      payment_mode: form.payment_mode,
      balance_amount: balanceAmount,
      date: dateFilter
    }).select().single()

    if (error) { toast.error('Error: ' + error.message); setSaving(false); return }

    if (c) {
      const newEmptyBalance = (c.empty_balance || 0) + (+form.empty_collected) - (+form.delivered)
      const newDueAmount = (c.due_amount || 0) + balanceAmount
      await supabase.from('customers').update({ empty_balance: newEmptyBalance, due_amount: newDueAmount }).eq('id', c.id)
    }

    if (balanceAmount > 0) toast.success(`✅ Recorded! ₹${balanceAmount} added to due`)
    else if (balanceAmount < 0) toast.success(`✅ Recorded! Customer overpaid ₹${Math.abs(balanceAmount)}`)
    else toast.success('✅ Full payment received!')

    setModal(false)
    setForm({ trip_id: '', customer_id: '', delivered: 1, empty_collected: 0, payment_received: 0, payment_mode: 'cash' })
    setSaving(false)
  }

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
          { label: 'Pending Balance', value: `₹${totalBalance}`, color: totalBalance > 0 ? 'var(--red)' : 'var(--green)' },
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
              <thead><tr><th>Customer</th><th>Trip</th><th>Delivered</th><th>Empties</th><th>Calc. Amt</th><th>Paid</th><th>Balance</th><th>Mode</th></tr></thead>
              <tbody>
                {filtered.map(d => {
                  const cust = customers.find(c => c.id === d.customer_id)
                  const calcAmt = d.delivered * (cust?.price_per_can || 0)
                  const bal = d.balance_amount ?? (calcAmt - d.payment_received)
                  return (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 700 }}>{d.customer_name}</td>
                      <td style={{ fontSize: 13, color: 'var(--gray-500)' }}>{d.trip_label}</td>
                      <td><span className="badge badge-green">{d.delivered} cans</span></td>
                      <td><span className="badge badge-blue">{d.empty_collected}</span></td>
                      <td style={{ fontWeight: 700 }}>₹{calcAmt}</td>
                      <td style={{ fontWeight: 700, color: 'var(--green)' }}>₹{d.payment_received}</td>
                      <td>
                        {bal > 0 ? <span className="badge badge-red">₹{bal} due</span>
                          : bal < 0 ? <span className="badge badge-green">₹{Math.abs(bal)} extra</span>
                          : <span className="badge badge-gray">✅ Clear</span>}
                      </td>
                      <td><span className="badge badge-gray">{d.payment_mode}</span></td>
                    </tr>
                  )
                })}
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
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.area} (₹{c.price_per_can}/can{c.due_amount > 0 ? ` | Due: ₹${c.due_amount}` : ''})
                  </option>
                ))}
              </select>
            </div>

            {selectedCustomer && (
              <div style={{ background: 'var(--sky-pale)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, border: '1px solid var(--sky-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontWeight: 700, color: 'var(--ocean)', fontSize: 13 }}>💰 Rate: ₹{selectedCustomer.price_per_can}/can</span>
                  <span style={{ fontWeight: 700, color: 'var(--sky)', fontSize: 13 }}>📦 Empty bal: {selectedCustomer.empty_balance}</span>
                  {selectedCustomer.due_amount > 0 && (
                    <span style={{ fontWeight: 700, color: 'var(--red)', fontSize: 13, width: '100%' }}>⚠️ Existing due: ₹{selectedCustomer.due_amount}</span>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <div className="form-group">
                <label className="form-label">Cans Delivered *</label>
                <input className="form-input" type="number" min={0} value={form.delivered} onChange={e => f('delivered', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Empty Cans Collected</label>
                <input className="form-input" type="number" min={0} value={form.empty_collected} onChange={e => f('empty_collected', e.target.value)} />
              </div>
            </div>

            {selectedCustomer && +form.delivered > 0 && (
              <div style={{ background: shortfall === 0 ? '#f0fdf4' : shortfall > 0 ? '#fff7ed' : '#eff6ff', borderRadius: 10, padding: '12px 14px', marginBottom: 12, border: `1px solid ${shortfall === 0 ? '#bbf7d0' : shortfall > 0 ? '#fed7aa' : '#bfdbfe'}` }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>📋 {form.delivered} × ₹{selectedCustomer.price_per_can} = <span style={{ color: 'var(--ocean)' }}>₹{calculatedAmount}</span></div>
                {shortfall > 0 && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 4 }}>⚠️ Short by ₹{shortfall} — will be added to due</div>}
                {shortfall < 0 && <div style={{ color: 'var(--sky)', fontSize: 13, marginTop: 4 }}>ℹ️ Overpaid by ₹{Math.abs(shortfall)}</div>}
                {shortfall === 0 && <div style={{ color: 'var(--green)', fontSize: 13, marginTop: 4 }}>✅ Full payment</div>}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <div className="form-group">
                <label className="form-label">Cash Received (₹) <span style={{ color: 'var(--sky)', fontSize: 11 }}>(auto-calc)</span></label>
                <input className="form-input" type="number" min={0} value={form.payment_received} onChange={e => f('payment_received', e.target.value)}
                  style={{ borderColor: shortfall > 0 ? 'var(--orange)' : shortfall < 0 ? 'var(--sky)' : 'var(--green)' }} />
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
