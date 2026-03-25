import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

const AREAS = ['Tondiarpet', 'New Washermanpet', 'Kaladipet', 'Tollgate', 'Thiruvotriyur']
const VEHICLES = ['2-Wheeler', '3-Wheeler (Auto)', '4-Wheeler (Tempo)']
const VIcon = v => v === '2-Wheeler' ? '🏍️' : v?.includes('3') ? '🛺' : '🚛'

export default function Trips() {
  const today = new Date().toISOString().split('T')[0]
  const [trips, setTrips] = useState([])
  const [dbs, setDbs] = useState([])
  const [date, setDate] = useState(today)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ vehicle: '3-Wheeler (Auto)', trip_number: 1, delivery_boy: '', route: '', loaded_cans: 0, notes: '' })

  const dateRef = useRef(date)
  const fetchRef = useRef(null)

  useEffect(() => { dateRef.current = date }, [date])

  const fetchTrips = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('date', dateRef.current)
        .order('trip_number')
      if (error) throw error

      // Enrich with delivery stats
      const enriched = await Promise.all(
        (data || []).map(async t => {
          const { data: d } = await supabase
            .from('deliveries')
            .select('delivered, payment_received, empty_collected')
            .eq('trip_id', t.id)
          return {
            ...t,
            totalDel: d?.reduce((s, x) => s + (x.delivered || 0), 0) || 0,
            totalCash: d?.reduce((s, x) => s + (x.payment_received || 0), 0) || 0,
            totalEmp: d?.reduce((s, x) => s + (x.empty_collected || 0), 0) || 0,
            count: d?.length || 0,
          }
        })
      )
      setTrips(enriched)
    } catch (err) {
      console.error('Fetch trips error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRef.current = fetchTrips }, [fetchTrips])

  const fetchDBs = async () => {
    const { data } = await supabase.from('delivery_boys').select('*').eq('is_active', true)
    setDbs(data || [])
  }

  useEffect(() => {
    fetchTrips()
    fetchDBs()

    const channel = supabase
      .channel('trips-rt-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => fetchRef.current?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => fetchRef.current?.())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => { fetchTrips() }, [date])

  const add = async () => {
    if (!form.delivery_boy) return toast.error('Select delivery boy')
    setSaving(true)
    try {
      const { error } = await supabase.from('trips').insert({
        vehicle: form.vehicle,
        trip_number: parseInt(form.trip_number) || 1,
        delivery_boy: form.delivery_boy,
        route: form.route,
        loaded_cans: parseInt(form.loaded_cans) || 0,
        date: dateRef.current,
        status: 'pending',
        notes: form.notes,
      })
      if (error) throw error
      toast.success('Trip created!')
      setShowModal(false)
      setForm({ vehicle: '3-Wheeler (Auto)', trip_number: 1, delivery_boy: '', route: '', loaded_cans: 0, notes: '' })
    } catch (e) {
      toast.error('Failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (id, s) => {
    try {
      const { error } = await supabase.from('trips').update({ status: s }).eq('id', id)
      if (error) throw error
      toast.success(`Trip → ${s}`)
    } catch (e) {
      toast.error('Failed: ' + e.message)
    }
  }

  const del = async id => {
    if (!confirm('Delete trip?')) return
    try {
      const { error } = await supabase.from('trips').delete().eq('id', id)
      if (error) throw error
      toast.success('Deleted')
    } catch (e) {
      toast.error('Failed: ' + e.message)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>🚛 Trips</h1>
          <p>{trips.length} trips for {date}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Trip</button>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Date</label>
            <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        {trips.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🚛</span>
            <h3>No trips created</h3>
            <p>Create a trip to dispatch deliveries</p>
          </div>
        ) : (
          <div className="trip-grid">
            {trips.map(t => (
              <div key={t.id} className="card" style={{ marginBottom: 0 }}>
                <div className="card-header">
                  <h3>{VIcon(t.vehicle)} Trip #{t.trip_number}</h3>
                  <span className={`badge badge-${t.status}`}><span className="dot" />{t.status}</span>
                </div>
                <div className="card-body compact">
                  <div className="info-row"><span className="info-label">Delivery Boy</span><span className="info-value">{t.delivery_boy}</span></div>
                  <div className="info-row"><span className="info-label">Vehicle</span><span className="info-value">{t.vehicle}</span></div>
                  <div className="info-row"><span className="info-label">Route</span><span className="info-value">{t.route || '—'}</span></div>
                  <div className="info-row"><span className="info-label">Loaded</span><span className="info-value">{t.loaded_cans} cans</span></div>
                  <div className="info-row"><span className="info-label">Delivered</span><span className="info-value highlight">{t.totalDel} cans</span></div>
                  <div className="info-row"><span className="info-label">Cash</span><span className="info-value">₹{t.totalCash?.toLocaleString()}</span></div>
                  <div className="info-row"><span className="info-label">Empties</span><span className="info-value">{t.totalEmp}</span></div>
                  <div className="card-actions">
                    {t.status === 'pending' && <button className="btn btn-sm btn-primary" onClick={() => updateStatus(t.id, 'in_progress')}>▶ Start</button>}
                    {t.status === 'in_progress' && <button className="btn btn-sm btn-success" onClick={() => updateStatus(t.id, 'completed')}>✓ Complete</button>}
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--rose-500)', marginLeft: 'auto' }} onClick={() => del(t.id)}>🗑️</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New Trip</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Vehicle</label>
                  <select className="form-control" value={form.vehicle} onChange={e => setForm({ ...form, vehicle: e.target.value })}>
                    {VEHICLES.map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Trip #</label>
                  <input type="number" className="form-control" value={form.trip_number} onChange={e => setForm({ ...form, trip_number: e.target.value })} min={1} />
                </div>
              </div>
              <div className="form-group">
                <label>Delivery Boy *</label>
                <select className="form-control" value={form.delivery_boy} onChange={e => setForm({ ...form, delivery_boy: e.target.value })}>
                  <option value="">Select...</option>
                  {dbs.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Route / Area</label>
                <select className="form-control" value={form.route} onChange={e => setForm({ ...form, route: e.target.value })}>
                  <option value="">Select area...</option>
                  {AREAS.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Cans Loaded</label>
                <input type="number" className="form-control" value={form.loaded_cans} onChange={e => setForm({ ...form, loaded_cans: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea className="form-control" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={add} disabled={saving}>
                {saving ? '⏳' : 'Create Trip →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}