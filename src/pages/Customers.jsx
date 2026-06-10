import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

const AREAS = ['All', 'Tondiarpet', 'New Washermanpet', 'Kaladipet', 'Tollgate', 'Thiruvotriyur']
const VALID_AREAS = AREAS.filter(a => a !== 'All')

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'))
  return lines.slice(1).filter(l => l.trim()).map((line, idx) => {
    // Handle quoted fields
    const cols = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQ = !inQ }
      else if (line[i] === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
      else { cur += line[i] }
    }
    cols.push(cur.trim())
    const row = {}
    headers.forEach((h, i) => { row[h] = cols[i] || '' })
    return { _row: idx + 2, ...row }
  })
}

function validateBulkRow(row) {
  const errors = []
  if (!row.name?.trim()) errors.push('Name required')
  const area = row.area?.trim()
  if (area && !VALID_AREAS.includes(area)) errors.push(`Area must be one of: ${VALID_AREAS.join(', ')}`)
  const type = row.type?.trim()
  if (type && type !== 'home' && type !== 'shop') errors.push('Type must be home or shop')
  return errors
}

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [filtered, setFiltered] = useState([])
  const [area, setArea] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showDue, setShowDue] = useState(false)
  const [dueTarget, setDueTarget] = useState(null)
  const [dueAmt, setDueAmt] = useState('')
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [bulkRows, setBulkRows] = useState([])
  const [bulkUploading, setBulkUploading] = useState(false)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  const empty = {
    name: '', phone: '', phone2: '', phone3: '', address: '',
    area: 'Tondiarpet', type: 'home', price_per_can: 40,
    empty_balance: 0, due_amount: 0, credit_enabled: false
  }
  const [form, setForm] = useState(empty)

  const fetchRef = useRef(null)

  const fetchCustomers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name')
      if (error) throw error
      setCustomers(data || [])
    } catch (err) {
      console.error('Fetch customers error:', err)
      toast.error('Failed to load customers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRef.current = fetchCustomers
  }, [fetchCustomers])

  useEffect(() => {
    fetchCustomers()

    const channel = supabase
      .channel('customers-rt-' + Date.now())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'customers' }, (payload) => {
        setCustomers(prev => [payload.new, ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'customers' }, (payload) => {
        setCustomers(prev => prev.map(c => c.id === payload.new.id ? payload.new : c))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'customers' }, (payload) => {
        setCustomers(prev => prev.filter(c => c.id !== payload.old.id))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    let f = [...customers]
    if (area !== 'All') f = f.filter(c => c.area === area)
    if (typeFilter !== 'All') f = f.filter(c => c.type === typeFilter)
    if (search) {
      const s = search.toLowerCase()
      f = f.filter(c =>
        c.name?.toLowerCase().includes(s) ||
        c.phone?.includes(s) ||
        c.primary_phone?.includes(s) ||
        c.address?.toLowerCase().includes(s)
      )
    }
    setFiltered(f)
  }, [customers, area, typeFilter, search])

  const downloadTemplate = () => {
    const header = 'name,phone,phone2,phone3,address,area,type,price_per_can,empty_balance,due_amount,credit_enabled'
    const example = 'Ravi Kumar,9876543210,,,12 Main St,Tondiarpet,home,40,0,0,false'
    const csv = header + '\n' + example
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'customers_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCSVFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result)
      if (rows.length === 0) return toast.error('No data rows found in CSV')
      const annotated = rows.map(r => ({ ...r, _errors: validateBulkRow(r) }))
      setBulkRows(annotated)
      setShowBulk(true)
    }
    reader.readAsText(file)
  }

  const bulkInsert = async () => {
    const valid = bulkRows.filter(r => r._errors.length === 0)
    if (valid.length === 0) return toast.error('No valid rows to upload')
    setBulkUploading(true)
    const payload = valid.map(r => {
      const phone = r.phone?.trim() || ''
      const phones = [phone, r.phone2?.trim(), r.phone3?.trim()].filter(Boolean)
      return {
        name: r.name.trim(),
        phone,
        primary_phone: phone,
        phones,
        address: r.address?.trim() || '',
        area: r.area?.trim() || 'Tondiarpet',
        type: (r.type?.trim() === 'shop' ? 'shop' : 'home'),
        price_per_can: parseInt(r.price_per_can) || 40,
        empty_balance: parseInt(r.empty_balance) || 0,
        due_amount: parseInt(r.due_amount) || 0,
        credit_enabled: r.credit_enabled?.toLowerCase() === 'true',
      }
    })
    try {
      const { error } = await supabase.from('customers').insert(payload)
      if (error) throw error
      toast.success(`${payload.length} customers uploaded!`)
      setShowBulk(false)
      setBulkRows([])
    } catch (e) {
      toast.error('Upload failed: ' + e.message)
    } finally {
      setBulkUploading(false)
    }
  }

  const openAdd = () => {
    setEditing(null)
    setForm(empty)
    setShowModal(true)
  }

  const openEdit = (c) => {
    setEditing(c)
    setForm({
      name: c.name || '',
      phone: c.primary_phone || c.phone || '',
      phone2: c.phones?.[1] || '',
      phone3: c.phones?.[2] || '',
      address: c.address || '',
      area: c.area || 'Tondiarpet',
      type: c.type || 'home',
      price_per_can: c.price_per_can || 40,
      empty_balance: c.empty_balance || 0,
      due_amount: c.due_amount || 0,
      credit_enabled: c.credit_enabled || false,
    })
    setShowModal(true)
  }

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required')
    setSaving(true)

    const phones = [form.phone, form.phone2, form.phone3].filter(Boolean)
    const payload = {
      name: form.name.trim(),
      phone: form.phone,
      primary_phone: form.phone,
      phones,
      address: form.address,
      area: form.area,
      type: form.type,
      price_per_can: parseInt(form.price_per_can) || 40,
      empty_balance: parseInt(form.empty_balance) || 0,
      due_amount: parseInt(form.due_amount) || 0,
      credit_enabled: form.credit_enabled,
    }

    try {
      if (editing) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('Customer updated!')
      } else {
        const { error } = await supabase.from('customers').insert(payload)
        if (error) throw error
        toast.success('Customer added!')
      }
      setShowModal(false)
    } catch (e) {
      toast.error('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const del = async (c) => {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return
    try {
      const { error } = await supabase.from('customers').delete().eq('id', c.id)
      if (error) throw error
      toast.success('Customer deleted')
    } catch (e) {
      toast.error('Delete failed: ' + e.message)
    }
  }

  const collectDue = async () => {
    const a = parseInt(dueAmt)
    if (isNaN(a) || a <= 0) return toast.error('Enter valid amount')
    if (a > dueTarget.due_amount) return toast.error('Amount exceeds due')

    try {
      const { error } = await supabase
        .from('customers')
        .update({ due_amount: dueTarget.due_amount - a })
        .eq('id', dueTarget.id)
      if (error) throw error
      toast.success(`₹${a} collected from ${dueTarget.name}!`)
      setShowDue(false)
    } catch (e) {
      toast.error('Failed: ' + e.message)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>👥 Customers</h1>
          <p>{customers.length} total · {filtered.length} shown</p>
        </div>
        <div className="btn-group">
          <button className="btn btn-ghost" onClick={downloadTemplate} title="Download CSV template">⬇️ Template</button>
          <button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()} title="Upload CSV file">⬆️ Bulk Upload</button>
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVFile} />
          <button className="btn btn-ghost" onClick={() => navigate('/admin/customers/import')}>📱 Import from Contacts</button>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Customer</button>
        </div>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div className="search-container">
            <span className="search-icon">🔍</span>
            <input
              className="form-control"
              placeholder="Search name, phone, address..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="chip-group">
          {AREAS.map(a => (
            <button key={a} className={`chip ${area === a ? 'active' : ''}`} onClick={() => setArea(a)}>
              {a}
            </button>
          ))}
          <span style={{ width: 2, background: 'var(--n-200)', borderRadius: 2 }} />
          {['All', 'home', 'shop'].map(t => (
            <button key={t} className={`chip ${typeFilter === t ? 'active' : ''}`} onClick={() => setTypeFilter(t)}>
              {t === 'home' ? '🏠 Home' : t === 'shop' ? '🏪 Shop' : 'All Types'}
            </button>
          ))}
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Customer</th><th>Phone</th><th>Area</th><th>Type</th>
                  <th>₹/Can</th><th>Empties</th><th>Due</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state">
                        <span className="empty-icon">👥</span>
                        <h3>No customers found</h3>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div className="cell-main">{c.name}</div>
                      <div className="cell-sub">{c.address}</div>
                    </td>
                    <td>{c.primary_phone || c.phone}</td>
                    <td>{c.area}</td>
                    <td><span className={`badge badge-${c.type}`}>{c.type}</span></td>
                    <td>₹{c.price_per_can}</td>
                    <td>{c.empty_balance || 0}</td>
                    <td>
                      {c.due_amount > 0
                        ? <span className="due-amount">₹{c.due_amount}</span>
                        : <span className="due-clear">✓ Clear</span>
                      }
                    </td>
                    <td>
                      <div className="btn-group">
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(c)}>✏️</button>
                        {c.due_amount > 0 && (
                          <button className="btn btn-sm btn-success" onClick={() => { setDueTarget(c); setDueAmt(''); setShowDue(true) }}>
                            💰
                          </button>
                        )}
                        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--rose-500)' }} onClick={() => del(c)}>
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Edit Customer' : 'New Customer'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Full Name *</label>
                <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Customer name" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Phone 1 (Primary)</label>
                  <input className="form-control" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} maxLength={10} placeholder="10 digits" />
                </div>
                <div className="form-group">
                  <label>Phone 2</label>
                  <input className="form-control" value={form.phone2} onChange={e => setForm({ ...form, phone2: e.target.value })} maxLength={10} />
                </div>
              </div>
              <div className="form-group">
                <label>Phone 3</label>
                <input className="form-control" value={form.phone3} onChange={e => setForm({ ...form, phone3: e.target.value })} maxLength={10} />
              </div>
              <div className="form-group">
                <label>Address</label>
                <textarea className="form-control" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Area</label>
                  <select className="form-control" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })}>
                    {AREAS.filter(a => a !== 'All').map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select className="form-control" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value="home">🏠 Home</option>
                    <option value="shop">🏪 Shop</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Price/Can (₹)</label>
                  <input type="number" className="form-control" value={form.price_per_can} onChange={e => setForm({ ...form, price_per_can: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Empty Balance</label>
                  <input type="number" className="form-control" value={form.empty_balance} onChange={e => setForm({ ...form, empty_balance: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Due Amount (₹)</label>
                  <input type="number" className="form-control" value={form.due_amount} onChange={e => setForm({ ...form, due_amount: e.target.value })} />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', paddingTop: 24 }}>
                  <label className="form-check">
                    <input type="checkbox" checked={form.credit_enabled} onChange={e => setForm({ ...form, credit_enabled: e.target.checked })} />
                    Credit Enabled
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? '⏳ Saving...' : editing ? 'Save Changes' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Preview Modal */}
      {showBulk && (
        <div className="modal-overlay" onClick={() => setShowBulk(false)}>
          <div className="modal" style={{ maxWidth: 800, width: '95vw' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⬆️ Bulk Upload Preview</h3>
              <button className="modal-close" onClick={() => setShowBulk(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <div style={{ padding: '12px 20px', background: 'var(--n-50)', borderBottom: '1px solid var(--n-200)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--green-600)', fontWeight: 600 }}>
                  ✓ {bulkRows.filter(r => r._errors.length === 0).length} valid
                </span>
                {bulkRows.some(r => r._errors.length > 0) && (
                  <span style={{ color: 'var(--rose-600)', fontWeight: 600 }}>
                    ✗ {bulkRows.filter(r => r._errors.length > 0).length} errors (will be skipped)
                  </span>
                )}
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
                <table style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Row</th><th>Name</th><th>Phone</th><th>Area</th><th>Type</th><th>₹/Can</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((r, i) => (
                      <tr key={i} style={{ background: r._errors.length > 0 ? 'var(--rose-50, #fff1f2)' : undefined }}>
                        <td style={{ color: 'var(--n-400)' }}>{r._row}</td>
                        <td>{r.name || <em style={{ color: 'var(--rose-500)' }}>missing</em>}</td>
                        <td>{r.phone || '—'}</td>
                        <td>{r.area || '—'}</td>
                        <td>{r.type || 'home'}</td>
                        <td>{r.price_per_can || 40}</td>
                        <td>
                          {r._errors.length === 0
                            ? <span style={{ color: 'var(--green-600)' }}>✓ OK</span>
                            : <span style={{ color: 'var(--rose-600)', fontSize: 12 }}>{r._errors.join('; ')}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowBulk(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={bulkInsert}
                disabled={bulkUploading || bulkRows.filter(r => r._errors.length === 0).length === 0}
              >
                {bulkUploading ? '⏳ Uploading...' : `Upload ${bulkRows.filter(r => r._errors.length === 0).length} Customers`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect Due Modal */}
      {showDue && dueTarget && (
        <div className="modal-overlay" onClick={() => setShowDue(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>💰 Collect Due</h3>
              <button className="modal-close" onClick={() => setShowDue(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-warning">
                <strong>{dueTarget.name}</strong> owes <strong>₹{dueTarget.due_amount}</strong>
              </div>
              <div className="form-group">
                <label>Amount to Collect</label>
                <input type="number" className="form-control" value={dueAmt} onChange={e => setDueAmt(e.target.value)} placeholder="₹" autoFocus />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowDue(false)}>Cancel</button>
              <button className="btn btn-success" onClick={collectDue}>Collect ✓</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}