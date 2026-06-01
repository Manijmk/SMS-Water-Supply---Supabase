import { useState } from 'react'
import toast from 'react-hot-toast'
import { useEmptyCanAlerts, recordEmptyCollection, SEVERITY_META } from '../../hooks/useEmptyCanTracker'

const AREAS = ['All', 'Tondiarpet', 'New Washermanpet', 'Kaladipet', 'Tollgate', 'Thiruvotriyur']
const SEVERITY_RANK = { critical: 0, warning: 1, watch: 2 }

export default function EmptyCanTracker() {
  const { alerts, summary, loading, error, refresh } = useEmptyCanAlerts()
  const [search, setSearch] = useState('')
  const [area, setArea] = useState('All')
  const [severityFilter, setSeverityFilter] = useState('All')
  const [sort, setSort] = useState('severity')
  const [collectTarget, setCollectTarget] = useState(null)
  const [collectQty, setCollectQty] = useState('')
  const [collectNotes, setCollectNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const filtered = alerts
    .filter(a => {
      if (area !== 'All' && a.area !== area) return false
      if (severityFilter !== 'All' && a.severity !== severityFilter.toLowerCase()) return false
      if (search) {
        const s = search.toLowerCase()
        if (
          !a.name?.toLowerCase().includes(s) &&
          !a.phone?.includes(s) &&
          !a.area?.toLowerCase().includes(s)
        ) return false
      }
      return true
    })
    .sort((a, b) => {
      if (sort === 'severity') {
        return (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || b.empty_balance - a.empty_balance
      }
      if (sort === 'cans') return b.empty_balance - a.empty_balance
      if (sort === 'days') return b.days_outstanding - a.days_outstanding
      return 0
    })

  const openCollect = (alert) => {
    setCollectTarget(alert)
    setCollectQty(String(alert.empty_balance))
    setCollectNotes('')
  }

  const submitCollect = async () => {
    const qty = parseInt(collectQty)
    if (!qty || qty <= 0) return toast.error('Enter valid quantity')
    if (qty > collectTarget.empty_balance) return toast.error(`Max is ${collectTarget.empty_balance}`)
    setSaving(true)
    try {
      await recordEmptyCollection(collectTarget.customer_id, qty, collectNotes)
      toast.success(`Recorded ${qty} empties returned by ${collectTarget.name}`)
      setCollectTarget(null)
      refresh()
    } catch (e) {
      toast.error('Failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>🪣 Empty Cans</h1>
          <p>{summary.total} customers overdue · {summary.totalCans} cans outstanding</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={refresh}>🔄 Refresh</button>
      </div>

      <div className="page-body">
        {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}>{error}</div>}

        <div className="stats-grid">
          <div className="stat-card rose">
            <div className="stat-icon">🔴</div>
            <div className="stat-info">
              <div className="stat-value">{summary.critical}</div>
              <div className="stat-label">Critical (&gt;5 days)</div>
            </div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon">🟡</div>
            <div className="stat-info">
              <div className="stat-value">{summary.warning}</div>
              <div className="stat-label">Warning (3–5 days)</div>
            </div>
          </div>
          <div className="stat-card sky">
            <div className="stat-icon">🔵</div>
            <div className="stat-info">
              <div className="stat-value">{summary.watch}</div>
              <div className="stat-label">Watch (≤2 days)</div>
            </div>
          </div>
          <div className="stat-card teal">
            <div className="stat-icon">🪣</div>
            <div className="stat-info">
              <div className="stat-value">{summary.totalCans}</div>
              <div className="stat-label">Total Cans Out</div>
            </div>
          </div>
        </div>

        <div className="toolbar">
          <div className="search-container">
            <span className="search-icon">🔍</span>
            <input
              className="form-control"
              placeholder="Search name, phone, area..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select className="form-control" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="severity">Sort: Severity</option>
              <option value="cans">Sort: Most Cans</option>
              <option value="days">Sort: Most Days</option>
            </select>
          </div>
        </div>

        <div className="chip-group">
          {AREAS.map(a => (
            <button
              key={a}
              className={`chip ${area === a ? 'active' : ''}`}
              onClick={() => setArea(a)}
            >
              {a}
            </button>
          ))}
          <span style={{ width: 2, background: 'var(--n-200)', borderRadius: 2 }} />
          {['All', 'Critical', 'Warning', 'Watch'].map(s => (
            <button
              key={s}
              className={`chip ${severityFilter === s ? 'active' : ''}`}
              onClick={() => setSeverityFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Area</th>
                  <th>Phone</th>
                  <th>Cans Out</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">
                        <span className="empty-icon">✅</span>
                        <h3>No outstanding empties</h3>
                        <p>All customers have returned their cans</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(a => {
                  const meta = SEVERITY_META[a.severity] || SEVERITY_META.watch
                  return (
                    <tr key={a.customer_id}>
                      <td><div className="cell-main">{a.name}</div></td>
                      <td>{a.area}</td>
                      <td>{a.phone || '—'}</td>
                      <td><strong>{a.empty_balance}</strong></td>
                      <td>{a.days_outstanding}d</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: meta.bg,
                            color: meta.color,
                            border: `1px solid ${meta.border}`,
                          }}
                        >
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => openCollect(a)}
                        >
                          Record Return
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {collectTarget && (
        <div className="modal-overlay" onClick={() => setCollectTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>🪣 Record Empty Return</h3>
              <button className="modal-close" onClick={() => setCollectTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info">
                <strong>{collectTarget.name}</strong> has{' '}
                <strong>{collectTarget.empty_balance} cans</strong> outstanding
                ({collectTarget.days_outstanding} days overdue)
              </div>
              <div className="form-group">
                <label>Cans Returned *</label>
                <input
                  type="number"
                  className="form-control"
                  value={collectQty}
                  onChange={e => setCollectQty(e.target.value)}
                  max={collectTarget.empty_balance}
                  min={1}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Notes (optional)</label>
                <input
                  className="form-control"
                  value={collectNotes}
                  onChange={e => setCollectNotes(e.target.value)}
                  placeholder="e.g. collected at truck"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setCollectTarget(null)}>Cancel</button>
              <button className="btn btn-success" onClick={submitCollect} disabled={saving}>
                {saving ? '⏳ Saving...' : 'Confirm Return ✓'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
