import { useState } from 'react';
import { useCustomerCreditStatus } from '../../hooks/useCreditBlock';

const ALERT_CONFIG = {
  blocked: {
    icon           : '🚫',
    title          : 'Delivery blocked',
    titleTa        : 'டெலிவரி தடுக்கப்பட்டது',
    alertClass     : 'alert-danger',
    blocksDelivery : true,
    proceedLabel   : 'Admin approved — deliver anyway',
  },
  override: {
    icon           : '✅',
    title          : 'Override active today',
    titleTa        : 'இன்று அனுமதிக்கப்பட்டுள்ளது',
    alertClass     : 'alert-info',
    blocksDelivery : false,
    proceedLabel   : null,
  },
  warning: {
    icon           : '⚠️',
    title          : 'High credit balance',
    titleTa        : 'அதிக கடன் நிலுவை',
    alertClass     : 'alert-warning',
    blocksDelivery : false,
    proceedLabel   : null,
  },
  watch: {
    icon           : 'ℹ️',
    title          : 'Credit balance growing',
    titleTa        : 'கடன் நிலுவை அதிகரிக்கிறது',
    alertClass     : 'alert-info',
    blocksDelivery : false,
    proceedLabel   : null,
  },
};

const UTIL_COLOR = {
  blocked: 'var(--rose-500)',
  warning: 'var(--amber-500)',
  override: 'var(--emerald-500)',
  watch: 'var(--teal-500)',
};

export default function CreditAlert({ customerId, onProceed, showTamil = false }) {
  const { status, loading } = useCustomerCreditStatus(customerId);
  const [acknowledged, setAcknowledged] = useState(false);

  if (loading) return (
    <div className="alert" style={{ opacity: 0.5, pointerEvents: 'none' }}>
      <div className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} />
      Checking credit status…
    </div>
  );

  if (!status || status.credit_status === 'clear') return null;
  if (acknowledged) return null;

  const cfg = ALERT_CONFIG[status.credit_status] ?? ALERT_CONFIG.watch;
  const { due_amount, credit_limit, utilisation_pct, override_note } = status;
  const remaining = Math.max(0, (credit_limit ?? 0) - (due_amount ?? 0));
  const pctSafe = Math.min(100, utilisation_pct ?? 0);
  const barColor = UTIL_COLOR[status.credit_status] ?? 'var(--teal-500)';

  return (
    <div className={`alert ${cfg.alertClass}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{cfg.icon}</span>
        <div style={{ flex: 1 }}>
          <strong>{showTamil ? cfg.titleTa : cfg.title}</strong>
          <div style={{ fontSize: 13, marginTop: 2, opacity: 0.85 }}>
            ₹{due_amount?.toLocaleString('en-IN')} outstanding of ₹{credit_limit?.toLocaleString('en-IN')} limit
          </div>
        </div>
      </div>

      {/* Override note */}
      {status.credit_status === 'override' && override_note && (
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          <strong>Owner note:</strong> {override_note}
        </div>
      )}

      {/* Mini stats row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          💳 ₹{due_amount?.toLocaleString('en-IN')} <span style={{ fontWeight: 400, opacity: 0.7 }}>due</span>
        </span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          📊 {pctSafe}% <span style={{ fontWeight: 400, opacity: 0.7 }}>used</span>
        </span>
        {status.credit_status !== 'blocked' && (
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            🪙 ₹{remaining.toLocaleString('en-IN')} <span style={{ fontWeight: 400, opacity: 0.7 }}>remaining</span>
          </span>
        )}
      </div>

      {/* Utilisation bar */}
      <div className="progress-track" style={{ height: 6 }}>
        <div className="progress-fill" style={{ width: `${pctSafe}%`, background: barColor }} />
      </div>

      {/* Action */}
      {cfg.blocksDelivery ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
            {showTamil
              ? 'உரிமையாளர் அனுமதி இல்லாமல் டெலிவரி செய்யாதீர்கள்'
              : 'Do not deliver without owner approval'}
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => { setAcknowledged(true); onProceed?.(); }}
          >
            {cfg.proceedLabel}
          </button>
        </>
      ) : (
        status.credit_status !== 'override' && (
          <button
            className="btn btn-ghost"
            onClick={() => { setAcknowledged(true); onProceed?.(); }}
          >
            {showTamil ? 'புரிந்தது · தொடரவும்' : 'Understood · Proceed'}
          </button>
        )
      )}

      {showTamil && (
        <div style={{ fontSize: 11, opacity: 0.6 }}>
          ₹{due_amount?.toLocaleString('en-IN')} நிலுவை · {pctSafe}% பயன்படுத்தப்பட்டது
        </div>
      )}
    </div>
  );
}
