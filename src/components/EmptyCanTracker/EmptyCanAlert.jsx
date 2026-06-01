import { useState } from 'react'
import toast from 'react-hot-toast'
import { useCustomerEmptyStatus, recordEmptyCollection, SEVERITY_META } from '../../hooks/useEmptyCanTracker'

const TAMIL = {
  critical:      'அவசர நிலை',
  warning:       'எச்சரிக்கை',
  watch:         'கவனி',
  cansOwed:      'கேன்கள் நிலுவை',
  daysOverdue:   'நாட்கள் தாமதம்',
  collectNow:    'இப்போது சேகரி',
  cansLabel:     'திரும்பப் பெற்ற கேன்கள்',
  confirm:       '✓ உறுதிப்படுத்து',
  deliverAnyway: 'எப்படியும் டெலிவரி (உரிமையாளர் அனுமதி)',
}

export default function EmptyCanAlert({ customerId, customerName, onProceed, onCollected, showTamil }) {
  const { status, loading, refresh } = useCustomerEmptyStatus(customerId)
  const [showForm, setShowForm] = useState(false)
  const [qty, setQty] = useState('')
  const [saving, setSaving] = useState(false)

  if (loading || !status || !status.empty_balance || status.severity === 'ok') {
    return null
  }

  const meta = SEVERITY_META[status.severity]
  const t = showTamil ? TAMIL : null

  const openForm = () => {
    setShowForm(true)
    setQty(String(status.empty_balance))
  }

  const handleCollect = async () => {
    const n = parseInt(qty)
    if (!n || n <= 0) return toast.error('Enter valid quantity')
    if (n > status.empty_balance) return toast.error(`Max is ${status.empty_balance}`)
    setSaving(true)
    try {
      await recordEmptyCollection(customerId, n)
      toast.success(`${n} empties collected!`)
      setShowForm(false)
      setQty('')
      refresh()
      onCollected?.(n)
    } catch (e) {
      toast.error('Failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        margin: '10px 0',
        padding: '12px 14px',
        background: meta.bg,
        border: `1.5px solid ${meta.border}`,
        borderRadius: 12,
      }}
    >
      {/* Alert header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <strong style={{ color: meta.color, fontSize: 13 }}>
            {meta.icon} {t ? (t[status.severity] || meta.label) : meta.label}
          </strong>
          <div style={{ fontSize: 12, color: meta.color, opacity: 0.9, marginTop: 2 }}>
            {status.empty_balance} {t ? t.cansOwed : 'cans outstanding'}
            {' · '}
            {status.days_outstanding} {t ? t.daysOverdue : 'days overdue'}
          </div>
        </div>

        {!showForm && (
          <button
            className="btn btn-sm"
            style={{
              background: meta.color,
              color: '#fff',
              fontSize: 11,
              padding: '5px 10px',
              flexShrink: 0,
            }}
            onClick={openForm}
            disabled={saving}
          >
            {t ? t.collectNow : 'Collect now'}
          </button>
        )}
      </div>

      {/* Inline collection form */}
      {showForm && (
        <div style={{ borderTop: `1px solid ${meta.border}`, paddingTop: 10, marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <label style={{ fontSize: 12 }}>{t ? t.cansLabel : 'Cans to collect'}</label>
              <input
                type="number"
                className="form-control"
                value={qty}
                onChange={e => setQty(e.target.value)}
                min={1}
                max={status.empty_balance}
                disabled={saving}
              />
            </div>
            <button
              className="btn btn-success btn-sm"
              onClick={handleCollect}
              disabled={saving}
            >
              {saving ? '...' : (t ? t.confirm : '✓')}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Critical: "Deliver anyway" acknowledgement */}
      {status.severity === 'critical' && (
        <button
          className="btn btn-ghost btn-sm"
          style={{
            marginTop: 8,
            width: '100%',
            color: meta.color,
            fontSize: 11,
            borderColor: meta.border,
          }}
          onClick={onProceed}
        >
          {t ? t.deliverAnyway : 'Deliver anyway (owner approved)'}
        </button>
      )}
    </div>
  )
}
