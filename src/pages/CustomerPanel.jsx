import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]

export default function CustomerPanel() {
  const { linkedId, linkedData, logout } = useAuth()
  const [customer, setCustomer] = useState(linkedData)
  const [orders, setOrders] = useState([])
  const [activeTab, setActiveTab] = useState('home') // home | order | history
  const [orderQty, setOrderQty] = useState(1)
  const [orderNotes, setOrderNotes] = useState('')
  const [orderDate, setOrderDate] = useState(today)
  const [placing, setPlacing] = useState(false)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const loadCustomer = useCallback(async () => {
    if (!linkedId) return
    const { data } = await supabase.from('customers').select('*').eq('id', linkedId).single()
    setCustomer(data)
  }, [linkedId])

  const loadOrders = useCallback(async () => {
    if (!linkedId) return
    const { data } = await supabase.from('orders').select('*')
      .eq('customer_id', linkedId)
      .order('created_at', { ascending: false })
      .limit(20)
    setOrders(data || [])
    setLoading(false)
  }, [linkedId])

  useEffect(() => {
    if (!linkedId) return
    loadCustomer()
    loadOrders()

    const channel = supabase.channel('customer-panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders',
        filter: `customer_id=eq.${linkedId}` }, (p) => {
        if (p.eventType === 'INSERT') setOrders(prev => [p.new, ...prev])
        else if (p.eventType === 'UPDATE') setOrders(prev => prev.map(o => o.id === p.new.id ? { ...o, ...p.new } : o))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'customers',
        filter: `id=eq.${linkedId}` }, (p) => {
        setCustomer(prev => ({ ...prev, ...p.new }))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [linkedId, loadCustomer, loadOrders])

  async function placeOrder(e) {
    e.preventDefault()
    if (!orderQty || orderQty < 1) return toast.error('Enter valid quantity')
    setPlacing(true)
    const { error } = await supabase.from('orders').insert({
      customer_id: linkedId,
      customer_name: customer?.name,
      area: customer?.area,
      quantity: +orderQty,
      delivery_date: orderDate,
      notes: orderNotes,
      status: 'pending_confirmation' // admin needs to confirm
    })
    if (error) toast.error('Error placing order: ' + error.message)
    else {
      toast.success('✅ Order placed! Waiting for confirmation.')
      setOrderQty(1)
      setOrderNotes('')
      setActiveTab('history')
    }
    setPlacing(false)
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const statusColor = (s) => {
    if (s === 'delivered') return { bg: '#f0fdf4', color: '#166534', text: '✅ Delivered' }
    if (s === 'out_for_delivery') return { bg: '#eff6ff', color: '#1e40af', text: '🚚 Out for delivery' }
    if (s === 'pending_confirmation') return { bg: '#fefce8', color: '#854d0e', text: '⏳ Awaiting confirmation' }
    if (s === 'cancelled') return { bg: '#fef2f2', color: '#991b1b', text: '❌ Cancelled' }
    return { bg: '#fff7ed', color: '#9a3412', text: '📋 Pending' }
  }

  const todayOrders = orders.filter(o => o.delivery_date === today)
  const pendingOrders = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled')

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0ea5e9, #0369a1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'white', textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>💧</div>
        <div style={{ fontFamily: "'Baloo 2'", fontSize: 20, marginTop: 8 }}>Loading...</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0369a1, #0ea5e9)', padding: '20px 20px 40px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>💧 SMS Water Supply</div>
            <div style={{ fontFamily: "'Baloo 2'", fontSize: 22, fontWeight: 800 }}>Hi, {customer?.name?.split(' ')[0]}! 👋</div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>📍 {customer?.area} • {customer?.type}</div>
          </div>
          <button onClick={handleLogout}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Logout
          </button>
        </div>

        {/* Summary cards in header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 20 }}>
          {[
            { label: 'Due Amount', value: `₹${customer?.due_amount || 0}`, color: customer?.due_amount > 0 ? '#fca5a5' : '#bbf7d0', icon: '💰' },
            { label: 'Empty Cans', value: customer?.empty_balance || 0, color: '#bfdbfe', icon: '📦' },
            { label: 'Active Orders', value: pendingOrders.length, color: '#fde68a', icon: '📋' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '12px 10px', textAlign: 'center', backdropFilter: 'blur(4px)' }}>
              <div style={{ fontSize: 22 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Baloo 2'", color: s.color, lineHeight: 1.2 }}>{s.value}</div>
              <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '0 16px', marginTop: -20 }}>

        {activeTab === 'home' && (
          <>
            {/* Today's delivery status */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>📅 Today's Orders</h3>
              {todayOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray-500)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  <p style={{ fontWeight: 700 }}>No orders for today</p>
                  <button onClick={() => setActiveTab('order')}
                    className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
                    + Place Order
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {todayOrders.map(o => {
                    const s = statusColor(o.status)
                    return (
                      <div key={o.id} style={{ background: s.bg, borderRadius: 10, padding: '12px 14px', border: `1px solid ${s.color}30` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 800, color: s.color }}>{s.text}</div>
                            <div style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 2 }}>{o.quantity} cans • ₹{o.quantity * (customer?.price_per_can || 0)}</div>
                            {o.notes && <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>📝 {o.notes}</div>}
                          </div>
                          <div style={{ fontSize: 28 }}>
                            {o.status === 'delivered' ? '✅' : o.status === 'out_for_delivery' ? '🚚' : '⏳'}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Due amount alert */}
            {customer?.due_amount > 0 && (
              <div style={{ background: '#fef2f2', border: '2px solid #fecaca', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontWeight: 800, color: 'var(--red)', fontSize: 15 }}>⚠️ Pending Due Amount</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)', fontFamily: "'Baloo 2'", marginTop: 4 }}>₹{customer.due_amount}</div>
                <div style={{ fontSize: 13, color: '#991b1b', marginTop: 4 }}>Please pay your dues to the delivery boy on next delivery</div>
              </div>
            )}

            {/* Empty cans reminder */}
            {customer?.empty_balance > 0 && (
              <div style={{ background: '#fff7ed', border: '2px solid #fed7aa', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontWeight: 800, color: 'var(--orange)', fontSize: 15 }}>📦 Empty Cans Reminder</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--orange)', fontFamily: "'Baloo 2'", marginTop: 4 }}>{customer.empty_balance} cans</div>
                <div style={{ fontSize: 13, color: '#9a3412', marginTop: 4 }}>Please keep your empty cans ready for the delivery boy</div>
              </div>
            )}

            {/* Quick order button */}
            <button onClick={() => setActiveTab('order')} className="btn btn-primary btn-full btn-lg" style={{ marginBottom: 12 }}>
              📋 Place New Order
            </button>
          </>
        )}

        {activeTab === 'order' && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>📋 Place New Order</h3>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 20 }}>Your order will be confirmed by the admin</p>

            <form onSubmit={placeOrder}>
              {/* Rate info */}
              <div style={{ background: 'var(--sky-pale)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ocean)' }}>💰 Your rate: ₹{customer?.price_per_can}/can</div>
                {orderQty > 0 && <div style={{ fontSize: 13, color: 'var(--sky-dark)', marginTop: 4 }}>Total: ₹{orderQty * (customer?.price_per_can || 0)} for {orderQty} cans</div>}
              </div>

              <div className="form-group">
                <label className="form-label">Number of Cans</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button type="button" onClick={() => setOrderQty(q => Math.max(1, q - 1))}
                    style={{ width: 40, height: 40, borderRadius: 8, border: '2px solid var(--gray-200)', background: 'white', fontSize: 20, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  <input className="form-input" type="number" min={1} value={orderQty}
                    onChange={e => setOrderQty(+e.target.value)}
                    style={{ textAlign: 'center', fontSize: 22, fontWeight: 800, flex: 1 }} />
                  <button type="button" onClick={() => setOrderQty(q => q + 1)}
                    style={{ width: 40, height: 40, borderRadius: 8, border: '2px solid var(--sky)', background: 'var(--sky)', color: 'white', fontSize: 20, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Delivery Date</label>
                <input className="form-input" type="date" value={orderDate}
                  min={today} onChange={e => setOrderDate(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <input className="form-input" value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder="Any special instructions..." />
              </div>

              <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={placing}>
                {placing ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />Placing...</> : '✅ Place Order'}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12, marginTop: 8 }}>📜 Order History</h3>
            {orders.length === 0 ? (
              <div className="empty-state"><div className="icon">📋</div><p>No orders yet</p></div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {orders.map(o => {
                  const s = statusColor(o.status)
                  return (
                    <div key={o.id} className="card" style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 15 }}>{o.quantity} cans</div>
                          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>
                            📅 {new Date(o.delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                          {o.notes && <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>📝 {o.notes}</div>}
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ocean)', marginTop: 4 }}>
                            ₹{o.quantity * (customer?.price_per_can || 0)}
                          </div>
                        </div>
                        <span style={{ background: s.bg, color: s.color, padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
                          {s.text}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid var(--gray-200)', display: 'flex', boxShadow: '0 -4px 16px rgba(0,0,0,0.08)' }}>
        {[
          { tab: 'home', icon: '🏠', label: 'Home' },
          { tab: 'order', icon: '📋', label: 'Order' },
          { tab: 'history', icon: '📜', label: 'History' },
        ].map(t => (
          <button key={t.tab} onClick={() => setActiveTab(t.tab)}
            style={{ flex: 1, padding: '10px 0 12px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              color: activeTab === t.tab ? 'var(--sky)' : 'var(--gray-500)',
              borderTop: activeTab === t.tab ? '3px solid var(--sky)' : '3px solid transparent' }}>
            <span style={{ fontSize: 22 }}>{t.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
