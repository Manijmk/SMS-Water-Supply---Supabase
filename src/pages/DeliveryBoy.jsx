import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]

export default function DeliveryBoy() {
  const { linkedId, linkedData, logout } = useAuth()
  const [trips, setTrips] = useState([])
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [orders, setOrders] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [form, setForm] = useState({ delivered: 0, empty_collected: 0, payment_received: 0, payment_mode: 'cash' })
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('trips') // trips | summary
  const navigate = useNavigate()

  const deliveryBoyName = linkedData?.name || 'Delivery Boy'

  const loadTrips = useCallback(async () => {
    let query = supabase.from('trips').select('*').eq('date', today).order('trip_number')
    // If linked to a delivery boy record, filter by name
    if (linkedData?.name) query = query.eq('delivery_boy', linkedData.name)
    const { data } = await query
    setTrips(data || [])
    setLoading(false)
  }, [linkedData])

  const loadCustomers = useCallback(async () => {
    const { data } = await supabase.from('customers').select('*')
    setCustomers(data || [])
  }, [])

  useEffect(() => {
    loadTrips()
    loadCustomers()

    const channel = supabase.channel('delivery-boy-panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, (p) => {
        if (p.eventType === 'UPDATE') setTrips(prev => prev.map(t => t.id === p.new.id ? { ...t, ...p.new } : t))
        else loadTrips()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        if (selectedTrip) loadTripOrders(selectedTrip)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, (p) => {
        if (p.eventType === 'INSERT') setDeliveries(prev => [...prev, p.new])
        else if (p.eventType === 'UPDATE') setDeliveries(prev => prev.map(d => d.id === p.new.id ? { ...d, ...p.new } : d))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [loadTrips, loadCustomers])

  async function loadTripOrders(trip) {
    const [{ data: o }, { data: d }] = await Promise.all([
      supabase.from('orders').select('*').eq('delivery_date', today)
        .or(`area.eq.${trip.route},${trip.route === 'Mixed' ? 'area.neq.null' : `area.eq.${trip.route}`}`),
      supabase.from('deliveries').select('*').eq('date', today).eq('trip_id', trip.id)
    ])
    setOrders(o || [])
    setDeliveries(d || [])
    setLoading(false)
  }

  async function selectTrip(trip) {
    setSelectedTrip(trip)
    setLoading(true)
    await loadTripOrders(trip)
    setActiveTab('deliveries')
  }

  function openDeliver(order) {
    const c = customers.find(x => x.id === order.customer_id)
    setSelectedOrder({ ...order, customer: c })
    const calcAmount = order.quantity * (c?.price_per_can || 0)
    setForm({ delivered: order.quantity, empty_collected: 0, payment_received: calcAmount, payment_mode: 'cash' })
    setModal(true)
  }

  async function saveDelivery() {
    if (!selectedOrder) return
    setSaving(true)
    try {
      const c = selectedOrder.customer
      const calcAmount = +form.delivered * (c?.price_per_can || 0)
      const balanceAmount = calcAmount - +form.payment_received

      const { error } = await supabase.from('deliveries').insert({
        trip_id: selectedTrip.id,
        customer_id: selectedOrder.customer_id,
        order_id: selectedOrder.id,
        customer_name: selectedOrder.customer_name,
        delivered: +form.delivered,
        empty_collected: +form.empty_collected,
        payment_received: +form.payment_received,
        payment_mode: form.payment_mode,
        balance_amount: balanceAmount,
        date: today
      })
      if (error) { toast.error('Error: ' + error.message); setSaving(false); return }

      // Update order status
      await supabase.from('orders').update({ status: 'delivered' }).eq('id', selectedOrder.id)

      // Update customer balance
      if (c) {
        const newEmpty = (c.empty_balance || 0) + (+form.empty_collected) - (+form.delivered)
        const newDue = (c.due_amount || 0) + balanceAmount
        await supabase.from('customers').update({ empty_balance: newEmpty, due_amount: newDue }).eq('id', c.id)
      }

      if (balanceAmount > 0) toast.success(`✅ Delivered! ₹${balanceAmount} added to due`)
      else toast.success('✅ Delivery recorded!')

      setModal(false)
      setSaving(false)
      await loadTripOrders(selectedTrip)
    } catch (e) {
      toast.error('Something went wrong')
      setSaving(false)
    }
  }

  const deliveredOrderIds = new Set(deliveries.map(d => d.order_id))
  const pendingOrders = orders.filter(o => !deliveredOrderIds.has(o.id) && o.status !== 'cancelled')
  const completedOrders = orders.filter(o => deliveredOrderIds.has(o.id))
  const totalCash = deliveries.reduce((s, d) => s + (d.payment_received || 0), 0)
  const totalDelivered = deliveries.reduce((s, d) => s + (d.delivered || 0), 0)
  const totalEmpties = deliveries.reduce((s, d) => s + (d.empty_collected || 0), 0)
  const totalLoaded = trips.reduce((s, t) => s + (t.loaded_cans || 0), 0)
  const calcAmt = selectedOrder ? +form.delivered * (selectedOrder.customer?.price_per_can || 0) : 0
  const shortfall = calcAmt - +form.payment_received

  if (loading && !selectedTrip) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0369a1, #0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'white', textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>💧</div>
        <div style={{ fontFamily: "'Baloo 2'", fontSize: 20, marginTop: 8 }}>Loading...</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0369a1, #0ea5e9)', padding: '16px 20px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: "'Baloo 2'", fontSize: 20, fontWeight: 700 }}>💧 SMS Water</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>👤 {deliveryBoyName} • {today}</div>
          </div>
          <button onClick={async () => { await logout(); navigate('/login') }}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ padding: 16 }}>

        {/* TRIPS TAB */}
        {activeTab === 'trips' && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Today's Trips</h2>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>{today} • {trips.length} trip{trips.length !== 1 ? 's' : ''} assigned</p>

            {trips.length === 0 ? (
              <div className="empty-state">
                <div className="icon">🚚</div>
                <p>No trips assigned today</p>
                <span>Ask admin to create and assign a trip</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {trips.map(t => (
                  <div key={t.id} className="card" style={{ borderLeft: `4px solid ${t.status === 'completed' ? 'var(--green)' : t.status === 'in_progress' ? 'var(--sky)' : 'var(--orange)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 17 }}>
                          {t.vehicle?.includes('4') ? '🚛' : t.vehicle?.includes('3') ? '🛺' : '🏍️'} Trip #{t.trip_number}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>📍 {t.route}</div>
                        <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>🚗 {t.vehicle}</div>
                        {t.notes && <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>📝 {t.notes}</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ background: 'var(--sky-light)', color: 'var(--ocean)', fontWeight: 800, fontSize: 18, padding: '6px 14px', borderRadius: 8, marginBottom: 8 }}>
                          {t.loaded_cans} cans
                        </div>
                        <span className={`badge ${t.status === 'completed' ? 'badge-green' : t.status === 'in_progress' ? 'badge-blue' : 'badge-orange'}`}>
                          {t.status || 'pending'}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => selectTrip(t)} className="btn btn-primary btn-full btn-sm" style={{ marginTop: 12 }}>
                      {t.status === 'completed' ? '👁 View Deliveries' : '🚀 Start Deliveries →'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* DELIVERIES TAB */}
        {activeTab === 'deliveries' && selectedTrip && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Trip #{selectedTrip.trip_number} — {selectedTrip.route}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{selectedTrip.loaded_cans} cans loaded • {selectedTrip.vehicle}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedTrip(null); setActiveTab('trips') }}>← Back</button>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Pending', value: pendingOrders.length, color: 'var(--orange)' },
                { label: 'Done', value: completedOrders.length, color: 'var(--green)' },
                { label: 'Cash', value: `₹${totalCash}`, color: 'var(--sky)' },
              ].map(s => (
                <div key={s.label} style={{ background: 'white', borderRadius: 10, padding: 12, textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: "'Baloo 2'" }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 700 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {loading ? (
              <div className="loading"><div className="spinner" />Loading orders...</div>
            ) : (
              <>
                {/* Pending */}
                {pendingOrders.length > 0 && (
                  <>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--orange)', marginBottom: 8 }}>⏳ PENDING ({pendingOrders.length})</h3>
                    <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
                      {pendingOrders.map(o => {
                        const c = customers.find(x => x.id === o.customer_id)
                        return (
                          <div key={o.id} style={{ background: 'white', borderRadius: 12, padding: 14, boxShadow: 'var(--shadow-sm)', borderLeft: '4px solid var(--orange)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 800, fontSize: 15 }}>{o.customer_name}</div>
                                {c?.address && <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>📍 {c.address}</div>}
                                {c?.primary_phone && (
                                  <a href={`tel:${c.primary_phone}`} style={{ fontSize: 12, color: 'var(--sky)', marginTop: 2, display: 'block', fontWeight: 700 }}>
                                    📞 {c.primary_phone}
                                  </a>
                                )}
                                {o.notes && <div style={{ fontSize: 12, color: 'var(--sky-dark)', marginTop: 2 }}>📝 {o.notes}</div>}
                                {c?.due_amount > 0 && (
                                  <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700, marginTop: 4 }}>⚠️ Due: ₹{c.due_amount}</div>
                                )}
                              </div>
                              <div style={{ textAlign: 'right', marginLeft: 10 }}>
                                <span className="badge badge-orange">{o.quantity} cans</span>
                                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>₹{o.quantity * (c?.price_per_can || 0)}</div>
                              </div>
                            </div>
                            <button className="btn btn-success btn-full btn-sm" style={{ marginTop: 10 }} onClick={() => openDeliver(o)}>
                              ✅ Mark Delivered
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {/* Completed */}
                {completedOrders.length > 0 && (
                  <>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)', marginBottom: 8 }}>✅ COMPLETED ({completedOrders.length})</h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {completedOrders.map(o => {
                        const del = deliveries.find(d => d.order_id === o.id)
                        return (
                          <div key={o.id} style={{ background: 'white', borderRadius: 12, padding: '12px 14px', boxShadow: 'var(--shadow-sm)', borderLeft: '4px solid var(--green)', opacity: 0.85 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontWeight: 700 }}>{o.customer_name}</div>
                                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                                  {del?.delivered} cans • ₹{del?.payment_received} paid
                                  {del?.balance_amount > 0 && <span style={{ color: 'var(--red)' }}> • ₹{del.balance_amount} due</span>}
                                </div>
                              </div>
                              <span className="badge badge-green">{o.quantity} ✓</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {pendingOrders.length === 0 && completedOrders.length === 0 && (
                  <div className="empty-state"><div className="icon">📋</div><p>No orders for this trip's route</p></div>
                )}
              </>
            )}
          </>
        )}

        {/* SUMMARY TAB */}
        {activeTab === 'summary' && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>📊 Today's Summary</h2>
            <div className="stat-grid" style={{ marginBottom: 16 }}>
              {[
                { label: 'Total Trips', value: trips.length, color: 'var(--sky)' },
                { label: 'Cans Loaded', value: totalLoaded, color: 'var(--ocean)' },
                { label: 'Cans Delivered', value: totalDelivered, color: 'var(--green)' },
                { label: 'Cash Collected', value: `₹${totalCash}`, color: 'var(--orange)' },
                { label: 'Empties Collected', value: totalEmpties, color: 'var(--sky)' },
                { label: 'Remaining', value: totalLoaded - totalDelivered, color: totalLoaded - totalDelivered > 0 ? 'var(--orange)' : 'var(--green)' },
              ].map(s => (
                <div key={s.label} className="stat-card" style={{ borderTop: `4px solid ${s.color}` }}>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value" style={{ color: s.color, fontSize: 24 }}>{s.value}</div>
                </div>
              ))}
            </div>

            {trips.map(t => {
              const tripDels = deliveries.filter(d => d.trip_id === t.id)
              const tripCash = tripDels.reduce((s, d) => s + (d.payment_received || 0), 0)
              const tripDelivered = tripDels.reduce((s, d) => s + (d.delivered || 0), 0)
              return (
                <div key={t.id} className="card" style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Trip #{t.trip_number} — {t.route}</div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
                    <span>📦 Loaded: <strong>{t.loaded_cans}</strong></span>
                    <span>✅ Delivered: <strong style={{ color: 'var(--green)' }}>{tripDelivered}</strong></span>
                    <span>🔄 Remaining: <strong style={{ color: t.loaded_cans - tripDelivered > 0 ? 'var(--orange)' : 'var(--green)' }}>{t.loaded_cans - tripDelivered}</strong></span>
                    <span>💰 Cash: <strong style={{ color: 'var(--orange)' }}>₹{tripCash}</strong></span>
                  </div>
                  <div style={{ background: 'var(--gray-100)', borderRadius: 99, height: 8, marginTop: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--green)', borderRadius: 99, width: `${t.loaded_cans > 0 ? Math.min((tripDelivered / t.loaded_cans) * 100, 100) : 0}%`, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid var(--gray-200)', display: 'flex', boxShadow: '0 -4px 16px rgba(0,0,0,0.08)' }}>
        {[
          { tab: 'trips', icon: '🚚', label: 'Trips' },
          { tab: 'deliveries', icon: '📦', label: 'Deliver', disabled: !selectedTrip },
          { tab: 'summary', icon: '📊', label: 'Summary' },
        ].map(t => (
          <button key={t.tab} onClick={() => !t.disabled && setActiveTab(t.tab)}
            style={{ flex: 1, padding: '10px 0 12px', border: 'none', background: 'none', cursor: t.disabled ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              color: t.disabled ? 'var(--gray-300)' : activeTab === t.tab ? 'var(--sky)' : 'var(--gray-500)',
              borderTop: activeTab === t.tab ? '3px solid var(--sky)' : '3px solid transparent', opacity: t.disabled ? 0.5 : 1 }}>
            <span style={{ fontSize: 22 }}>{t.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700 }}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Delivery Modal */}
      {modal && selectedOrder && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">📦 {selectedOrder.customer_name}</h2>

            {selectedOrder.customer && (
              <div style={{ background: 'var(--sky-pale)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                {selectedOrder.customer.address && <div>📍 {selectedOrder.customer.address}</div>}
                {selectedOrder.customer.primary_phone && <div style={{ marginTop: 4 }}>📞 {selectedOrder.customer.primary_phone}</div>}
                <div style={{ marginTop: 4, fontWeight: 700, color: 'var(--ocean)' }}>💰 Rate: ₹{selectedOrder.customer.price_per_can}/can</div>
                {selectedOrder.customer.due_amount > 0 && (
                  <div style={{ marginTop: 4, fontWeight: 700, color: 'var(--red)' }}>⚠️ Existing due: ₹{selectedOrder.customer.due_amount}</div>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Cans Delivered</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" onClick={() => setForm(p => ({ ...p, delivered: Math.max(0, p.delivered - 1), payment_received: Math.max(0, p.delivered - 1) * (selectedOrder.customer?.price_per_can || 0) }))}
                  style={{ width: 36, height: 36, borderRadius: 8, border: '2px solid var(--gray-200)', background: 'white', fontSize: 20, fontWeight: 800, cursor: 'pointer' }}>−</button>
                <input className="form-input" type="number" min={0} value={form.delivered}
                  onChange={e => { const v = +e.target.value; setForm(p => ({ ...p, delivered: v, payment_received: v * (selectedOrder.customer?.price_per_can || 0) })) }}
                  style={{ textAlign: 'center', fontWeight: 800, fontSize: 18, flex: 1 }} />
                <button type="button" onClick={() => setForm(p => ({ ...p, delivered: p.delivered + 1, payment_received: (p.delivered + 1) * (selectedOrder.customer?.price_per_can || 0) }))}
                  style={{ width: 36, height: 36, borderRadius: 8, border: '2px solid var(--sky)', background: 'var(--sky)', color: 'white', fontSize: 20, fontWeight: 800, cursor: 'pointer' }}>+</button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Empty Cans Collected</label>
              <input className="form-input" type="number" min={0} value={form.empty_collected}
                onChange={e => setForm(p => ({ ...p, empty_collected: +e.target.value }))} />
            </div>

            {/* Amount box */}
            {form.delivered > 0 && (
              <div style={{ background: shortfall === 0 ? '#f0fdf4' : shortfall > 0 ? '#fff7ed' : '#eff6ff', borderRadius: 10, padding: '10px 14px', marginBottom: 12, border: `1px solid ${shortfall === 0 ? '#bbf7d0' : shortfall > 0 ? '#fed7aa' : '#bfdbfe'}` }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>📋 {form.delivered} × ₹{selectedOrder.customer?.price_per_can} = <span style={{ color: 'var(--ocean)' }}>₹{calcAmt}</span></div>
                {shortfall > 0 && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 4 }}>⚠️ Short by ₹{shortfall} — will be added to due</div>}
                {shortfall === 0 && <div style={{ color: 'var(--green)', fontSize: 13, marginTop: 4 }}>✅ Full payment</div>}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <div className="form-group">
                <label className="form-label">Cash Received (₹)</label>
                <input className="form-input" type="number" min={0} value={form.payment_received}
                  onChange={e => setForm(p => ({ ...p, payment_received: +e.target.value }))}
                  style={{ borderColor: shortfall > 0 ? 'var(--orange)' : 'var(--green)', fontWeight: 700, fontSize: 16 }} />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Mode</label>
                <select className="form-select" value={form.payment_mode} onChange={e => setForm(p => ({ ...p, payment_mode: e.target.value }))}>
                  <option value="cash">💵 Cash</option>
                  <option value="upi">📱 UPI</option>
                  <option value="credit">📒 Credit</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-success" onClick={saveDelivery} disabled={saving}>
                {saving ? 'Saving...' : '✅ Confirm Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
