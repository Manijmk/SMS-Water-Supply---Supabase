import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../hooks/useLang'
import toast from 'react-hot-toast'
import CreditAlert from '../components/CreditBlock/CreditAlert'

const T = {
  en: {
    tabs:           ['🚛 Trips', '📦 Deliver', '📊 Summary'],
    noTrips:        'No trips assigned today',
    noTripsHint:    'Contact admin for trip assignment',
    tapToView:      'Tap to view orders →',
    selectTripHint: 'ℹ️ Select a trip from the Trips tab first',
    goToTrips:      '← Go to Trips',
    pending:        'Pending',
    completed:      'Completed',
    noOrdersRoute:  'No orders for this route',
    formCans:       'Cans',
    formEmpties:    'Empties',
    formReceived:   'Received ₹',
    formMode:       'Mode',
    formExpected:   'Expected',
    modeCash:       'Cash',
    modeUpi:        'UPI',
    modeCredit:     'Credit',
    shortfall:      (n) => `Shortfall: ₹${n} will be added to due`,
    markDelivered:  '📦 Mark Delivered',
    confirmDel:     '✓ Confirm Delivery',
    saving:         '⏳ Saving...',
    cancel:         'Cancel',
    summaryTitle:   "📊 Today's Totals",
    statDel:        'Total Deliveries',
    statCans:       'Cans Delivered',
    statCash:       'Cash Collected',
    statEmp:        'Empties Collected',
    refreshSummary: '🔄 Refresh Summary',
    refresh:        '🔄 Refresh',
    switchLang:     'தமிழ்',
  },
  ta: {
    tabs:           ['🚛 பயணங்கள்', '📦 டெலிவரி', '📊 சுருக்கம்'],
    noTrips:        'இன்று பயணம் ஒதுக்கப்படவில்லை',
    noTripsHint:    'பயண ஒதுக்கீட்டிற்கு அட்மினை தொடர்பு கொள்ளவும்',
    tapToView:      'ஆர்டர்களை பார்க்க தட்டவும் →',
    selectTripHint: 'ℹ️ முதலில் பயணங்கள் தாவலில் பயணம் தேர்ந்தெடுக்கவும்',
    goToTrips:      '← பயணங்களுக்கு செல்',
    pending:        'நிலுவையில்',
    completed:      'முடிந்தது',
    noOrdersRoute:  'இந்த வழிக்கு ஆர்டர்கள் இல்லை',
    formCans:       'கேன்கள்',
    formEmpties:    'காலிகள்',
    formReceived:   'பெற்றது ₹',
    formMode:       'முறை',
    formExpected:   'எதிர்பார்ப்பு',
    modeCash:       'பணம்',
    modeUpi:        'யூபிஐ',
    modeCredit:     'கடன்',
    shortfall:      (n) => `குறைப்பணம்: ₹${n} நிலுவையில் சேரும்`,
    markDelivered:  '📦 டெலிவர் செய்',
    confirmDel:     '✓ டெலிவரி உறுதிசெய்',
    saving:         '⏳ சேமிக்கிறது...',
    cancel:         'ரத்துசெய்',
    summaryTitle:   '📊 இன்றைய மொத்தம்',
    statDel:        'மொத்த டெலிவரிகள்',
    statCans:       'வழங்கிய கேன்கள்',
    statCash:       'பணம் வசூல்',
    statEmp:        'காலி வசூல்',
    refreshSummary: '🔄 சுருக்கத்தை புதுப்பி',
    refresh:        '🔄 புதுப்பி',
    switchLang:     'EN',
  },
}

export default function DeliveryBoy() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [lang, toggleLang] = useLang()
  const t = T[lang]
  const today = new Date().toISOString().split('T')[0]
  const name = user?.user_metadata?.name || 'Delivery Boy'

  const [tab, setTab] = useState('trips')
  const [trips, setTrips] = useState([])
  const [selTrip, setSelTrip] = useState(null)
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [markTarget, setMarkTarget] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [creditClearance, setCreditClearance] = useState(true)
  const [summary, setSummary] = useState({ del: 0, cash: 0, emp: 0, count: 0 })
  const [mf, setMf] = useState({ delivered: 1, empty_collected: 0, payment_received: 0, payment_mode: 'cash' })

  const selTripRef = useRef(selTrip)
  const customersRef = useRef(customers)
  const fetchRef = useRef(null)

  useEffect(() => { selTripRef.current = selTrip }, [selTrip])
  useEffect(() => { customersRef.current = customers }, [customers])

  const fetchTrips = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('date', today)
        .eq('delivery_boy', name)
        .order('trip_number')
      if (error) throw error
      setTrips(data || [])
    } catch (err) {
      console.error('Fetch trips error:', err)
    }
  }, [today, name])

  const fetchOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('delivery_date', today)
        .in('status', ['pending', 'out_for_delivery', 'delivered'])
        .order('created_at')
      if (error) throw error
      setOrders(data || [])
    } catch (err) {
      console.error('Fetch orders error:', err)
    }
  }, [today])

  const fetchCustomers = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('customers').select('*')
      if (error) throw error
      setCustomers(data || [])
    } catch (err) {
      console.error('Fetch customers error:', err)
    }
  }, [])

  const fetchSummary = useCallback(async () => {
    try {
      const { data: myTrips } = await supabase
        .from('trips')
        .select('id')
        .eq('date', today)
        .eq('delivery_boy', name)

      const ids = myTrips?.map(t => t.id) || []
      if (ids.length === 0) {
        setSummary({ del: 0, cash: 0, emp: 0, count: 0 })
        return
      }

      const { data: dd } = await supabase
        .from('deliveries')
        .select('*')
        .eq('date', today)
        .in('trip_id', ids)

      const myDels = dd || []
      setSummary({
        del: myDels.reduce((s, x) => s + (x.delivered || 0), 0),
        cash: myDels.reduce((s, x) => s + (x.payment_received || 0), 0),
        emp: myDels.reduce((s, x) => s + (x.empty_collected || 0), 0),
        count: myDels.length,
      })
    } catch (err) {
      console.error('Fetch summary error:', err)
    }
  }, [today, name])

  const fetchAllData = useCallback(async () => {
    await Promise.all([fetchTrips(), fetchOrders(), fetchCustomers(), fetchSummary()])
    setLoading(false)
  }, [fetchTrips, fetchOrders, fetchCustomers, fetchSummary])

  useEffect(() => { fetchRef.current = fetchAllData }, [fetchAllData])

  useEffect(() => {
    fetchAllData()

    const channel = supabase
      .channel('delivery-boy-rt-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { fetchRef.current?.() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => { fetchRef.current?.() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => { fetchRef.current?.() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => { fetchRef.current?.() })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  const getCust = (id) => customersRef.current.find(c => c.id === id) || customers.find(c => c.id === id)

  const openMark = (o) => {
    const c = getCust(o.customer_id)
    if (!c) {
      toast.error('Customer data not loaded yet. Please wait and try again.')
      return
    }
    setCreditClearance(true)
    setMarkTarget(o)
    setMf({
      delivered: o.quantity || 1,
      empty_collected: 0,
      payment_received: (o.quantity || 1) * (c.price_per_can || 40),
      payment_mode: 'cash',
    })
  }

  const deliver = async (o) => {
    const currentTrip = selTripRef.current
    if (!currentTrip) {
      toast.error('No trip selected! Go back and select a trip first.')
      return
    }
    const c = getCust(o.customer_id)
    if (!c) {
      toast.error('Customer not found. Please refresh and try again.')
      return
    }

    const cansDelivered = parseInt(mf.delivered) || 0
    const emptiesCollected = parseInt(mf.empty_collected) || 0
    const expectedAmount = cansDelivered * (c.price_per_can || 40)
    const paidAmount = parseInt(mf.payment_received) || 0
    const balanceAmount = Math.max(0, expectedAmount - paidAmount)

    if (cansDelivered <= 0) {
      toast.error('Cans delivered must be greater than 0')
      return
    }

    setSubmitting(true)
    try {
      const { error: delErr } = await supabase.from('deliveries').insert({
        trip_id: currentTrip.id,
        customer_id: o.customer_id,
        order_id: o.id,
        customer_name: o.customer_name,
        delivered: cansDelivered,
        empty_collected: emptiesCollected,
        payment_received: paidAmount,
        balance_amount: balanceAmount,
        payment_mode: mf.payment_mode,
        date: today,
      })
      if (delErr) throw new Error('Failed to save delivery: ' + delErr.message)

      await supabase.from('orders').update({ status: 'delivered' }).eq('id', o.id)

      const newDue = (c.due_amount || 0) + balanceAmount
      const newEmpties = (c.empty_balance || 0) + cansDelivered - emptiesCollected
      await supabase.from('customers').update({ due_amount: newDue, empty_balance: newEmpties }).eq('id', c.id)

      toast.success(`✅ Delivered to ${o.customer_name}!`)
      setMarkTarget(null)
      await fetchAllData()
    } catch (e) {
      toast.error(e.message || 'Delivery failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const tripOrders = selTrip
    ? orders.filter(o => selTrip.route?.trim() ? o.area === selTrip.route : true)
    : []

  const pending = tripOrders.filter(o => o.status !== 'delivered')
  const done    = tripOrders.filter(o => o.status === 'delivered')

  const deliveredToday = orders.filter(o => o.status === 'delivered').length
  const totalToday     = orders.length
  const deliveryPct    = totalToday > 0 ? Math.round((deliveredToday / totalToday) * 100) : 0
  const ringR          = 40
  const ringCirc       = 2 * Math.PI * ringR
  const ringOffset     = ringCirc - (deliveryPct / 100) * ringCirc

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading your trips...</p>
      </div>
    )
  }

  return (
    <div className="mobile-panel">
      {/* Header */}
      <div className="mobile-header">
        <div className="header-row">
          <div>
            <h1>💧 SMS Water</h1>
            <p>👋 {name}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={toggleLang}
              className="btn btn-sm btn-ghost"
              style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, padding: '4px 10px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20 }}
            >
              {t.switchLang}
            </button>
            <button className="btn btn-sm btn-ghost" style={{ color: 'rgba(255,255,255,0.7)' }} onClick={handleLogout}>
              🚪
            </button>
          </div>
        </div>
        {totalToday > 0 && (
          <div className="header-progress-wrap">
            <div className="header-progress-meta">
              <span>{lang === 'ta' ? 'இன்றைய டெலிவரிகள்' : "Today's Deliveries"}</span>
              <span>{deliveredToday}/{totalToday} {lang === 'ta' ? 'முடிந்தது' : 'done'}</span>
            </div>
            <div className="header-progress-track">
              <div className="header-progress-fill" style={{ width: `${deliveryPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mobile-tabs">
        {['trips', 'orders', 'summary'].map((key, i) => (
          <button
            key={key}
            className={`mobile-tab ${tab === key ? 'active' : ''}`}
            onClick={() => {
              if (key === 'trips') { setSelTrip(null); setMarkTarget(null) }
              if (key === 'summary') fetchSummary()
              setTab(key)
            }}
          >
            {t.tabs[i]}
          </button>
        ))}
      </div>

      <div key={tab} className="mobile-content tab-fade">

        {/* ═══ TRIPS TAB ═══ */}
        {tab === 'trips' && (
          trips.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🚛</span>
              <h3>{t.noTrips}</h3>
              <p>{t.noTripsHint}</p>
              <button className="btn btn-ghost btn-sm" onClick={fetchTrips} style={{ marginTop: 12 }}>{t.refresh}</button>
            </div>
          ) : (
            trips.map((tr, i) => (
              <div
                key={tr.id}
                className="info-card clickable"
                onClick={() => { setSelTrip(tr); setTab('orders'); setMarkTarget(null) }}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <h4>
                  {tr.vehicle === '2-Wheeler' ? '🏍️' : tr.vehicle?.includes('3') ? '🛺' : '🚛'}
                  {' '}{lang === 'ta' ? `பயணம் #${tr.trip_number}` : `Trip #${tr.trip_number}`}
                </h4>
                <div className="meta">{tr.route || (lang === 'ta' ? 'அனைத்து பகுதிகள்' : 'All areas')} · {tr.loaded_cans} {lang === 'ta' ? 'கேன்கள்' : 'cans loaded'}</div>
                <div className="info-row">
                  <span className="info-label">{lang === 'ta' ? 'வாகனம்' : 'Vehicle'}</span>
                  <span className="info-value">{tr.vehicle}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">{lang === 'ta' ? 'நிலை' : 'Status'}</span>
                  <span className={`badge badge-${tr.status}`}><span className="dot" />{tr.status}</span>
                </div>
                {(() => {
                  const tOrds = tr.route?.trim() ? orders.filter(o => o.area === tr.route) : orders
                  const tDone = tOrds.filter(o => o.status === 'delivered').length
                  const tTotal = tOrds.length
                  if (tTotal === 0) return null
                  const tPct = Math.round((tDone / tTotal) * 100)
                  return (
                    <div className="trip-progress-bar">
                      <div className="trip-progress-meta">
                        <span>{tDone}/{tTotal} {lang === 'ta' ? 'டெலிவர் ஆனது' : 'delivered'}</span>
                        <span>{tPct}%</span>
                      </div>
                      <div className="trip-bar-track">
                        <div className="trip-bar-fill" style={{ width: `${tPct}%` }} />
                      </div>
                    </div>
                  )
                })()}
                <div style={{ marginTop: 10, textAlign: 'center', color: 'var(--teal-500)', fontSize: 13, fontWeight: 700 }}>
                  {t.tapToView}
                </div>
              </div>
            ))
          )
        )}

        {/* ═══ ORDERS / DELIVER TAB ═══ */}
        {tab === 'orders' && (
          !selTrip ? (
            <div>
              <div className="alert alert-info">{t.selectTripHint}</div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setTab('trips')}>
                {t.goToTrips}
              </button>
            </div>
          ) : (
            <>
              <div className="alert alert-info" style={{ borderColor: 'var(--teal-400)' }}>
                📦 {lang === 'ta' ? `பயணம் #${selTrip.trip_number}` : `Trip #${selTrip.trip_number}`} — {selTrip.route || (lang === 'ta' ? 'அனைத்து பகுதிகள்' : 'All areas')} — {selTrip.loaded_cans} {lang === 'ta' ? 'கேன்கள்' : 'cans'}
              </div>

              {pending.length > 0 && (
                <>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--n-600)', margin: '16px 0 8px' }}>
                    ⏳ {t.pending} ({pending.length})
                  </h4>
                  {pending.map(o => {
                    const c = getCust(o.customer_id)
                    const pricePerCan = c?.price_per_can || 40
                    const totalAmt = (o.quantity || 0) * pricePerCan

                    return (
                      <div key={o.id} className="info-card">
                        <h4>{o.customer_name}</h4>
                        <div className="meta">
                          📍 {c?.address || o.area} · 📞 {c?.primary_phone || c?.phone || '—'}
                        </div>

                        <div className="info-row"><span className="info-label">{t.formCans}</span><span className="info-value">{o.quantity}</span></div>
                        <div className="info-row"><span className="info-label">{lang === 'ta' ? 'விலை' : 'Rate'}</span><span className="info-value">₹{pricePerCan}/{lang === 'ta' ? 'கேன்' : 'can'}</span></div>
                        <div className="info-row"><span className="info-label">{lang === 'ta' ? 'மொத்தம்' : 'Total'}</span><span className="info-value highlight">₹{totalAmt}</span></div>

                        {c?.due_amount > 0 && (
                          <div className="alert alert-danger" style={{ margin: '8px 0', padding: '8px 12px', fontSize: 12 }}>
                            ⚠️ {lang === 'ta' ? `நிலுவை: ₹${c.due_amount}` : `Existing due: ₹${c.due_amount}`}
                          </div>
                        )}

                        {o.notes && (
                          <div className="info-row"><span className="info-label">{lang === 'ta' ? 'குறிப்பு' : 'Notes'}</span><span className="info-value">{o.notes}</span></div>
                        )}

                        {markTarget?.id === o.id ? (
                          <div className="mark-form">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <div className="form-group" style={{ marginBottom: 10 }}>
                                <label>{t.formCans}</label>
                                <input type="number" className="form-control" value={mf.delivered}
                                  onChange={e => setMf({ ...mf, delivered: e.target.value })} min={0} disabled={submitting} />
                              </div>
                              <div className="form-group" style={{ marginBottom: 10 }}>
                                <label>{t.formEmpties}</label>
                                <input type="number" className="form-control" value={mf.empty_collected}
                                  onChange={e => setMf({ ...mf, empty_collected: e.target.value })} min={0} disabled={submitting} />
                              </div>
                            </div>

                            <div className="amount-box">
                              <div className="amount-label">{t.formExpected}</div>
                              <div className="amount-value">₹{(parseInt(mf.delivered) || 0) * pricePerCan}</div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <div className="form-group" style={{ marginBottom: 10 }}>
                                <label>{t.formReceived}</label>
                                <input type="number" className="form-control" value={mf.payment_received}
                                  onChange={e => setMf({ ...mf, payment_received: e.target.value })} min={0} disabled={submitting} />
                              </div>
                              <div className="form-group" style={{ marginBottom: 10 }}>
                                <label>{t.formMode}</label>
                                <select className="form-control" value={mf.payment_mode}
                                  onChange={e => setMf({ ...mf, payment_mode: e.target.value })} disabled={submitting}>
                                  <option value="cash">{t.modeCash}</option>
                                  <option value="upi">{t.modeUpi}</option>
                                  <option value="credit">{t.modeCredit}</option>
                                </select>
                              </div>
                            </div>

                            {(() => {
                              const exp = (parseInt(mf.delivered) || 0) * pricePerCan
                              const paid = parseInt(mf.payment_received) || 0
                              if (paid < exp) {
                                return (
                                  <div className="alert alert-warning" style={{ fontSize: 12, padding: '6px 10px', marginBottom: 10 }}>
                                    {t.shortfall(exp - paid)}
                                  </div>
                                )
                              }
                              return null
                            })()}

                            <CreditAlert
                              customerId={o.customer_id}
                              onProceed={() => setCreditClearance(true)}
                              showTamil={lang === 'ta'}
                            />

                            <div className="card-actions">
                              <button
                                className="btn btn-success"
                                style={{ flex: 1 }}
                                onClick={() => deliver(o)}
                                disabled={submitting || !creditClearance}
                              >
                                {submitting ? t.saving : t.confirmDel}
                              </button>
                              <button className="btn btn-ghost" onClick={() => setMarkTarget(null)} disabled={submitting}>
                                {t.cancel}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="card-actions">
                            <button
                              className="btn btn-primary"
                              style={{ flex: 1 }}
                              onClick={() => openMark(o)}
                              disabled={submitting}
                            >
                              {t.markDelivered}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )}

              {done.length > 0 && (
                <>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--emerald-500)', margin: '16px 0 8px' }}>
                    ✅ {t.completed} ({done.length})
                  </h4>
                  {done.map(o => (
                    <div key={o.id} className="info-card" style={{ opacity: 0.6 }}>
                      <h4>✅ {o.customer_name}</h4>
                      <div className="meta">{o.area} · {o.quantity} {lang === 'ta' ? 'கேன்கள்' : 'cans'}</div>
                    </div>
                  ))}
                </>
              )}

              {tripOrders.length === 0 && (
                <div className="empty-state">
                  <span className="empty-icon">📦</span>
                  <h3>{t.noOrdersRoute}</h3>
                  <p>"{selTrip.route || (lang === 'ta' ? 'அனைத்து பகுதிகள்' : 'all areas')}"</p>
                  <button className="btn btn-ghost btn-sm" onClick={fetchOrders} style={{ marginTop: 12 }}>{t.refresh}</button>
                </div>
              )}
            </>
          )
        )}

        {/* ═══ SUMMARY TAB ═══ */}
        {tab === 'summary' && (
          <>
            <div className="summary-ring-wrap">
              <div className="ring-svg-wrap">
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle className="progress-ring-track" cx="50" cy="50" r={ringR} />
                  <circle
                    className="progress-ring-fill"
                    cx="50" cy="50" r={ringR}
                    strokeDasharray={ringCirc}
                    strokeDashoffset={ringOffset}
                    transform="rotate(-90, 50, 50)"
                  />
                </svg>
                <div className="ring-center">
                  <div className="ring-pct">{deliveryPct}%</div>
                  <div className="ring-pct-label">{lang === 'ta' ? 'முடிந்தது' : 'Done'}</div>
                </div>
              </div>
              <div className="ring-stats">
                <div className="ring-stat-row">
                  <span className="rs-label">{lang === 'ta' ? 'டெலிவரிகள்' : 'Deliveries'}</span>
                  <span className="rs-value teal">{summary.count}</span>
                </div>
                <div className="ring-stat-row">
                  <span className="rs-label">{lang === 'ta' ? 'கேன்கள்' : 'Cans'}</span>
                  <span className="rs-value emerald">{summary.del}</span>
                </div>
                <div className="ring-stat-row">
                  <span className="rs-label">{lang === 'ta' ? 'பணம்' : 'Cash'}</span>
                  <span className="rs-value amber">₹{summary.cash.toLocaleString()}</span>
                </div>
                <div className="ring-stat-row">
                  <span className="rs-label">{lang === 'ta' ? 'காலிகள்' : 'Empties'}</span>
                  <span className="rs-value">{summary.emp}</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><h3>{t.summaryTitle}</h3></div>
              <div className="card-body compact">
                <div className="info-row"><span className="info-label">{t.statDel}</span><span className="info-value">{summary.count}</span></div>
                <div className="info-row"><span className="info-label">{t.statCans}</span><span className="info-value">{summary.del}</span></div>
                <div className="info-row"><span className="info-label">{t.statCash}</span><span className="info-value highlight">₹{summary.cash.toLocaleString()}</span></div>
                <div className="info-row"><span className="info-label">{t.statEmp}</span><span className="info-value">{summary.emp}</span></div>
              </div>
            </div>

            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={fetchSummary}>{t.refreshSummary}</button>
          </>
        )}
      </div>
    </div>
  )
}
