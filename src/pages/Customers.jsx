import { useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

const AREAS = ['Tondiarpet', 'New Washermanpet', 'Kaladipet', 'Tollgate', 'Thiruvotriyur']
const EMPTY = { name: '', phone: '', address: '', area: 'Tondiarpet', type: 'home', price_per_can: 40, empty_balance: 0, credit_enabled: false, due_amount: 0 }

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [dueOnly, setDueOnly] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearDueModal, setClearDueModal] = useState(null) // customer to clear due

  async function load() {
    const { data, error } = await supabase.from('customers').select('*').order('name')
    if (error) toast.error('Error loading customers')
    else setCustomers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase.channel('customers-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const filtered = customers
    .filter(c => areaFilter === 'All' || c.area === areaFilter)
    .filter(c => typeFilter === 'All' || c.type === typeFilter)
    .filter(c => !dueOnly || c.due_amount > 0)
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))

  const totalDue = customers.reduce((s, c) => s + (c.due_amount || 0), 0)
  const customersWithDue = customers.filter(c => c.due_amount > 0).length

  function openAdd() { setForm(EMPTY); setEditing(null); setModal(true) }
  function openEdit(c) { setForm({ ...c }); setEditing(c.id); setModal(true) }

  async function save() {
    if (!form.name || !form.phone) return toast.error('Name and phone are required')
    setSaving(true)
    const { error } = editing
      ? await supabase.from('customers').update(form).eq('id', editing)
      : await supabase.from('customers').insert(form)
    if (error) toast.error('Error: ' + error.message)
    else { toast.success(editing ? 'Customer updated!' : 'Customer added!'); setModal(false); load() }
    setSaving(false)
  }

  async function del(id) {
    if (!confirm('Delete this customer?')) return
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) toast.error('Error deleting')
    else { toast.success('Deleted!'); load() }
  }

  async function clearDue(customer, amount) {
    // Reduce due amount by the paid amount
    const newDue = Math.max(0, (customer.due_amount || 0) - amount)
    const { error } = await supabase.from('customers').update({ due_amount: newDue }).eq('id', customer.id)
    if (error) toast.error('Error: ' + error.message)
    else {
      toast.success(`✅ ₹${amount} cleared! Remaining due: ₹${newDue}`)
      setClearDueModal(null)
      load()
    }
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  if (loading) return <div className="loading"><div className="spinner" />Loading customers...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers 👥</h1>
          <p className="page-subtitle">{customers.length} total customers</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Customer</button>
      </div>

      {/* Due amount summary */}
      {customersWithDue > 0 && (
        <div style={{ background: '#fef2f2', border: '2px solid #fecaca', borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--red)', fontSize: 15 }}>⚠️ Outstanding Dues</div>
            <div style={{ fontSize: 13, color: '#991b1b', marginTop: 2 }}>{customersWithDue} customers owe a total of ₹{totalDue}</div>
          </div>
          <button className="btn btn-sm" onClick={() => setDueOnly(!dueOnly)}
            style={{ background: dueOnly ? 'var(--red)' : 'white', color: dueOnly ? 'white' : 'var(--red)', border: '2px solid var(--red)', fontWeight: 700 }}>
            {dueOnly ? '✕ Show All' : '👁 Show Due Only'}
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
          <span>🔍</span>
          <input placeholder="Search name or phone..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={areaFilter} onChange={e => setAreaFilter(e.target.value)}>
          <option value="All">All Areas</option>
          {AREAS.map(a => <option key={a}>{a}</option>)}
        </select>
        <select className="form-select" style={{ width: 'auto' }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="All">All Types</option>
          <option value="home">Home</option>
          <option value="shop">Shop</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div className="icon">👥</div><p>No customers found</p></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Phone</th><th>Area</th><th>Type</th>
                  <th>Rate</th><th>Empty Bal.</th><th>Due Amount</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{c.name}</div>
                      {c.credit_enabled && <div style={{ fontSize: 11, color: 'var(--sky)', fontWeight: 700 }}>Credit enabled</div>}
                    </td>
                    <td>{c.phone}</td>
                    <td><span className="badge badge-blue">{c.area}</span></td>
                    <td><span className={`badge ${c.type === 'shop' ? 'badge-orange' : 'badge-green'}`}>{c.type}</span></td>
                    <td style={{ fontWeight: 700 }}>₹{c.price_per_can}</td>
                    <td style={{ fontWeight: 700, color: c.empty_balance > 0 ? 'var(--orange)' : 'var(--gray-500)' }}>
                      {c.empty_balance}
                    </td>
                    <td>
                      {c.due_amount > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="badge badge-red">₹{c.due_amount} due</span>
                          <button
                            onClick={() => setClearDueModal(c)}
                            style={{ background: 'var(--green)', border: 'none', color: 'white', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            Collect
                          </button>
                        </div>
                      ) : (
                        <span className="badge badge-green">✅ Clear</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✏️</button>
                        <button className="btn btn-danger btn-sm" onClick={() => del(c.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Collect Due Modal */}
      {clearDueModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setClearDueModal(null)}>
          <div className="modal">
            <h2 className="modal-title">💰 Collect Due — {clearDueModal.name}</h2>
            <div style={{ background: '#fef2f2', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--red)' }}>Total due: ₹{clearDueModal.due_amount}</div>
              <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>Enter the amount customer is paying now</div>
            </div>
            <DueCollectionForm customer={clearDueModal} onClear={clearDue} onClose={() => setClearDueModal(null)} />
          </div>
        </div>
      )}

      {/* Add/Edit Customer Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <h2 className="modal-title">{editing ? 'Edit Customer' : 'Add Customer'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Full Name *</label>
                <input className="form-input" value={form.name} onChange={e => f('name', e.target.value)} placeholder="Customer name" />
              </div>
              <div className="form-group">
                <label className="form-label">Phone *</label>
                <input className="form-input" value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="9876543210" />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={form.type} onChange={e => f('type', e.target.value)}>
                  <option value="home">Home</option>
                  <option value="shop">Shop</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Address</label>
                <input className="form-input" value={form.address || ''} onChange={e => f('address', e.target.value)} placeholder="Full address" />
              </div>
              <div className="form-group">
                <label className="form-label">Area</label>
                <select className="form-select" value={form.area} onChange={e => f('area', e.target.value)}>
                  {AREAS.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Price per Can (₹)</label>
                <input className="form-input" type="number" value={form.price_per_can} onChange={e => f('price_per_can', +e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Empty Can Balance</label>
                <input className="form-input" type="number" value={form.empty_balance} onChange={e => f('empty_balance', +e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Due Amount (₹)</label>
                <input className="form-input" type="number" value={form.due_amount} onChange={e => f('due_amount', +e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="credit" checked={form.credit_enabled} onChange={e => f('credit_enabled', e.target.checked)} />
                <label htmlFor="credit" style={{ fontWeight: 700, fontSize: 14 }}>Credit enabled (can order without full payment)</label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : editing ? '✅ Update' : '➕ Add'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Sub-component for collecting due
function DueCollectionForm({ customer, onClear, onClose }) {
  const [amount, setAmount] = useState(customer.due_amount)
  return (
    <div>
      <div className="form-group">
        <label className="form-label">Amount Collecting (₹)</label>
        <input className="form-input" type="number" min={1} max={customer.due_amount}
          value={amount} onChange={e => setAmount(+e.target.value)}
          style={{ fontSize: 20, fontWeight: 800, borderColor: 'var(--green)' }} />
      </div>
      {amount < customer.due_amount && (
        <div style={{ background: '#fff7ed', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: 'var(--orange)' }}>Remaining due after this: ₹{customer.due_amount - amount}</span>
        </div>
      )}
      {amount >= customer.due_amount && (
        <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: 'var(--green)' }}>✅ Full due amount cleared!</span>
        </div>
      )}
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-success" onClick={() => onClear(customer, amount)}>
          💰 Collect ₹{amount}
        </button>
      </div>
    </div>
  )
}
