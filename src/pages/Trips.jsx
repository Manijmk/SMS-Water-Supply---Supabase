import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

const VEHICLES = ['2-Wheeler', '3-Wheeler (Auto)', '4-Wheeler (Tempo)']
const AREAS = ['Tondiarpet', 'New Washermanpet', 'Kaladipet', 'Tollgate', 'Thiruvotriyur']
const today = new Date().toISOString().split('T')[0]
const EMPTY = { vehicle: VEHICLES[0], route: AREAS[0], delivery_boy: '', loaded_cans: '', trip_number: 1, date: today, notes: '' }

export default function Trips() {
  const [trips, setTrips] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [dateFilter, setDateFilter] = useState(today)
  const [saving, setSaving] = useState(false)

  const loadTrips = useCallback(async () => {
    const { data } = await supabase.from('trips').select('*').eq('date', dateFilter).order('trip_number')
    setTrips(data || [])
    setLoading(false)
  }, [dateFilter])

  const loadDeliveries = useCallback(async () => {
    const { data } = await supabase.from('deliveries').select('*').eq('date', dateFilter)
    setDeliveries(data || [])
  }, [dateFilter])

  useEffect(() => {
    setLoading(true)
    loadTrips()
    loadDeliveries()

    const channel = supabase
      .channel(`trips-${dateFilter}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setTrips(prev => [...prev, payload.new].sort((a, b) => a.trip_number - b.trip_number))
        } else if (payload.eventType === 'UPDATE') {
          setTrips(prev => prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t))
        } else if (payload.eventType === 'DELETE') {
          setTrips(prev => prev.filter(t => t.id !== payload.old.id))
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setDeliveries(prev => [...prev, payload.new])
        } else if (payload.eventType === 'UPDATE') {
          setDeliveries(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d))
        } else if (payload.eventType === 'DELETE') {
          setDeliveries(prev => prev.filter(d => d.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [dateFilter, loadTrips, loadDeliveries])

  function openAdd() { setForm({ ...EMPTY, date: dateFilter }); setEditing(null); setModal(true) }
  function openEdit(t) { setForm({ ...t }); setEditing(t.id); setModal(true) }

  async function save() {
    if (!form.delivery_boy || !form.loaded_cans) return toast.error('Fill delivery boy and loaded cans')
    setSaving(true)
    const data = { ...form, loaded_cans: +form.loaded_cans, trip_number: +form.trip_number }
    delete data.id
    const { error } = editing
      ? await supabase.from('trips').update(data).eq('id', editing)
      : await supabase.from('trips').insert({ ...data, status: 'pending' })
    if (error) toast.error('Error: ' + error.message)
    else { toast.success(editing ? 'Trip updated!' : 'Trip created!'); setModal(false) }
    setSaving(false)
  }

  async function del(id) {
    if (!confirm('Delete this trip?')) return
    setTrips(prev => prev.filter(t => t.id !== id))
    const { error } = await supabase.from('trips').delete().eq('id', id)
    if (error) { toast.error('Error'); loadTrips() }
    else toast.success('Deleted')
  }

  async function updateStatus(id, status) {
    // Optimistic instant update
    setTrips(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    const { error } = await supabase.from('trips').update({ status }).eq('id', id)
    if (error) { toast.error('Error'); loadTrips() }
    else toast.success('Status updated!')
  }

  function getTripStats(tripId) {
    const td = deliveries.filter(d => d.trip_id === tripId)
    return {
      delivered: td.reduce((s, d) => s + (d.delivered || 0), 0),
      empties: td.reduce((s, d) => s + (d.empty_collected || 0), 0),
      cash: td.reduce((s, d) => s + (d.payment_received || 0), 0),
    }
  }

  const totalLoaded = trips.reduce((s, t) => s + (t.loaded_cans || 0), 0)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  if (loading) return <div className="loading"><div className="spinner" />Loading trips...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Trips 🚚</h1>
          <p className="page-subtitle">{trips.length} trips • {totalLoaded} cans loaded <span style={{ color: 'var(--green)', fontWeight: 700 }}>● live</span></p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Create Trip</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '2px solid var(--gray-200)', borderRadius: 8, padding: '8px 14px' }}>
          <span>📅</span>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            style={{ border: 'none', fontSize: 14, fontFamily: 'Nunito', outline: 'none' }} />
        </div>
      </div>

      {trips.length === 0 ? (
        <div className="empty-state"><div className="icon">🚚</div><p>No trips for this date</p></div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {trips.map(t => {
            const stats = getTripStats(t.id)
            const progress = t.loaded_cans > 0 ? Math.round((stats.delivered / t.loaded_cans) * 100) : 0
            return (
              <div key={t.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div style={{ fontSize: 32 }}>{t.vehicle?.includes('4') ? '🚛' : t.vehicle?.includes('3') ? '🛺' : '🏍️'}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>Trip #{t.trip_number} — {t.vehicle}</div>
                      <div style={{ color: 'var(--gray-500)', fontSize: 13, marginTop: 2 }}>📍 {t.route} &nbsp;•&nbsp; 👤 {t.delivery_boy}</div>
                      {t.notes && <div style={{ color: 'var(--gray-500)', fontSize: 12, marginTop: 4 }}>📝 {t.notes}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <div style={{ background: 'var(--sky-light)', color: 'var(--ocean)', fontWeight: 800, fontSize: 18, padding: '6px 16px', borderRadius: 8 }}>{t.loaded_cans} cans</div>
                    <select value={t.status || 'pending'} onChange={e => updateStatus(t.id, e.target.value)}
                      style={{ border: '2px solid var(--gray-200)', borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        color: t.status === 'completed' ? '#166534' : t.status === 'in_progress' ? '#1e40af' : '#9a3412' }}>
                      <option value="pending">⏳ Pending</option>
                      <option value="in_progress">🚚 In Progress</option>
                      <option value="completed">✅ Completed</option>
                    </select>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}>✏️ Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(t.id)}>🗑️</button>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--gray-100)' }}>
                  <div style={{ display: 'flex', gap: 20, fontSize: 13, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span>✅ Delivered: <strong style={{ color: 'var(--green)' }}>{stats.delivered}</strong></span>
                    <span>📦 Empties: <strong style={{ color: 'var(--sky)' }}>{stats.empties}</strong></span>
                    <span>💰 Cash: <strong style={{ color: 'var(--orange)' }}>₹{stats.cash}</strong></span>
                    <span>🔄 Remaining: <strong style={{ color: t.loaded_cans - stats.delivered > 0 ? 'var(--orange)' : 'var(--green)' }}>{t.loaded_cans - stats.delivered}</strong></span>
                  </div>
                  {t.loaded_cans > 0 && (
                    <div style={{ background: 'var(--gray-100)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 99, background: progress >= 100 ? 'var(--green)' : 'var(--sky)', width: `${Math.min(progress, 100)}%`, transition: 'width 0.4s ease' }} />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <h2 className="modal-title">{editing ? 'Edit Trip' : 'Create Trip 🚚'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <div className="form-group">
                <label className="form-label">Vehicle</label>
                <select className="form-select" value={form.vehicle} onChange={e => f('vehicle', e.target.value)}>
                  {VEHICLES.map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Trip #</label>
                <input className="form-input" type="number" min={1} value={form.trip_number} onChange={e => f('trip_number', e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Delivery Boy *</label>
                <input className="form-input" value={form.delivery_boy} onChange={e => f('delivery_boy', e.target.value)} placeholder="Name of delivery boy" />
              </div>
              <div className="form-group">
                <label className="form-label">Route / Area</label>
                <select className="form-select" value={form.route} onChange={e => f('route', e.target.value)}>
                  {AREAS.map(a => <option key={a}>{a}</option>)}
                  <option value="Mixed">Mixed</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Loaded Cans *</label>
                <input className="form-input" type="number" min={1} value={form.loaded_cans} onChange={e => f('loaded_cans', e.target.value)} placeholder="e.g. 80" />
              </div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={form.date} onChange={e => f('date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-input" value={form.notes || ''} onChange={e => f('notes', e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : editing ? '✅ Update' : '🚚 Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
