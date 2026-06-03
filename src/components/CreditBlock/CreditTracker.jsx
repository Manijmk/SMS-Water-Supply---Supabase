import { useState, useMemo } from 'react';
import {
  useCreditAlerts, CREDIT_META,
  recordCreditPayment, grantCreditOverride,
} from '../../hooks/useCreditBlock';

const BADGE_CLASS = {
  blocked:  'badge-cancelled',
  warning:  'badge-pending',
  override: 'badge-delivered',
  watch:    'badge-out_for_delivery',
};

const STATUS_FILTERS = [
  { value: 'all',      label: 'All' },
  { value: 'blocked',  label: '🚫 Blocked' },
  { value: 'warning',  label: '⚠️ Warning' },
  { value: 'watch',    label: 'ℹ️ Watch' },
  { value: 'override', label: '✅ Override' },
];

function UtilBar({ pct }) {
  const pctSafe = Math.min(100, Math.max(0, pct ?? 0));
  const bg =
    pctSafe >= 100 ? 'var(--rose-500)' :
    pctSafe >= 80  ? 'var(--amber-500)' :
    'var(--emerald-500)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="progress-track" style={{ flex: 1, height: 6 }}>
        <div className="progress-fill" style={{ width: `${pctSafe}%`, background: bg }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--n-400)', minWidth: 30, textAlign: 'right' }}>{pctSafe}%</span>
    </div>
  );
}

function PaymentModal({ customer, onClose, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [mode,   setMode]   = useState('cash');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr('Enter a valid amount'); return; }
    setSaving(true);
    const { success, error } = await recordCreditPayment(customer.customer_id, amt, mode);
    setSaving(false);
    if (!success) { setErr(error); return; }
    onSuccess();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h3>💳 Record Payment</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="alert alert-danger">
            <strong>₹{customer.due_amount?.toLocaleString('en-IN')} outstanding</strong>
            <div style={{ fontSize: 12, marginTop: 2, opacity: 0.8 }}>
              Credit limit: ₹{customer.credit_limit?.toLocaleString('en-IN')} · {customer.name}, {customer.area}
            </div>
          </div>

          <div className="form-group">
            <label>Amount received (₹)</label>
            <input
              type="number" min="1" className="form-control"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Enter amount"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Payment mode</label>
            <div className="btn-group">
              {['cash', 'upi'].map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`btn ${mode === m ? 'btn-success' : 'btn-ghost'}`}
                >
                  {m === 'cash' ? '💵 Cash' : '📱 UPI'}
                </button>
              ))}
            </div>
          </div>

          {err && <div className="alert alert-danger">{err}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-success" onClick={handleSubmit} disabled={saving}>
            {saving ? '⏳ Saving…' : '✓ Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OverrideModal({ customer, onClose, onSuccess }) {
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);

  const handleSubmit = async () => {
    if (!note.trim()) { setErr('Please enter a reason for the override'); return; }
    setSaving(true);
    const { success, error } = await grantCreditOverride(customer.customer_id, note);
    setSaving(false);
    if (!success) { setErr(error); return; }
    onSuccess();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h3>⚡ Allow Delivery Today</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: 12, fontWeight: 600, color: 'var(--n-700)' }}>
            {customer.name} · ₹{customer.due_amount?.toLocaleString('en-IN')} overdue
          </p>

          <div className="alert alert-warning">
            <strong>⚠️ Override is for today only.</strong> Resets automatically at midnight.
            The customer's balance is not changed — collect payment separately.
          </div>

          <div className="form-group">
            <label>Reason for override</label>
            <input
              type="text" className="form-control"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Customer promised to pay tomorrow"
              autoFocus
            />
          </div>

          {err && <div className="alert alert-danger">{err}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? '⏳ Saving…' : '⚡ Allow Today'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreditTracker() {
  const { alerts, summary, loading, error, refetch } = useCreditAlerts();

  const [search,     setSearch]     = useState('');
  const [statusFilt, setStatusFilt] = useState('all');
  const [paying,     setPaying]     = useState(null);
  const [overriding, setOverriding] = useState(null);

  const filtered = useMemo(() => {
    let list = [...alerts];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.name?.toLowerCase().includes(q) ||
        a.phone?.includes(q) ||
        a.area?.toLowerCase().includes(q)
      );
    }
    if (statusFilt !== 'all') list = list.filter(a => a.credit_status === statusFilt);
    return list;
  }, [alerts, search, statusFilt]);

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
    </div>
  );

  if (error) return (
    <div className="page-body">
      <div className="alert alert-danger">
        <strong>{error}</strong>
        <br />
        <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={refetch}>
          🔄 Try again
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>💳 Credit Control</h1>
          <p>Customers with outstanding balances · {alerts.length} tracked</p>
        </div>
        <button className="btn btn-ghost" onClick={refetch}>🔄 Refresh</button>
      </div>

      <div className="page-body">
        {summary && (
          <div className="stats-grid">
            <div className="stat-card rose">
              <div className="stat-icon">🚫</div>
              <div className="stat-info">
                <div className="stat-value">{summary.blocked_count ?? 0}</div>
                <div className="stat-label">Blocked</div>
              </div>
            </div>
            <div className="stat-card amber">
              <div className="stat-icon">⚠️</div>
              <div className="stat-info">
                <div className="stat-value">{summary.warning_count ?? 0}</div>
                <div className="stat-label">Warning</div>
              </div>
            </div>
            <div className="stat-card teal">
              <div className="stat-icon">💰</div>
              <div className="stat-info">
                <div className="stat-value">₹{summary.total_due?.toLocaleString('en-IN') ?? 0}</div>
                <div className="stat-label">Total Due</div>
              </div>
            </div>
            <div className="stat-card violet">
              <div className="stat-icon">✅</div>
              <div className="stat-info">
                <div className="stat-value">{summary.override_count ?? 0}</div>
                <div className="stat-label">Overridden</div>
              </div>
            </div>
          </div>
        )}

        <div className="toolbar">
          <div className="search-container">
            <span className="search-icon">🔍</span>
            <input
              className="form-control"
              placeholder="Search name, phone, area…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="chip-group">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              className={`chip ${statusFilt === f.value ? 'active' : ''}`}
              onClick={() => setStatusFilt(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <span className="empty-icon">💳</span>
              <h3>No credit alerts</h3>
              <p>All credit customers are within their limits.</p>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Area</th>
                    <th>Type</th>
                    <th>Due (₹)</th>
                    <th>Limit (₹)</th>
                    <th>Utilisation</th>
                    <th>Last Payment</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.customer_id}>
                      <td>
                        <div className="cell-main">{c.name}</div>
                        <div className="cell-sub">{c.phone}</div>
                      </td>
                      <td>{c.area}</td>
                      <td>
                        <span className={`badge badge-${c.customer_type}`}>{c.customer_type}</span>
                      </td>
                      <td>
                        <span className="due-amount">₹{c.due_amount?.toLocaleString('en-IN')}</span>
                      </td>
                      <td style={{ color: 'var(--n-500)' }}>
                        ₹{c.credit_limit?.toLocaleString('en-IN')}
                      </td>
                      <td style={{ minWidth: 120 }}>
                        <UtilBar pct={c.utilisation_pct} />
                      </td>
                      <td style={{ color: 'var(--n-500)', fontSize: 13 }}>
                        {c.last_payment_at
                          ? new Date(c.last_payment_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                          : <span className="due-clear">Never</span>}
                      </td>
                      <td>
                        <span className={`badge ${BADGE_CLASS[c.credit_status] ?? ''}`}>
                          {CREDIT_META[c.credit_status]?.label ?? c.credit_status}
                        </span>
                      </td>
                      <td>
                        <div className="btn-group">
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => setPaying(c)}
                          >
                            💰 Pay
                          </button>
                          {c.credit_status === 'blocked' && (
                            <button
                              className="btn btn-sm btn-ghost"
                              style={{ color: 'var(--violet-500)' }}
                              onClick={() => setOverriding(c)}
                            >
                              ⚡ Override
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {paying && (
        <PaymentModal
          customer={paying}
          onClose={() => setPaying(null)}
          onSuccess={() => { setPaying(null); refetch(); }}
        />
      )}
      {overriding && (
        <OverrideModal
          customer={overriding}
          onClose={() => setOverriding(null)}
          onSuccess={() => { setOverriding(null); refetch(); }}
        />
      )}
    </>
  );
}
