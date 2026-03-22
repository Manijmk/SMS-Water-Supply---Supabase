import { useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]

export default function DeliveryBoy() {
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
  const { logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    async function init() {
      const [{ data: t }, { data: c }] = await Promise.all([
        supabase.from('trips').select('*').eq('date', today).order('trip_number'),
        supabase.from('customers').select('*')
      ])
      setTrips(t || [])
      setCustomers(c || [])
      setLoading(false)
    }
    init()
  }, [])

  async function selectTrip(trip) {
    setSelectedTrip(trip)
    setLoading(true)
    const [{ data: o }, { data: d }] = await Promise.all([
      supabase.from('orders').select('*').eq('delivery_date', today),
      supabase.from('deliveries').select('*').eq('date', today).eq('trip_id', trip.id)
    ])
    setOrders((o || []).filter(order => order.area === trip.route || trip.route === 'Mixed'))
    setDeliveries(d || [])
    setLoading(false)

    // Realtime for this trip's deliveries
    const channel = supabase.channel('delivery-boy')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, async () => {
        const { data } = await supabase.from('deliveries').select('*').eq('date', today).eq('trip_id', trip.id)
        setDeliveries(data || [])
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
        const { data } = await supabase.from('orders').select('*').eq('delivery_date', today)
        setOrders((data || []).filter(order => order.area === trip.route || trip.route === 'Mixed'))
      })
      .subscribe()
  }

  function openDeliver(order) {
    const c = customers.find(x => x.id === order.customer_id)
    setSelectedOrder({ ...order, customer: c })
    setForm({ delivered: order.quantity, empty_collected: 0, payment_received: order.quantity * (c?.price_per_can || 40), payment_mode: 'cash' })
    setModal(true)
  }

  async function saveDelivery() {
    if (!selectedOrder) return
    setSaving(true)
    const { error } = await supabase.from('deliveries').insert({
      trip_id: selectedTrip.id,
      customer_id: selectedOrder.customer_id,
      order_id: selectedOrder.id,
      customer_name: selectedOrder.customer_name,
      delivered: +form.delivered,
      empty_collected: +form.empty_collected,
      payment_received: +form.payment_received,
      payment_mode: form.payment_mode,
      date: today
    })
    if (error) { toast.error('Error: ' + error.message); setSaving(false); return }
    await supabase.from('orders').update({ status: 'delivered' }).eq('id', selectedOrder.id)
    if (selectedOrder.customer) {
      const newBal = (selectedOrder.customer.empty_balance || 0) + (+form.empty_collected) - (+form.delivered)
      await supabase.from('customers').update({ empty_balance: newBal }).eq('id', selectedOrder.customer_id)
    }
    toast.success('✅ Delivery recorded!')
    setModal(false)
    setSaving(false)
    await selectTrip(selectedTrip)
  }

  const deliveredOrderIds = new Set(deliveries.map(d => d.order_id))
  const pendingOrders = orders.filter(o => !deliveredOrderIds.has(o.id))
  const completedOrders = orders.filter(o => deliveredOrderIds.has(o.id))
  const totalCash = deliveries.reduce((s, d) => s + (d.payment_received || 0), 0)

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--sky)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'white', textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>💧</div>
        <div style={{ fontFamily: "'Baloo 2'", fontSize: 18, marginTop: 8 }}>Loading...</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)' }}>
      <div style={{ background: 'linear-gradient(135deg, #0369a1, #0ea5e9)', padding: '16px 20px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: "'Baloo 2'", fontSize: 20, fontWeight: 700 }}>💧 SMS Water</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Delivery Panel — {today}</div>
          </div>
          <button onClick={async () => { await logout(); navigate('/login') }}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {!selectedTrip ? (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Select Your Trip</h2>
            {trips.length === 0 ? (
              <div className="empty-state"><div className="icon">🚚</div><p>No trips assigned today</p></div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {trips.map(t => (
                  <button key={t.id} onClick={() => selectTrip(t)}
                    style={{ background: 'white', border: '2px solid var(--sky)', borderRadius: 14, padding: 16, textAlign: 'left', cursor: 'pointer', width: '100%', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>Trip #{t.trip_number}</div>
                    <div style={{ color: 'var(--gray-500)', fontSize: 13, marginTop: 4 }}>📍 {t.route} &nbsp;•&nbsp; 🚗 {t.vehicle}</div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                      <span className="badge badge-blue">{t.loaded_cans} cans</span>
                      <span className={`badge ${t.status === 'completed' ? 'badge-green' : 'badge-orange'}`}>{t.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Trip #{selectedTrip.trip_number} — {selectedTrip.route}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{selectedTrip.loaded_cans} cans loaded</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedTrip(null)}>← Back</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Pending', value: pendingOrders.length, color: 'var(--orange)' },
                { label: 'Done', value: completedOrders.length, color: 'var(--green)' },
                { label: 'Cash', value: `₹${totalCash}`, color: 'var(--sky)' }
              ].map(s => (
                <div key={s.label} style={{ background: 'white', borderRadius: 10, padding: 12, textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: "'Baloo 2'" }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 700 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {pendingOrders.length > 0 && (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--orange)', marginBottom: 8 }}>⏳ PENDING ({pendingOrders.length})</h3>
                <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
                  {pendingOrders.map(o => (
                    <div key={o.id} style={{ background: 'white', borderRadius: 12, padding: 14, boxShadow: 'var(--shadow-sm)', borderLeft: '4px solid var(--orange)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 800 }}>{o.customer_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>{customers.find(c => c.id === o.customer_id)?.address || ''}</div>
                          {o.notes && <div style={{ fontSize: 12, color: 'var(--sky-dark)', marginTop: 2 }}>📝 {o.notes}</div>}
                        </div>
                        <span className="badge badge-orange">{o.quantity} cans</span>
                      </div>
                      <button className="btn btn-success btn-full btn-sm" style={{ marginTop: 10 }} onClick={() => openDeliver(o)}>✅ Mark Delivered</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {completedOrders.length > 0 && (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)', marginBottom: 8 }}>✅ COMPLETED ({completedOrders.length})</h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  {completedOrders.map(o => (
                    <div key={o.id} style={{ background: 'white', borderRadius: 12, padding: 12, boxShadow: 'var(--shadow-sm)', borderLeft: '4px solid var(--green)', opacity: 0.7 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 700 }}>{o.customer_name}</div>
                        <span className="badge badge-green">{o.quantity} ✓</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {modal && selectedOrder && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">📦 Deliver to {selectedOrder.customer_name}</h2>
            <div style={{ background: 'var(--sky-pale)', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 13, color: 'var(--ocean)' }}>
              📍 {selectedOrder.customer?.address || 'No address'}<br />
              💰 Rate: ₹{selectedOrder.customer?.price_per_can}/can
            </div>
            <div className="form-group">
              <label className="form-label">Cans Delivered</label>
              <input className="form-input" type="number" min={0} value={form.delivered} onChange={e => setForm(p => ({ ...p, delivered: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Empty Cans Collected</label>
              <input className="form-input" type="number" min={0} value={form.empty_collected} onChange={e => setForm(p => ({ ...p, empty_collected: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Cash Received (₹)</label>
              <input className="form-input" type="number" min={0} value={form.payment_received} onChange={e => setForm(p => ({ ...p, payment_received: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Mode</label>
              <select className="form-select" value={form.payment_mode} onChange={e => setForm(p => ({ ...p, payment_mode: e.target.value }))}>
                <option value="cash">💵 Cash</option>
                <option value="upi">📱 UPI</option>
                <option value="credit">📒 Credit</option>
              </select>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-success" onClick={saveDelivery} disabled={saving}>{saving ? 'Saving...' : '✅ Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
