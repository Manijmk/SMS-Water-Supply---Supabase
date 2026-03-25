import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const emoji = { pending: '🕐', out_for_delivery: '🚛', delivered: '✅', cancelled: '❌', pending_confirmation: '🔔' }

export default function CustomerPanel() {
  const { user, linkedId, signOut } = useAuth()
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]

  const [tab, setTab] = useState('home')
  const [cust, setCust] = useState(null)
  const [orders, setOrders] = useState([])
  const [todayOrder, setTodayOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [placing, setPlacing] = useState(false)
  const [of, setOf] = useState({ quantity: 1, delivery_date: today, notes: '' })

  const linkedIdRef = useRef(linkedId)
  const fetchRef = useRef(null)

  useEffect(() => { linkedIdRef.current = linkedId }, [linkedId])

  const fetchCust = useCallback(async () => {
    const id = linkedIdRef.current
    if (!id) return
    try {
      const { data, error } = await supabase.from('customers').select('*').eq('id', id).single()
      if (error) throw error
      setCust(data)
    } catch (err) {
      console.error('Fetch customer error:', err)
    }
  }, [])

  const fetchOrders = useCallback(async () => {
    const id = linkedIdRef.current
    if (!id) return
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', id)
        .order('delivery_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      setOrders(data || [])
      setTodayOrder(data?.find(o => o.delivery_date === today && o.status !== 'cancelled') || null)
    } catch (err) {
      console.error('Fetch orders error:', err)
    }
  }, [today])

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchCust(), fetchOrders()])
    setLoading(false)
  }, [fetchCust, fetchOrders])

  useEffect(() => { fetchRef.current = fetchAll }, [fetchAll])

  useEffect(() => {
    if (!linkedId) { setLoading(false); return }
    fetchAll()

    const channel = supabase
      .channel('customer-rt-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        const id = linkedIdRef.current
        if (payload.new?.customer_id === id || payload.old?.customer_id === id) {
          fetchRef.current?.()
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
        if (payload.new?.id === linkedIdRef.current) {
          setCust(payload.new)
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => {
        // Refresh when deliveries change (might affect our order status)
        fetchRef.current?.()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [linkedId])

  const place = async () => {
    if (!cust) return toast.error('Customer data not loaded')
    const qty = parseInt(of.quantity) || 1
    if (qty <= 0) return toast.error('Quantity must be at least 1')

    setPlacing(true)
    try {
      const { error } = await supabase.from('orders').insert({
        customer_id: cust.id,
        customer_name: cust.name,
        area: cust.area,
        quantity: qty,
        delivery_date: of.delivery_date,
        status: 'pending',
        notes: of.notes,
      })
      if (error) throw error
      toast.success('Order placed! 🎉')
      setTab('home')
      setOf({ quantity: 1, delivery_date: today, notes: '' })
      await fetchOrders()
    } catch (err) {
      toast.error('Failed: ' + err.message)
    } finally {
      setPlacing(false)
    }
  }

  const cancel = async id => {
    if (!confirm('Cancel this order?')) return
    try {
      const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id)
      if (error) throw error
      toast.success('Order cancelled')
      await fetchOrders()
    } catch (err) {
      toast.error('Failed: ' + err.message)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /><p>Loading...</p></div>

  if (!cust) {
    return (
      <div className="loading-screen">
        <p>Customer profile not found. Contact admin.</p>
        <button className="btn btn-ghost" onClick={async () => { await signOut(); navigate('/login') }}>Sign Out</button>
      </div>
    )
  }

  return (
    <div className="mobile-panel">
      <div className="mobile-header">
        <div className="header-row">
          <div>
            <h1>💧 SMS Water</h1>
            <p>👋 {cust.name}</p>
          </div>
          <button className="btn btn-sm btn-ghost" style={{ color: 'rgba(255,255,255,0.7)' }}
            onClick={async () => { await signOut(); navigate('/login') }}>🚪</button>
        </div>
      </div>

      <div className="mobile-tabs">
        <button className={`mobile-tab ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')}>🏠 Home</button>
        <button className={`mobile-tab ${tab === 'order' ? 'active' : ''}`} onClick={() => setTab('order')}>📦 Order</button>
        <button className={`mobile-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>📋 History</button>
      </div>

      <div className="mobile-content">
        {/* ═══ HOME TAB ═══ */}
        {tab === 'home' && (
          <>
            {cust.due_amount > 0 && (
              <div className="alert alert-danger">⚠️ Pending due: <strong>₹{cust.due_amount}</strong>. Please pay on next delivery.</div>
            )}
            {cust.empty_balance > 2 && (
              <div className="alert alert-warning">♻️ <strong>{cust.empty_balance}</strong> empty cans — keep them ready!</div>
            )}

            <div className="customer-stats">
              <div className={`mini-stat ${cust.due_amount > 0 ? 'rose' : 'emerald'}`}>
                <div className="mini-value">₹{cust.due_amount || 0}</div>
                <div className="mini-label">Due Amount</div>
              </div>
              <div className={`mini-stat ${cust.empty_balance > 2 ? 'amber' : 'teal'}`}>
                <div className="mini-value">{cust.empty_balance || 0}</div>
                <div className="mini-label">Empty Cans</div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><h3>📦 Today's Delivery</h3></div>
              <div className="card-body">
                {todayOrder ? (
                  <div>
                    <div className="status-display">
                      <span className="status-emoji">{emoji[todayOrder.status] || '📦'}</span>
                      <div className="status-text">{todayOrder.status?.replace(/_/g, ' ')}</div>
                    </div>
                    <div className="info-row"><span className="info-label">Quantity</span><span className="info-value">{todayOrder.quantity} cans</span></div>
                    <div className="info-row"><span className="info-label">Amount</span><span className="info-value highlight">₹{(todayOrder.quantity || 0) * (cust.price_per_can || 40)}</span></div>
                    {todayOrder.notes && <div className="info-row"><span className="info-label">Notes</span><span className="info-value">{todayOrder.notes}</span></div>}
                    {todayOrder.status === 'pending' && (
                      <button className="btn btn-danger btn-sm" style={{ width: '100%', marginTop: 14 }} onClick={() => cancel(todayOrder.id)}>
                        Cancel Order
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 24 }}>
                    <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>📭</span>
                    <p style={{ color: 'var(--n-400)', marginBottom: 14 }}>No order for today</p>
                    <button className="btn btn-primary btn-sm" onClick={() => setTab('order')}>+ Place Order</button>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><h3>ℹ️ Your Info</h3></div>
              <div className="card-body compact">
                <div className="info-row"><span className="info-label">Area</span><span className="info-value">{cust.area}</span></div>
                <div className="info-row"><span className="info-label">Type</span><span className={`badge badge-${cust.type}`}>{cust.type}</span></div>
                <div className="info-row"><span className="info-label">Rate</span><span className="info-value">₹{cust.price_per_can}/can</span></div>
              </div>
            </div>

            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={fetchAll}>🔄 Refresh</button>
          </>
        )}

        {/* ═══ ORDER TAB ═══ */}
        {tab === 'order' && (
          <div className="info-card" style={{ padding: 28 }}>
            <h3 style={{ textAlign: 'center', fontWeight: 800, fontSize: 18 }}>Place Order</h3>
            <p style={{ textAlign: 'center', color: 'var(--n-400)', fontSize: 13, marginBottom: 8 }}>₹{cust.price_per_can} per can</p>

            <div className="can-selector">
              <button className="can-btn" onClick={() => setOf({ ...of, quantity: Math.max(1, parseInt(of.quantity) - 1) })}>−</button>
              <div className="can-display">
                <div className="can-count">{of.quantity}</div>
                <div className="can-label">cans</div>
              </div>
              <button className="can-btn" onClick={() => setOf({ ...of, quantity: parseInt(of.quantity) + 1 })}>+</button>
            </div>

            <div className="amount-box">
              <div className="amount-label">Total Amount</div>
              <div className="amount-value">₹{(parseInt(of.quantity) || 0) * cust.price_per_can}</div>
            </div>

            <div className="form-group">
              <label>Delivery Date</label>
              <input type="date" className="form-control" value={of.delivery_date} onChange={e => setOf({ ...of, delivery_date: e.target.value })} min={today} />
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-control" value={of.notes} onChange={e => setOf({ ...of, notes: e.target.value })} rows={2} placeholder="Special instructions..." />
            </div>

            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={place} disabled={placing}>
              {placing ? '⏳ Placing...' : 'Place Order →'}
            </button>
          </div>
        )}

        {/* ═══ HISTORY TAB ═══ */}
        {tab === 'history' && (
          orders.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📋</span>
              <h3>No orders yet</h3>
              <p>Place your first order!</p>
            </div>
          ) : (
            orders.map((o, i) => (
              <div key={o.id} className="info-card" style={{ animationDelay: `${i * 0.03}s` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4>{o.quantity} Cans</h4>
                    <div className="meta">{o.delivery_date}</div>
                  </div>
                  <span className={`badge badge-${o.status}`}>
                    <span className="dot" />{emoji[o.status]} {o.status?.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="info-row"><span className="info-label">Amount</span><span className="info-value">₹{(o.quantity || 0) * (cust.price_per_can || 40)}</span></div>
                {o.notes && <div className="info-row"><span className="info-label">Notes</span><span className="info-value">{o.notes}</span></div>}
                {o.status === 'pending' && o.delivery_date >= today && (
                  <button className="btn btn-sm btn-danger" style={{ marginTop: 10 }} onClick={() => cancel(o.id)}>Cancel</button>
                )}
              </div>
            ))
          )
        )}
      </div>
    </div>
  )
}