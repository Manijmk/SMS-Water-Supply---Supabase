import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../hooks/useLang'
import toast from 'react-hot-toast'

const emoji = { pending: '🕐', out_for_delivery: '🚛', delivered: '✅', cancelled: '❌', pending_confirmation: '🔔' }

const STEP_STATES = {
  pending_confirmation: ['active', 'pending', 'pending'],
  pending:              ['active', 'pending', 'pending'],
  out_for_delivery:     ['done',   'active',  'pending'],
  delivered:            ['done',   'done',    'done'],
}

const T = {
  en: {
    tabs:            ['🏠 Home', '📦 Order', '📋 History'],
    steps:           ['Placed', 'En Route', 'Delivered'],
    stepIcons:       ['📋', '🚛', '✅'],
    dueAlert:        (amt) => `⚠️ Pending due: ₹${amt}. Please pay on next delivery.`,
    emptyAlert:      (n) => `♻️ ${n} empty cans — keep them ready!`,
    statDue:         'Due Amount',
    statEmpty:       'Empty Cans',
    todayDelivery:   "📦 Today's Delivery",
    yourInfo:        'ℹ️ Your Info',
    labelQty:        'Quantity',
    labelAmt:        'Amount',
    labelNotes:      'Notes',
    labelArea:       'Area',
    labelType:       'Type',
    labelRate:       'Rate',
    cancelOrder:     'Cancel Order',
    noOrderToday:    'No order for today',
    placeOneBtn:     '+ Place Order',
    refresh:         '🔄 Refresh',
    orderTitle:      'Place Order',
    orderSub:        (price) => `₹${price} per can`,
    cansLabel:       'cans',
    totalAmtLabel:   'Total Amount',
    deliveryDate:    'Delivery Date',
    notesPlaceholder:'Special instructions...',
    placeOrderBtn:   'Place Order →',
    placing:         '⏳ Placing...',
    noOrdersYet:     'No orders yet',
    noOrdersHint:    'Place your first order!',
    historyAmt:      'Amount',
    historyNotes:    'Notes',
    historyCancel:   'Cancel',
    switchLang:      'தமிழ்',
  },
  ta: {
    tabs:            ['🏠 முகப்பு', '📦 ஆர்டர்', '📋 வரலாறு'],
    steps:           ['வைக்கப்பட்டது', 'வழியில்', 'டெலிவரி ஆனது'],
    stepIcons:       ['📋', '🚛', '✅'],
    dueAlert:        (amt) => `⚠️ நிலுவைத் தொகை: ₹${amt}. அடுத்த டெலிவரியில் செலுத்தவும்.`,
    emptyAlert:      (n) => `♻️ ${n} காலி கேன்கள் — தயாராக வைக்கவும்!`,
    statDue:         'நிலுவைத் தொகை',
    statEmpty:       'காலி கேன்கள்',
    todayDelivery:   '📦 இன்றைய டெலிவரி',
    yourInfo:        'ℹ️ உங்கள் தகவல்',
    labelQty:        'அளவு',
    labelAmt:        'தொகை',
    labelNotes:      'குறிப்புகள்',
    labelArea:       'பகுதி',
    labelType:       'வகை',
    labelRate:       'விலை',
    cancelOrder:     'ஆர்டர் ரத்துசெய்',
    noOrderToday:    'இன்று ஆர்டர் இல்லை',
    placeOneBtn:     '+ ஆர்டர் போடு',
    refresh:         '🔄 புதுப்பி',
    orderTitle:      'ஆர்டர் போடு',
    orderSub:        (price) => `₹${price} ஒரு கேனுக்கு`,
    cansLabel:       'கேன்கள்',
    totalAmtLabel:   'மொத்த தொகை',
    deliveryDate:    'டெலிவரி தேதி',
    notesPlaceholder:'சிறப்பு அறிவுறுத்தல்கள்...',
    placeOrderBtn:   'ஆர்டர் போடு →',
    placing:         '⏳ போடுகிறது...',
    noOrdersYet:     'இன்னும் ஆர்டர்கள் இல்லை',
    noOrdersHint:    'உங்கள் முதல் ஆர்டரை போடுங்கள்!',
    historyAmt:      'தொகை',
    historyNotes:    'குறிப்பு',
    historyCancel:   'ரத்துசெய்',
    switchLang:      'EN',
  },
}

const getInitials = (name) =>
  name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'CU'

export default function CustomerPanel() {
  const { user, linkedId, signOut } = useAuth()
  const navigate = useNavigate()
  const [lang, toggleLang] = useLang()
  const t = T[lang]
  const today = new Date().toISOString().split('T')[0]

  const [tab, setTab] = useState('home')
  const [cust, setCust] = useState(null)
  const [orders, setOrders] = useState([])
  const [todayOrder, setTodayOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [placing, setPlacing] = useState(false)
  const [of, setOf] = useState({ quantity: 1, delivery_date: today, notes: '' })

  const linkedIdRef = useRef(linkedId)
  const fetchRef = useRef(null)

  useEffect(() => { linkedIdRef.current = linkedId }, [linkedId])

  const fetchCust = useCallback(async () => {
    const id = linkedIdRef.current
    if (!id) return
    try {
      const { data, error } = await supabase.from('customers').select('*').eq('id', id).single()
      if (error) throw error
      setCust(data)
    } catch (err) {
      console.error('Fetch customer error:', err)
    }
  }, [])

  const fetchOrders = useCallback(async () => {
    const id = linkedIdRef.current
    if (!id) return
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', id)
        .order('delivery_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      setOrders(data || [])
      setTodayOrder(data?.find(o => o.delivery_date === today && o.status !== 'cancelled') || null)
    } catch (err) {
      console.error('Fetch orders error:', err)
    }
  }, [today])

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchCust(), fetchOrders()])
    setLoading(false)
  }, [fetchCust, fetchOrders])

  useEffect(() => { fetchRef.current = fetchAll }, [fetchAll])

  useEffect(() => {
    if (!linkedId) { setLoading(false); return }
    fetchAll()

    const channel = supabase
      .channel('customer-rt-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        const id = linkedIdRef.current
        if (payload.new?.customer_id === id || payload.old?.customer_id === id) {
          fetchRef.current?.()
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
        if (payload.new?.id === linkedIdRef.current) setCust(payload.new)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => {
        fetchRef.current?.()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [linkedId])

  const place = async () => {
    if (!cust) return toast.error('Customer data not loaded')
    const qty = parseInt(of.quantity) || 1
    if (qty <= 0) return toast.error('Quantity must be at least 1')

    setPlacing(true)
    try {
      const { error } = await supabase.from('orders').insert({
        customer_id: cust.id,
        customer_name: cust.name,
        area: cust.area,
        quantity: qty,
        delivery_date: of.delivery_date,
        status: 'pending',
        notes: of.notes,
      })
      if (error) throw error
      toast.success('Order placed! 🎉')
      setTab('home')
      setOf({ quantity: 1, delivery_date: today, notes: '' })
      await fetchOrders()
    } catch (err) {
      toast.error('Failed: ' + err.message)
    } finally {
      setPlacing(false)
    }
  }

  const cancel = async id => {
    if (!confirm('Cancel this order?')) return
    try {
      const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id)
      if (error) throw error
      toast.success('Order cancelled')
      await fetchOrders()
    } catch (err) {
      toast.error('Failed: ' + err.message)
    }
  }

  const totalOrders     = orders.length
  const deliveredOrders = orders.filter(o => o.status === 'delivered').length
  const totalSpent      = orders
    .filter(o => o.status === 'delivered')
    .reduce((s, o) => s + (o.quantity || 0) * (cust?.price_per_can || 40), 0)

  if (loading) return <div className="loading-screen"><div className="spinner" /><p>Loading...</p></div>

  if (!cust) {
    return (
      <div className="loading-screen">
        <p>Customer profile not found. Contact admin.</p>
        <button className="btn btn-ghost" onClick={async () => { await signOut(); navigate('/login') }}>Sign Out</button>
      </div>
    )
  }

  return (
    <div className="mobile-panel">
      <div className="mobile-header">
        <div className="header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="avatar-circle">{getInitials(cust.name)}</div>
            <div>
              <h1 style={{ fontSize: 16 }}>👋 {cust.name}</h1>
              <p>💧 SMS Water Supply</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={toggleLang}
              className="btn btn-sm btn-ghost"
              style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, padding: '4px 10px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20 }}
            >
              {t.switchLang}
            </button>
            <button
              className="btn btn-sm btn-ghost"
              style={{ color: 'rgba(255,255,255,0.7)' }}
              onClick={async () => { await signOut(); navigate('/login') }}
            >
              🚪
            </button>
          </div>
        </div>
        <div className="header-stats-row">
          <div className="header-stat">
            <div className="hs-val">{totalOrders}</div>
            <div className="hs-lbl">{lang === 'ta' ? 'ஆர்டர்கள்' : 'Orders'}</div>
          </div>
          <div className="header-stat">
            <div className="hs-val">{deliveredOrders}</div>
            <div className="hs-lbl">{lang === 'ta' ? 'டெலிவரி ஆனது' : 'Delivered'}</div>
          </div>
          <div className="header-stat">
            <div className="hs-val">₹{totalSpent.toLocaleString()}</div>
            <div className="hs-lbl">{lang === 'ta' ? 'மொத்த செலவு' : 'Total Spent'}</div>
          </div>
        </div>
      </div>

      <div className="mobile-tabs">
        {['home', 'order', 'history'].map((key, i) => (
          <button
            key={key}
            className={`mobile-tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {t.tabs[i]}
          </button>
        ))}
      </div>

      <div key={tab} className="mobile-content tab-fade">

        {/* ═══ HOME TAB ═══ */}
        {tab === 'home' && (
          <>
            {cust.due_amount > 0 && (
              <div className="alert alert-danger">{t.dueAlert(cust.due_amount)}</div>
            )}
            {cust.empty_balance > 2 && (
              <div className="alert alert-warning">{t.emptyAlert(cust.empty_balance)}</div>
            )}

            <div className="customer-stats">
              <div className={`mini-stat ${cust.due_amount > 0 ? 'rose' : 'emerald'}`}>
                <div className="mini-value">₹{cust.due_amount || 0}</div>
                <div className="mini-label">{t.statDue}</div>
              </div>
              <div className={`mini-stat ${cust.empty_balance > 2 ? 'amber' : 'teal'}`}>
                <div className="mini-value">{cust.empty_balance || 0}</div>
                <div className="mini-label">{t.statEmpty}</div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><h3>{t.todayDelivery}</h3></div>
              <div className="card-body">
                {todayOrder ? (
                  <div>
                    <div className="status-stepper">
                      {t.steps.map((label, i) => {
                        const state = (STEP_STATES[todayOrder.status] || ['active', 'pending', 'pending'])[i]
                        return (
                          <div key={i} className={`step ${state}`}>
                            <div className="step-dot">{state === 'done' ? '✓' : t.stepIcons[i]}</div>
                            <div className="step-label">{label}</div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="info-row">
                      <span className="info-label">{t.labelQty}</span>
                      <span className="info-value">{todayOrder.quantity} {t.cansLabel}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">{t.labelAmt}</span>
                      <span className="info-value highlight">₹{(todayOrder.quantity || 0) * (cust.price_per_can || 40)}</span>
                    </div>
                    {todayOrder.notes && (
                      <div className="info-row">
                        <span className="info-label">{t.labelNotes}</span>
                        <span className="info-value">{todayOrder.notes}</span>
                      </div>
                    )}
                    {todayOrder.status === 'pending' && (
                      <button className="btn btn-danger btn-sm" style={{ width: '100%', marginTop: 14 }} onClick={() => cancel(todayOrder.id)}>
                        {t.cancelOrder}
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 24 }}>
                    <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>📭</span>
                    <p style={{ color: 'var(--n-400)', marginBottom: 14 }}>{t.noOrderToday}</p>
                    <button className="btn btn-primary btn-sm" onClick={() => setTab('order')}>{t.placeOneBtn}</button>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><h3>{t.yourInfo}</h3></div>
              <div className="card-body compact">
                <div className="info-row"><span className="info-label">{t.labelArea}</span><span className="info-value">{cust.area}</span></div>
                <div className="info-row"><span className="info-label">{t.labelType}</span><span className={`badge badge-${cust.type}`}>{cust.type}</span></div>
                <div className="info-row"><span className="info-label">{t.labelRate}</span><span className="info-value">₹{cust.price_per_can}/{lang === 'ta' ? 'கேன்' : 'can'}</span></div>
              </div>
            </div>

            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={fetchAll}>{t.refresh}</button>
          </>
        )}

        {/* ═══ ORDER TAB ═══ */}
        {tab === 'order' && (
          <div className="info-card" style={{ padding: 28 }}>
            <h3 style={{ textAlign: 'center', fontWeight: 800, fontSize: 18 }}>{t.orderTitle}</h3>
            <p style={{ textAlign: 'center', color: 'var(--n-400)', fontSize: 13, marginBottom: 8 }}>{t.orderSub(cust.price_per_can)}</p>

            <div className="can-selector">
              <button className="can-btn" onClick={() => setOf({ ...of, quantity: Math.max(1, parseInt(of.quantity) - 1) })}>−</button>
              <div className="can-display">
                <div className="can-count">{of.quantity}</div>
                <div className="can-label">{t.cansLabel}</div>
              </div>
              <button className="can-btn" onClick={() => setOf({ ...of, quantity: parseInt(of.quantity) + 1 })}>+</button>
            </div>

            <div className="amount-box">
              <div className="amount-label">{t.totalAmtLabel}</div>
              <div className="amount-value">₹{(parseInt(of.quantity) || 0) * cust.price_per_can}</div>
            </div>

            <div className="form-group">
              <label>{t.deliveryDate}</label>
              <input type="date" className="form-control" value={of.delivery_date} onChange={e => setOf({ ...of, delivery_date: e.target.value })} min={today} />
            </div>

            <div className="form-group">
              <label>{t.labelNotes}</label>
              <textarea className="form-control" value={of.notes} onChange={e => setOf({ ...of, notes: e.target.value })} rows={2} placeholder={t.notesPlaceholder} />
            </div>

            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={place} disabled={placing}>
              {placing ? t.placing : t.placeOrderBtn}
            </button>
          </div>
        )}

        {/* ═══ HISTORY TAB ═══ */}
        {tab === 'history' && (
          orders.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📋</span>
              <h3>{t.noOrdersYet}</h3>
              <p>{t.noOrdersHint}</p>
            </div>
          ) : (
            orders.map((o, i) => (
              <div key={o.id} className="info-card" style={{ animationDelay: `${i * 0.03}s` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4>{o.quantity} {t.cansLabel}</h4>
                    <div className="meta">{o.delivery_date}</div>
                  </div>
                  <span className={`badge badge-${o.status}`}>
                    <span className="dot" />{emoji[o.status]} {o.status?.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">{t.historyAmt}</span>
                  <span className="info-value">₹{(o.quantity || 0) * (cust.price_per_can || 40)}</span>
                </div>
                {o.notes && (
                  <div className="info-row">
                    <span className="info-label">{t.historyNotes}</span>
                    <span className="info-value">{o.notes}</span>
                  </div>
                )}
                {o.status === 'pending' && o.delivery_date >= today && (
                  <button className="btn btn-sm btn-danger" style={{ marginTop: 10 }} onClick={() => cancel(o.id)}>
                    {t.historyCancel}
                  </button>
                )}
              </div>
            ))
          )
        )}
      </div>
    </div>
  )
}
