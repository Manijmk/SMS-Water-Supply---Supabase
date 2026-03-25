import { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'

const AREAS = ['Tondiarpet', 'New Washermanpet', 'Kaladipet', 'Tollgate', 'Thiruvotriyur']

export default function Reports() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [r, setR] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { gen() }, [date])

  const gen = async () => {
    setLoading(true)
    try {
      const [stkRes, odRes, tdRes, ddRes] = await Promise.all([
        supabase.from('truck_stock').select('*').eq('date', date).maybeSingle(),
        supabase.from('orders').select('*').eq('delivery_date', date),
        supabase.from('trips').select('*').eq('date', date),
        supabase.from('deliveries').select('*').eq('date', date),
      ])

      const stk = stkRes.data  // row or null
      const o = odRes.data || []
      const t = tdRes.data || []
      const d = ddRes.data || []

      const arrived = stk?.total_cans || 0
      const cDel = d.reduce((s, x) => s + (x.delivered || 0), 0)
      const cCash = d.reduce((s, x) => s + (x.payment_received || 0), 0)
      const cEmp = d.reduce((s, x) => s + (x.empty_collected || 0), 0)
      const cBal = d.reduce((s, x) => s + (x.balance_amount || 0), 0)
      const cLoaded = t.reduce((s, x) => s + (x.loaded_cans || 0), 0)
      const totOrd = o.length
      const delOrd = o.filter(x => x.status === 'delivered').length
      const penOrd = o.filter(x => x.status === 'pending').length
      const eff = totOrd > 0 ? Math.round((delOrd / totOrd) * 100) : 0

      const areaBreak = AREAS.map(a => {
        const ao = o.filter(x => x.area === a)
        const ad = d.filter(x => { const or2 = o.find(y => y.id === x.order_id); return or2?.area === a })
        return {
          area: a,
          orders: ao.length,
          cans: ao.reduce((s, x) => s + (x.quantity || 0), 0),
          del: ad.reduce((s, x) => s + (x.delivered || 0), 0),
          cash: ad.reduce((s, x) => s + (x.payment_received || 0), 0),
        }
      })

      const tripSum = t.map(tr => {
        const td2 = d.filter(x => x.trip_id === tr.id)
        return {
          ...tr,
          dels: td2.length,
          cansDel: td2.reduce((s, x) => s + (x.delivered || 0), 0),
          cash: td2.reduce((s, x) => s + (x.payment_received || 0), 0),
          emp: td2.reduce((s, x) => s + (x.empty_collected || 0), 0),
        }
      })

      setR({ arrived, totOrd, delOrd, penOrd, cDel, cCash, cEmp, cBal, cLoaded, eff, remaining: arrived - cDel, areaBreak, tripSum })
    } catch (err) {
      console.error('Report error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div className="page-header-left"><h1>📈 Daily Report</h1><p>{date}</p></div>
        <button className="btn btn-ghost" onClick={() => window.print()}>🖨️ Print</button>
      </div>
      <div className="page-body">
        <div className="toolbar">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Date</label>
            <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <button className="btn btn-ghost" onClick={gen}>🔄 Refresh</button>
        </div>

        {r && (
          <>
            <div className="report-block">
              <h3>📊 Overview</h3>
              <div className="stats-grid">
                <div className="stat-card sky"><div className="stat-icon">🚛</div><div className="stat-info"><div className="stat-value">{r.arrived}</div><div className="stat-label">Truck Stock</div></div></div>
                <div className="stat-card orange"><div className="stat-icon">📋</div><div className="stat-info"><div className="stat-value">{r.totOrd}</div><div className="stat-label">Total Orders</div></div></div>
                <div className="stat-card emerald"><div className="stat-icon">✅</div><div className="stat-info"><div className="stat-value">{r.delOrd}</div><div className="stat-label">Delivered</div></div></div>
                <div className="stat-card amber"><div className="stat-icon">⏳</div><div className="stat-info"><div className="stat-value">{r.penOrd}</div><div className="stat-label">Pending</div></div></div>
              </div>
            </div>

            <div className="report-block">
              <h3>🚛 Stock Tally</h3>
              <div className="card">
                <div className="card-body">
                  <div className="tally-grid">
                    <div className="tally-card"><span className="tally-icon">🚛</span><div className="tally-value">{r.arrived}</div><div className="tally-label">Arrived</div></div>
                    <div className="tally-card"><span className="tally-icon">📦</span><div className="tally-value">{r.cLoaded}</div><div className="tally-label">Loaded</div></div>
                    <div className="tally-card success"><span className="tally-icon">✅</span><div className="tally-value">{r.cDel}</div><div className="tally-label">Delivered</div></div>
                    <div className={`tally-card ${r.remaining < 0 ? 'danger' : ''}`}><span className="tally-icon">📊</span><div className="tally-value">{r.remaining}</div><div className="tally-label">Remaining</div></div>
                    <div className="tally-card"><span className="tally-icon">♻️</span><div className="tally-value">{r.cEmp}</div><div className="tally-label">Empties</div></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="report-block">
              <h3>💰 Financial</h3>
              <div className="stats-grid">
                <div className="stat-card emerald"><div className="stat-icon">💰</div><div className="stat-info"><div className="stat-value">₹{r.cCash.toLocaleString()}</div><div className="stat-label">Collected</div></div></div>
                <div className="stat-card rose"><div className="stat-icon">📕</div><div className="stat-info"><div className="stat-value">₹{r.cBal.toLocaleString()}</div><div className="stat-label">New Credit</div></div></div>
                <div className="stat-card violet"><div className="stat-icon">📊</div><div className="stat-info"><div className="stat-value">{r.eff}%</div><div className="stat-label">Efficiency</div></div></div>
              </div>
            </div>

            <div className="report-block">
              <h3>📍 Area Breakdown</h3>
              <div className="card">
                <div className="table-wrapper">
                  <table>
                    <thead><tr><th>Area</th><th>Orders</th><th>Cans</th><th>Delivered</th><th>Cash</th></tr></thead>
                    <tbody>
                      {r.areaBreak.map(a => (
                        <tr key={a.area}>
                          <td><strong>{a.area}</strong></td><td>{a.orders}</td><td>{a.cans}</td><td>{a.del}</td><td>₹{a.cash.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="report-block">
              <h3>🚛 Trip Summary</h3>
              <div className="card">
                <div className="table-wrapper">
                  <table>
                    <thead><tr><th>Trip</th><th>Driver</th><th>Vehicle</th><th>Loaded</th><th>Delivered</th><th>Cash</th><th>Empties</th><th>Status</th></tr></thead>
                    <tbody>
                      {r.tripSum.length === 0 ? (
                        <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--n-400)' }}>No trips</td></tr>
                      ) : r.tripSum.map(t => (
                        <tr key={t.id}>
                          <td>#{t.trip_number}</td><td><strong>{t.delivery_boy}</strong></td><td>{t.vehicle}</td>
                          <td>{t.loaded_cans}</td><td>{t.cansDel}</td><td>₹{t.cash.toLocaleString()}</td><td>{t.emp}</td>
                          <td><span className={`badge badge-${t.status}`}><span className="dot" />{t.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}