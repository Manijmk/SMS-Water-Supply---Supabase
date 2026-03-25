import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const today = new Date().toISOString().split('T')[0]
  const [truckCans, setTruckCans] = useState('')
  const [truckStock, setTruckStock] = useState(null)
  const [stats, setStats] = useState({
    totalCustomers: 0, todayOrders: 0, todayDelivered: 0,
    todayPending: 0, totalDue: 0, cansDelivered: 0,
    emptiesCollected: 0, cashCollected: 0, cansLoaded: 0,
  })
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Ref to always call latest fetch
  const fetchRef = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      // Parallel fetch all data
      const [custRes, ordRes, delRes, tripRes, stockRes, dueRes] = await Promise.all([
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*').eq('delivery_date', today),
        supabase.from('deliveries').select('*').eq('date', today),
        supabase.from('trips').select('loaded_cans').eq('date', today),
        supabase.from('truck_stock').select('*').eq('date', today).maybeSingle(),
        supabase.from('customers').select('due_amount'),
      ])

      const orders = ordRes.data || []
      const dels = delRes.data || []
      const trips = tripRes.data || []
      const stock = stockRes.data  // maybeSingle returns { data: row | null }
      const dues = dueRes.data || []

      setStats({
        totalCustomers: custRes.count || 0,
        todayOrders: orders.length,
        todayDelivered: orders.filter(o => o.status === 'delivered').length,
        todayPending: orders.filter(o => ['pending', 'out_for_delivery'].includes(o.status)).length,
        totalDue: dues.reduce((s, c) => s + (c.due_amount || 0), 0),
        cansDelivered: dels.reduce((s, d) => s + (d.delivered || 0), 0),
        emptiesCollected: dels.reduce((s, d) => s + (d.empty_collected || 0), 0),
        cashCollected: dels.reduce((s, d) => s + (d.payment_received || 0), 0),
        cansLoaded: trips.reduce((s, t) => s + (t.loaded_cans || 0), 0),
      })

      // Truck stock — stock is the row directly (or null)
      setTruckStock(stock || null)
      if (stock?.total_cans != null) {
        setTruckCans(stock.total_cans.toString())
      }

      // Recent orders
      const { data: recent } = await supabase
        .from('orders')
        .select('*')
        .eq('delivery_date', today)
        .order('created_at', { ascending: false })
        .limit(8)
      setRecentOrders(recent || [])
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [today])

  // Keep ref updated
  useEffect(() => {
    fetchRef.current = fetchAll
  }, [fetchAll])

  useEffect(() => {
    fetchAll()

    // Realtime — subscribe to all relevant tables
    const channel = supabase
      .channel('dashboard-realtime-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchRef.current?.()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => {
        fetchRef.current?.()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        fetchRef.current?.()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'truck_stock' }, () => {
        fetchRef.current?.()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        fetchRef.current?.()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const saveTruck = async () => {
    const n = parseInt(truckCans)
    if (isNaN(n) || n <= 0) return toast.error('Enter valid can count')
    setSaving(true)
    try {
      if (truckStock?.id) {
        const { error } = await supabase
          .from('truck_stock')
          .update({ total_cans: n, recorded_at: new Date().toISOString() })
          .eq('id', truckStock.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('truck_stock')
          .insert({ date: today, total_cans: n })
        if (error) throw error
      }
      toast.success('Truck stock saved!')
      await fetchAll()
    } catch (err) {
      toast.error('Failed to save: ' + (err.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const arrived = truckStock?.total_cans || 0
  const remaining = arrived - stats.cansDelivered
  const pct = arrived > 0 ? Math.min(100, Math.round((stats.cansDelivered / arrived) * 100)) : 0

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading dashboard...</p>
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>📊 Dashboard</h1>
          <p>{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <button className="btn btn-ghost" onClick={fetchAll}>🔄 Refresh</button>
      </div>

      <div className="page-body">
        {/* Truck Stock */}
        <div className="card animate-in">
          <div className="card-header">
            <h3>🚛 Truck Stock</h3>
            {truckStock && <span className="badge badge-delivered"><span className="dot" />Recorded</span>}
          </div>
          <div className="card-body">
            <div className="truck-input-row">
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Cans Arrived Today</label>
                <input
                  type="number"
                  className="form-control"
                  placeholder="How many cans on the truck?"
                  value={truckCans}
                  onChange={e => setTruckCans(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" onClick={saveTruck} disabled={saving}>
                {saving ? '⏳' : '💾'} Save
              </button>
            </div>

            {arrived > 0 && (
              <>
                <div className="tally-grid">
                  <div className="tally-card">
                    <span className="tally-icon">🚛</span>
                    <div className="tally-value">{arrived}</div>
                    <div className="tally-label">Arrived</div>
                  </div>
                  <div className="tally-card">
                    <span className="tally-icon">📦</span>
                    <div className="tally-value">{stats.cansLoaded}</div>
                    <div className="tally-label">Loaded</div>
                  </div>
                  <div className="tally-card success">
                    <span className="tally-icon">✅</span>
                    <div className="tally-value">{stats.cansDelivered}</div>
                    <div className="tally-label">Delivered</div>
                  </div>
                  <div className={`tally-card ${remaining < 0 ? 'danger' : ''}`}>
                    <span className="tally-icon">📊</span>
                    <div className="tally-value">{remaining}</div>
                    <div className="tally-label">Remaining</div>
                  </div>
                  <div className="tally-card">
                    <span className="tally-icon">♻️</span>
                    <div className="tally-value">{stats.emptiesCollected}</div>
                    <div className="tally-label">Empties</div>
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--n-500)', fontWeight: 600, marginBottom: 6 }}>
                    <span>Delivery Progress</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="progress-track">
                    <div className={`progress-fill ${remaining < 0 ? 'over' : ''}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card teal">
            <div className="stat-icon">👥</div>
            <div className="stat-info">
              <div className="stat-value">{stats.totalCustomers}</div>
              <div className="stat-label">Total Customers</div>
            </div>
          </div>
          <div className="stat-card orange">
            <div className="stat-icon">📋</div>
            <div className="stat-info">
              <div className="stat-value">{stats.todayOrders}</div>
              <div className="stat-label">Today's Orders</div>
            </div>
          </div>
          <div className="stat-card emerald">
            <div className="stat-icon">✅</div>
            <div className="stat-info">
              <div className="stat-value">{stats.todayDelivered}</div>
              <div className="stat-label">Delivered</div>
            </div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon">⏳</div>
            <div className="stat-info">
              <div className="stat-value">{stats.todayPending}</div>
              <div className="stat-label">Pending</div>
            </div>
          </div>
          <div className="stat-card violet">
            <div className="stat-icon">💰</div>
            <div className="stat-info">
              <div className="stat-value">₹{stats.cashCollected.toLocaleString()}</div>
              <div className="stat-label">Cash Today</div>
            </div>
          </div>
          <div className="stat-card rose">
            <div className="stat-icon">📕</div>
            <div className="stat-info">
              <div className="stat-value">₹{stats.totalDue.toLocaleString()}</div>
              <div className="stat-label">Total Due</div>
            </div>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="card animate-in">
          <div className="card-header">
            <h3>📋 Recent Orders</h3>
            <span style={{ fontSize: 12, color: 'var(--n-400)' }}>Auto-refreshes</span>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Customer</th><th>Area</th><th>Qty</th><th>Status</th></tr>
              </thead>
              <tbody>
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">
                        <span className="empty-icon">📭</span>
                        <h3>No orders today</h3>
                        <p>Orders will appear here in real-time</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  recentOrders.map(o => (
                    <tr key={o.id}>
                      <td><div className="cell-main">{o.customer_name}</div></td>
                      <td>{o.area}</td>
                      <td><strong>{o.quantity}</strong></td>
                      <td>
                        <span className={`badge badge-${o.status}`}>
                          <span className="dot" />
                          {o.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}