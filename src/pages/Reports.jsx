import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase/client'

const today = new Date().toISOString().split('T')[0]
const AREAS = ['Tondiarpet', 'New Washermanpet', 'Kaladipet', 'Tollgate', 'Thiruvotriyur']

export default function Reports() {
  const [date, setDate] = useState(today)
  const [orders, setOrders] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [trips, setTrips] = useState([])
  const [customers, setCustomers] = useState([])
  const [truckStock, setTruckStock] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: o }, { data: d }, { data: t }, { data: c }, { data: s }] = await Promise.all([
      supabase.from('orders').select('*').eq('delivery_date', date),
      supabase.from('deliveries').select('*').eq('date', date),
      supabase.from('trips').select('*').eq('date', date).order('trip_number'),
      supabase.from('customers').select('*'),
      supabase.from('truck_stock').select('*').eq('date', date).maybeSingle()
    ])
    setOrders(o || [])
    setDeliveries(d || [])
    setTrips(t || [])
    setCustomers(c || [])
    setTruckStock(s)
    setLoading(false)
  }, [date])

  useEffect(() => {
    fetchAll()

    const channel = supabase.channel(`reports-${date}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (p) => {
        if (p.eventType === 'INSERT') setOrders(prev => [...prev, p.new])
        else if (p.eventType === 'UPDATE') setOrders(prev => prev.map(o => o.id === p.new.id ? { ...o, ...p.new } : o))
        else if (p.eventType === 'DELETE') setOrders(prev => prev.filter(o => o.id !== p.old.id))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, (p) => {
        if (p.eventType === 'INSERT') setDeliveries(prev => [...prev, p.new])
        else if (p.eventType === 'UPDATE') setDeliveries(prev => prev.map(d => d.id === p.new.id ? { ...d, ...p.new } : d))
        else if (p.eventType === 'DELETE') setDeliveries(prev => prev.filter(d => d.id !== p.old.id))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, (p) => {
        if (p.eventType === 'UPDATE') setTrips(prev => prev.map(t => t.id === p.new.id ? { ...t, ...p.new } : t))
        else fetchAll()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'truck_stock' }, (p) => {
        if (p.new?.date === date) setTruckStock(p.new)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (p) => {
        if (p.eventType === 'UPDATE') setCustomers(prev => prev.map(c => c.id === p.new.id ? { ...c, ...p.new } : c))
        else fetchAll()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [date, fetchAll])

  const totalCansOrdered = orders.reduce((s, o) => s + (o.quantity || 0), 0)
  const totalDelivered = deliveries.reduce((s, d) => s + (d.delivered || 0), 0)
  const totalCash = deliveries.reduce((s, d) => s + (d.payment_received || 0), 0)
  const totalEmpties = deliveries.reduce((s, d) => s + (d.empty_collected || 0), 0)
  const totalLoaded = trips.reduce((s, t) => s + (t.loaded_cans || 0), 0)
  const creditCans = deliveries.filter(d => d.payment_mode === 'credit').reduce((s, d) => s + (d.delivered || 0), 0)
  const totalDue = customers.reduce((s, c) => s + (c.due_amount || 0), 0)
  const customersWithDue = customers.filter(c => c.due_amount > 0).length
  const truckCans = truckStock?.total_cans || 0
  const truckRemaining = truckCans - totalDelivered
  const efficiency = totalLoaded > 0 ? Math.round((totalDelivered / totalLoaded) * 100) : 0

  const areaBreakdown = AREAS.map(area => ({
    area,
    orders: orders.filter(o => o.area === area).length,
    cans: orders.filter(o => o.area === area).reduce((s, o) => s + (o.quantity || 0), 0)
  })).filter(a => a.orders > 0)

  const tripSummary = trips.map(t => ({
    label: `Trip #${t.trip_number}`,
    boy: t.delivery_boy,
    loaded: t.loaded_cans,
    delivered: deliveries.filter(d => d.trip_id === t.id).reduce((s, d) => s + d.delivered, 0),
    cash: deliveries.filter(d => d.trip_id === t.id).reduce((s, d) => s + d.payment_received, 0),
    empties: deliveries.filter(d => d.trip_id === t.id).reduce((s, d) => s + d.empty_collected, 0),
    status: t.status
  }))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports 📊</h1>
          <p className="page-subtitle">Daily summary <span style={{ color: 'var(--green)', fontWeight: 700 }}>● live</span></p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '2px solid var(--gray-200)', borderRadius: 8, padding: '8px 14px' }}>
          <span>📅</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ border: 'none', fontSize: 14, fontFamily: 'Nunito', outline: 'none' }} />
        </div>
      </div>

      {loading ? <div className="loading"><div className="spinner" />Loading...</div> : <>

        {/* Truck Tally */}
        <div className="card" style={{ marginBottom: 20, background: truckCans === 0 ? 'var(--gray-50)' : '#f0f9ff' }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>🚛 Truck Stock Tally</h3>
          {truckCans === 0 ? (
            <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>No truck stock for this date. Enter from Dashboard.</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 14 }}>
                {[
                  { label: '🚛 Arrived', value: truckCans, color: 'var(--ocean)' },
                  { label: '📤 Loaded', value: totalLoaded, color: 'var(--sky)' },
                  { label: '✅ Delivered', value: totalDelivered, color: 'var(--green)' },
                  { label: '📦 Remaining', value: truckRemaining, color: truckRemaining < 0 ? 'var(--red)' : 'var(--orange)' },
                  { label: '🔄 Empties', value: totalEmpties, color: 'var(--sky)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'white', borderRadius: 10, padding: '12px 14px', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: s.color, fontFamily: "'Baloo 2',cursive" }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'var(--gray-100)', borderRadius: 99, height: 12, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', borderRadius: 99, background: totalDelivered > truckCans ? 'var(--red)' : 'var(--green)', width: `${Math.min((totalDelivered / truckCans) * 100, 100)}%`, transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--gray-500)' }}>
                <span>{totalDelivered} of {truckCans} ({Math.min(Math.round((totalDelivered / truckCans) * 100), 100)}%)</span>
                {truckRemaining < 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}>⚠️ {Math.abs(truckRemaining)} over-delivered!</span>}
                {truckRemaining === 0 && <span style={{ color: 'var(--green)', fontWeight: 700 }}>✅ All accounted for!</span>}
                {truckRemaining > 0 && <span style={{ color: 'var(--orange)' }}>{truckRemaining} remaining</span>}
              </div>
            </>
          )}
        </div>

        {/* Stats */}
        <div className="stat-grid">
          {[
            { label: 'Orders', value: orders.length, sub: 'placed', color: 'var(--sky)' },
            { label: 'Cans Ordered', value: totalCansOrdered, sub: 'requested', color: 'var(--ocean)' },
            { label: 'Cans Delivered', value: totalDelivered, sub: 'confirmed', color: 'var(--green)' },
            { label: 'Cash Collected', value: `₹${totalCash}`, sub: 'today', color: 'var(--orange)' },
            { label: 'Empties Returned', value: totalEmpties, sub: 'cans', color: 'var(--sky)' },
            { label: 'Credit Cans', value: creditCans, sub: 'on credit', color: 'var(--red)' },
            { label: 'Efficiency', value: `${efficiency}%`, sub: 'loaded vs delivered', color: efficiency >= 90 ? 'var(--green)' : 'var(--orange)' },
            { label: 'Pending Dues', value: `₹${totalDue}`, sub: `${customersWithDue} customers`, color: 'var(--red)' },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ borderTop: `4px solid ${s.color}` }}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Area Breakdown */}
        {areaBreakdown.length > 0 && (
          <div className="card" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-100)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 800 }}>📍 Area-wise Breakdown</h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Area</th><th>Orders</th><th>Cans</th></tr></thead>
                <tbody>
                  {areaBreakdown.map(a => (
                    <tr key={a.area}>
                      <td style={{ fontWeight: 700 }}>{a.area}</td>
                      <td>{a.orders}</td>
                      <td><span className="badge badge-blue">{a.cans}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Trip Summary */}
        {tripSummary.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-100)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 800 }}>🚚 Trip Summary</h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Trip</th><th>Boy</th><th>Loaded</th><th>Delivered</th><th>Remaining</th><th>Empties</th><th>Cash</th><th>Status</th></tr></thead>
                <tbody>
                  {tripSummary.map((t, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{t.label}</td>
                      <td>{t.boy}</td>
                      <td>{t.loaded}</td>
                      <td style={{ fontWeight: 700, color: 'var(--green)' }}>{t.delivered}</td>
                      <td style={{ fontWeight: 700, color: (t.loaded - t.delivered) > 0 ? 'var(--orange)' : 'var(--green)' }}>{t.loaded - t.delivered}</td>
                      <td>{t.empties}</td>
                      <td style={{ fontWeight: 700, color: 'var(--orange)' }}>₹{t.cash}</td>
                      <td><span className={`badge ${t.status === 'completed' ? 'badge-green' : t.status === 'in_progress' ? 'badge-blue' : 'badge-gray'}`}>{t.status || 'pending'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>}
    </div>
  )
}
