import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function DeliveryBoy() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]
  const name = user?.user_metadata?.name || 'Delivery Boy'

  const [tab, setTab] = useState('trips')
  const [trips, setTrips] = useState([])
  const [selTrip, setSelTrip] = useState(null)
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [markTarget, setMarkTarget] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [summary, setSummary] = useState({ del: 0, cash: 0, emp: 0, count: 0 })
  const [mf, setMf] = useState({ delivered: 1, empty_collected: 0, payment_received: 0, payment_mode: 'cash' })

  // Refs for realtime callbacks
  const selTripRef = useRef(selTrip)
  const customersRef = useRef(customers)
  const fetchRef = useRef(null)

  useEffect(() => { selTripRef.current = selTrip }, [selTrip])
  useEffect(() => { customersRef.current = customers }, [customers])

  // ——— Data fetching ———
  const fetchTrips = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('date', today)
        .eq('delivery_boy', name)
        .order('trip_number')
      if (error) throw error
      setTrips(data || [])
    } catch (err) {
      console.error('Fetch trips error:', err)
    }
  }, [today, name])

  const fetchOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('delivery_date', today)
        .in('status', ['pending', 'out_for_delivery', 'delivered'])
        .order('created_at')
      if (error) throw error
      setOrders(data || [])
    } catch (err) {
      console.error('Fetch orders error:', err)
    }
  }, [today])

  const fetchCustomers = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('customers').select('*')
      if (error) throw error
      setCustomers(data || [])
    } catch (err) {
      console.error('Fetch customers error:', err)
    }
  }, [])

  const fetchSummary = useCallback(async () => {
    try {
      const { data: myTrips } = await supabase
        .from('trips')
        .select('id')
        .eq('date', today)
        .eq('delivery_boy', name)

      const ids = myTrips?.map(t => t.id) || []

      // ★ FIX: Don't query with empty array — causes error
      if (ids.length === 0) {
        setSummary({ del: 0, cash: 0, emp: 0, count: 0 })
        return
      }

      const { data: dd } = await supabase
        .from('deliveries')
        .select('*')
        .eq('date', today)
        .in('trip_id', ids)

      const myDels = dd || []
      setSummary({
        del: myDels.reduce((s, x) => s + (x.delivered || 0), 0),
        cash: myDels.reduce((s, x) => s + (x.payment_received || 0), 0),
        emp: myDels.reduce((s, x) => s + (x.empty_collected || 0), 0),
        count: myDels.length,
      })
    } catch (err) {
      console.error('Fetch summary error:', err)
    }
  }, [today, name])

  const fetchAllData = useCallback(async () => {
    await Promise.all([fetchTrips(), fetchOrders(), fetchCustomers(), fetchSummary()])
    setLoading(false)
  }, [fetchTrips, fetchOrders, fetchCustomers, fetchSummary])

  useEffect(() => { fetchRef.current = fetchAllData }, [fetchAllData])

  // ——— Init & realtime ———
  useEffect(() => {
    fetchAllData()

    const channel = supabase
      .channel('delivery-boy-rt-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchRef.current?.()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => {
        fetchRef.current?.()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        fetchRef.current?.()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        fetchRef.current?.()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  // ——— Helpers ———
  const getCust = (id) => customersRef.current.find(c => c.id === id) || customers.find(c => c.id === id)

  const openMark = (o) => {
    const c = getCust(o.customer_id)
    if (!c) {
      toast.error('Customer data not loaded yet. Please wait and try again.')
      return
    }
    setMarkTarget(o)
    setMf({
      delivered: o.quantity || 1,
      empty_collected: 0,
      payment_received: (o.quantity || 1) * (c.price_per_can || 40),
      payment_mode: 'cash',
    })
  }

  // ★ KEY FIX: Complete delivery recording with full error handling
  const deliver = async (o) => {
    // Validate trip
    const currentTrip = selTripRef.current
    if (!currentTrip) {
      toast.error('No trip selected! Go back and select a trip first.')
      return
    }

    // Validate customer
    const c = getCust(o.customer_id)
    if (!c) {
      toast.error('Customer not found. Please refresh and try again.')
      return
    }

    // Calculate amounts
    const cansDelivered = parseInt(mf.delivered) || 0
    const emptiesCollected = parseInt(mf.empty_collected) || 0
    const expectedAmount = cansDelivered * (c.price_per_can || 40)
    const paidAmount = parseInt(mf.payment_received) || 0
    const balanceAmount = Math.max(0, expectedAmount - paidAmount)

    if (cansDelivered <= 0) {
      toast.error('Cans delivered must be greater than 0')
      return
    }

    setSubmitting(true)

    try {
      // Step 1: Insert delivery record
      const { error: delErr } = await supabase.from('deliveries').insert({
        trip_id: currentTrip.id,
        customer_id: o.customer_id,
        order_id: o.id,
        customer_name: o.customer_name,
        delivered: cansDelivered,
        empty_collected: emptiesCollected,
        payment_received: paidAmount,
        balance_amount: balanceAmount,
        payment_mode: mf.payment_mode,
        date: today,
      })

      if (delErr) {
        console.error('Delivery insert error:', delErr)
        throw new Error('Failed to save delivery: ' + delErr.message)
      }

      // Step 2: Update order status
      const { error: ordErr } = await supabase
        .from('orders')
        .update({ status: 'delivered' })
        .eq('id', o.id)

      if (ordErr) {
        console.error('Order update error:', ordErr)
        // Don't throw — delivery was saved
      }

      // Step 3: Update customer due + empties
      const newDue = (c.due_amount || 0) + balanceAmount
      const newEmpties = (c.empty_balance || 0) + cansDelivered - emptiesCollected

      const { error: custErr } = await supabase
        .from('customers')
        .update({ due_amount: newDue, empty_balance: newEmpties })
        .eq('id', c.id)

      if (custErr) {
        console.error('Customer update error:', custErr)
        // Don't throw — delivery was saved
      }

      toast.success(`✅ Delivered to ${o.customer_name}!`)
      setMarkTarget(null)

      // Refresh all data
      await fetchAllData()
    } catch (e) {
      toast.error(e.message || 'Delivery failed. Please try again.')
      console.error('Deliver error:', e)
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  // ——— Filter orders for selected trip ———
  const tripOrders = selTrip
    ? orders.filter(o => {
        if (selTrip.route && selTrip.route.trim() !== '') {
          return o.area === selTrip.route
        }
        return true // Show all if no route set
      })
    : []

  const pending = tripOrders.filter(o => o.status !== 'delivered')
  const done = tripOrders.filter(o => o.status === 'delivered')

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading your trips...</p>
      </div>
    )
  }

  return (
    <div className="mobile-panel">
      {/* Header */}
      <div className="mobile-header">
        <div className="header-row">
          <div>
            <h1>💧 SMS Water</h1>
            <p>👋 {name}</p>
          </div>
          <button className="btn btn-sm btn-ghost" style={{ color: 'rgba(255,255,255,0.7)' }} onClick={handleLogout}>
            🚪
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mobile-tabs">
        <button className={`mobile-tab ${tab === 'trips' ? 'active' : ''}`} onClick={() => { setTab('trips'); setSelTrip(null); setMarkTarget(null) }}>
          🚛 Trips
        </button>
        <button className={`mobile-tab ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>
          📦 Deliver
        </button>
        <button className={`mobile-tab ${tab === 'summary' ? 'active' : ''}`} onClick={() => { setTab('summary'); fetchSummary() }}>
          📊 Summary
        </button>
      </div>

      <div className="mobile-content">
        {/* ═══ TRIPS TAB ═══ */}
        {tab === 'trips' && (
          trips.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🚛</span>
              <h3>No trips assigned today</h3>
              <p>Contact admin for trip assignment</p>
              <button className="btn btn-ghost btn-sm" onClick={fetchTrips} style={{ marginTop: 12 }}>🔄 Refresh</button>
            </div>
          ) : (
            trips.map((t, i) => (
              <div
                key={t.id}
                className="info-card clickable"
                onClick={() => { setSelTrip(t); setTab('orders'); setMarkTarget(null) }}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <h4>
                  {t.vehicle === '2-Wheeler' ? '🏍️' : t.vehicle?.includes('3') ? '🛺' : '🚛'}
                  {' '}Trip #{t.trip_number}
                </h4>
                <div className="meta">{t.route || 'All areas'} · {t.loaded_cans} cans loaded</div>
                <div className="info-row"><span className="info-label">Vehicle</span><span className="info-value">{t.vehicle}</span></div>
                <div className="info-row">
                  <span className="info-label">Status</span>
                  <span className={`badge badge-${t.status}`}><span className="dot" />{t.status}</span>
                </div>
                <div style={{ marginTop: 10, textAlign: 'center', color: 'var(--teal-500)', fontSize: 13, fontWeight: 700 }}>
                  Tap to view orders →
                </div>
              </div>
            ))
          )
        )}

        {/* ═══ ORDERS / DELIVER TAB ═══ */}
        {tab === 'orders' && (
          !selTrip ? (
            <div>
              <div className="alert alert-info">ℹ️ Select a trip from the Trips tab first</div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setTab('trips')}>
                ← Go to Trips
              </button>
            </div>
          ) : (
            <>
              <div className="alert alert-info" style={{ borderColor: 'var(--teal-400)' }}>
                📦 Trip #{selTrip.trip_number} — {selTrip.route || 'All areas'} — {selTrip.loaded_cans} cans
              </div>

              {/* Pending Orders */}
              {pending.length > 0 && (
                <>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--n-600)', margin: '16px 0 8px' }}>
                    ⏳ Pending ({pending.length})
                  </h4>
                  {pending.map(o => {
                    const c = getCust(o.customer_id)
                    const pricePerCan = c?.price_per_can || 40
                    const totalAmt = (o.quantity || 0) * pricePerCan

                    return (
                      <div key={o.id} className="info-card">
                        <h4>{o.customer_name}</h4>
                        <div className="meta">
                          📍 {c?.address || o.area} · 📞 {c?.primary_phone || c?.phone || '—'}
                        </div>

                        <div className="info-row"><span className="info-label">Cans</span><span className="info-value">{o.quantity}</span></div>
                        <div className="info-row"><span className="info-label">Rate</span><span className="info-value">₹{pricePerCan}/can</span></div>
                        <div className="info-row"><span className="info-label">Total</span><span className="info-value highlight">₹{totalAmt}</span></div>

                        {c?.due_amount > 0 && (
                          <div className="alert alert-danger" style={{ margin: '8px 0', padding: '8px 12px', fontSize: 12 }}>
                            ⚠️ Existing due: ₹{c.due_amount}
                          </div>
                        )}

                        {o.notes && (
                          <div className="info-row"><span className="info-label">Notes</span><span className="info-value">{o.notes}</span></div>
                        )}

                        {/* Mark Form */}
                        {markTarget?.id === o.id ? (
                          <div className="mark-form">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <div className="form-group" style={{ marginBottom: 10 }}>
                                <label>Cans</label>
                                <input type="number" className="form-control" value={mf.delivered}
                                  onChange={e => setMf({ ...mf, delivered: e.target.value })} min={0} disabled={submitting} />
                              </div>
                              <div className="form-group" style={{ marginBottom: 10 }}>
                                <label>Empties</label>
                                <input type="number" className="form-control" value={mf.empty_collected}
                                  onChange={e => setMf({ ...mf, empty_collected: e.target.value })} min={0} disabled={submitting} />
                              </div>
                            </div>

                            <div className="amount-box">
                              <div className="amount-label">Expected</div>
                              <div className="amount-value">₹{(parseInt(mf.delivered) || 0) * pricePerCan}</div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <div className="form-group" style={{ marginBottom: 10 }}>
                                <label>Received ₹</label>
                                <input type="number" className="form-control" value={mf.payment_received}
                                  onChange={e => setMf({ ...mf, payment_received: e.target.value })} min={0} disabled={submitting} />
                              </div>
                              <div className="form-group" style={{ marginBottom: 10 }}>
                                <label>Mode</label>
                                <select className="form-control" value={mf.payment_mode}
                                  onChange={e => setMf({ ...mf, payment_mode: e.target.value })} disabled={submitting}>
                                  <option value="cash">Cash</option>
                                  <option value="upi">UPI</option>
                                  <option value="credit">Credit</option>
                                </select>
                              </div>
                            </div>

                            {(() => {
                              const exp = (parseInt(mf.delivered) || 0) * pricePerCan
                              const paid = parseInt(mf.payment_received) || 0
                              if (paid < exp) {
                                return (
                                  <div className="alert alert-warning" style={{ fontSize: 12, padding: '6px 10px', marginBottom: 10 }}>
                                    Shortfall: ₹{exp - paid} will be added to due
                                  </div>
                                )
                              }
                              return null
                            })()}

                            <div className="card-actions">
                              <button
                                className="btn btn-success"
                                style={{ flex: 1 }}
                                onClick={() => deliver(o)}
                                disabled={submitting}
                              >
                                {submitting ? '⏳ Saving...' : '✓ Confirm Delivery'}
                              </button>
                              <button className="btn btn-ghost" onClick={() => setMarkTarget(null)} disabled={submitting}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="card-actions">
                            <button
                              className="btn btn-primary"
                              style={{ flex: 1 }}
                              onClick={() => openMark(o)}
                              disabled={submitting}
                            >
                              📦 Mark Delivered
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )}

              {/* Completed Orders */}
              {done.length > 0 && (
                <>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--emerald-500)', margin: '16px 0 8px' }}>
                    ✅ Completed ({done.length})
                  </h4>
                  {done.map(o => (
                    <div key={o.id} className="info-card" style={{ opacity: 0.6 }}>
                      <h4>✅ {o.customer_name}</h4>
                      <div className="meta">{o.area} · {o.quantity} cans</div>
                    </div>
                  ))}
                </>
              )}

              {tripOrders.length === 0 && (
                <div className="empty-state">
                  <span className="empty-icon">📦</span>
                  <h3>No orders for this route</h3>
                  <p>Orders for "{selTrip.route || 'all areas'}" will appear here</p>
                  <button className="btn btn-ghost btn-sm" onClick={fetchOrders} style={{ marginTop: 12 }}>🔄 Refresh</button>
                </div>
              )}
            </>
          )
        )}

        {/* ═══ SUMMARY TAB ═══ */}
        {tab === 'summary' && (
          <>
            <div className="customer-stats">
              <div className="mini-stat teal"><div className="mini-value">{summary.count}</div><div className="mini-label">Deliveries</div></div>
              <div className="mini-stat emerald"><div className="mini-value">{summary.del}</div><div className="mini-label">Cans</div></div>
              <div className="mini-stat amber"><div className="mini-value">₹{summary.cash.toLocaleString()}</div><div className="mini-label">Cash</div></div>
              <div className="mini-stat teal"><div className="mini-value">{summary.emp}</div><div className="mini-label">Empties</div></div>
            </div>

            <div className="card">
              <div className="card-header"><h3>📊 Today's Totals</h3></div>
              <div className="card-body compact">
                <div className="info-row"><span className="info-label">Total Deliveries</span><span className="info-value">{summary.count}</span></div>
                <div className="info-row"><span className="info-label">Cans Delivered</span><span className="info-value">{summary.del}</span></div>
                <div className="info-row"><span className="info-label">Cash Collected</span><span className="info-value highlight">₹{summary.cash.toLocaleString()}</span></div>
                <div className="info-row"><span className="info-label">Empties Collected</span><span className="info-value">{summary.emp}</span></div>
              </div>
            </div>

            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={fetchSummary}>🔄 Refresh Summary</button>
          </>
        )}
      </div>
    </div>
  )
}