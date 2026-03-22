import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]

export default function Dashboard() {
  const [customers, setCustomers] = useState([])
  const [orders, setOrders] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [truckStock, setTruckStock] = useState(null)
  const [editingStock, setEditingStock] = useState(false)
  const [stockInput, setStockInput] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const [{ data: c }, { data: o }, { data: d }, { data: t }] = await Promise.all([
      supabase.from('customers').select('id'),
      supabase.from('orders').select('*').eq('delivery_date', today),
      supabase.from('deliveries').select('*').eq('date', today),
      supabase.from('truck_stock').select('*').eq('date', today).maybeSingle()
    ])
    setCustomers(c || [])
    setOrders(o || [])
    setDeliveries(d || [])
    setTruckStock(t)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()

    const channel = supabase.channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT') setOrders(prev => [...prev, payload.new])
        else if (payload.eventType === 'UPDATE') setOrders(prev => prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o))
        else if (payload.eventType === 'DELETE') setOrders(prev => prev.filter(o => o.id !== payload.old.id))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, (payload) => {
        if (payload.eventType === 'INSERT') setDeliveries(prev => [...prev, payload.new])
        else if (payload.eventType === 'UPDATE') setDeliveries(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d))
        else if (payload.eventType === 'DELETE') setDeliveries(prev => prev.filter(d => d.id !== payload.old.id))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        supabase.from('customers').select('id').then(({ data }) => setCustomers(data || []))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'truck_stock' }, (payload) => {
        if (payload.new?.date === today) setTruckStock(payload.new)
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchAll])

  async function saveTruckStock() {
    if (!stockInput || isNaN(stockInput)) return toast.error('Enter a valid number')
    const { error } = await supabase.from('truck_stock').upsert({ date: today, total_cans: +stockInput }, { onConflict: 'date' })
    if (error) return toast.error('Error saving')
    toast.success('Truck stock saved!')
    setEditingStock(false)
    setStockInput('')
  }

  const totalCansOrdered = orders.reduce((s, o) => s + (o.quantity || 0), 0)
  const totalDelivered = deliveries.reduce((s, d) => s + (d.delivered || 0), 0)
  const totalCash = deliveries.reduce((s, d) => s + (d.payment_received || 0), 0)
  const totalEmpties = deliveries.reduce((s, d) => s + (d.empty_collected || 0), 0)
  const truckCans = truckStock?.total_cans || 0
  const remaining = truckCans - totalDelivered
  const pendingOrders = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled')

  if (loading) return <div className="loading"><div className="spinner" />Loading dashboard...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard 🏠</h1>
          <p className="page-subtitle">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      {/* Truck Stock */}
      <div className="card" style={{ marginBottom: 24, background: 'linear-gradient(135deg, #0369a1, #0ea5e9)', border: 'none', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.85, marginBottom: 8 }}>🚛 TODAY'S TRUCK STOCK</div>
            {truckStock ? (
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                {[
                  { label: 'Cans Arrived', value: truckCans, color: 'white' },
                  { label: 'Delivered', value: totalDelivered, color: '#bbf7d0' },
                  { label: remaining < 0 ? '⚠️ Over!' : 'Remaining', value: remaining, color: remaining < 0 ? '#fca5a5' : '#fde68a' },
                  { label: 'Empties Back', value: totalEmpties, color: '#bfdbfe' },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 34, fontWeight: 800, fontFamily: "'Baloo 2',cursive", lineHeight: 1, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 15, opacity: 0.85 }}>No truck stock recorded yet for today</div>
            )}
          </div>
          <div>
            {!editingStock ? (
              <button onClick={() => { setEditingStock(true); setStockInput(truckCans || '') }}
                style={{ background: 'rgba(255,255,255,0.25)', border: '2px solid rgba(255,255,255,0.5)', color: 'white', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {truckStock ? '✏️ Update' : '➕ Enter Stock'}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="number" value={stockInput} onChange={e => setStockInput(e.target.value)} placeholder="e.g. 600" autoFocus
                  style={{ padding: '8px 12px', borderRadius: 8, border: '2px solid rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.2)', color: 'white', fontFamily: 'Nunito', fontWeight: 700, fontSize: 15, width: 100, outline: 'none' }} />
                <button onClick={saveTruckStock} style={{ background: '#22c55e', border: 'none', color: 'white', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>✅</button>
                <button onClick={() => setEditingStock(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>✕</button>
              </div>
            )}
          </div>
        </div>
        {truckStock && truckCans > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
              <span>Delivery progress ({totalDelivered} of {truckCans} cans)</span>
              <span>{Math.min(Math.round((totalDelivered / truckCans) * 100), 100)}%</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 99, height: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, background: totalDelivered > truckCans ? '#ef4444' : '#22c55e', width: `${Math.min((totalDelivered / truckCans) * 100, 100)}%`, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="stat-grid">
        {[
          { label: 'Total Customers', value: customers.length, sub: 'Registered', color: 'var(--sky)' },
          { label: 'Orders Today', value: orders.length, sub: `${pendingOrders.length} pending`, color: 'var(--green)' },
          { label: 'Cans Ordered', value: totalCansOrdered, sub: 'To deliver', color: 'var(--ocean)' },
          { label: 'Cash Collected', value: `₹${totalCash}`, sub: 'Today', color: 'var(--orange)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ borderTop: `4px solid ${s.color}` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { icon: '👥', label: 'Add Customer', href: '/customers', color: 'var(--sky)' },
          { icon: '📋', label: 'New Order', href: '/orders', color: 'var(--green)' },
          { icon: '🚚', label: 'Create Trip', href: '/trips', color: 'var(--ocean)' },
          { icon: '📊', label: 'View Reports', href: '/reports', color: 'var(--orange)' },
        ].map(q => (
          <a key={q.label} href={q.href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '18px 12px', background: 'white', borderRadius: 'var(--radius)', border: `2px solid ${q.color}20`, boxShadow: 'var(--shadow-sm)', transition: 'all 0.2s', cursor: 'pointer', textDecoration: 'none' }}>
            <span style={{ fontSize: 26 }}>{q.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: q.color }}>{q.label}</span>
          </a>
        ))}
      </div>

      {/* Live Orders */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 800 }}>Today's Orders <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>● LIVE</span></h2>
          <a href="/orders" style={{ fontSize: 13, color: 'var(--sky)', fontWeight: 700 }}>View all →</a>
        </div>
        {orders.length === 0 ? (
          <div className="empty-state"><div className="icon">📋</div><p>No orders for today</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Area</th><th>Qty</th><th>Status</th></tr></thead>
              <tbody>
                {orders.slice(0, 10).map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 700 }}>{o.customer_name || '—'}</td>
                    <td>{o.area || '—'}</td>
                    <td><span className="badge badge-blue">{o.quantity} cans</span></td>
                    <td>
                      <span className={`badge ${o.status === 'delivered' ? 'badge-green' : o.status === 'out_for_delivery' ? 'badge-blue' : o.status === 'cancelled' ? 'badge-red' : 'badge-orange'}`}>
                        {o.status || 'pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
