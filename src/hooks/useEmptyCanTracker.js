import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase/client'

export const SEVERITY_META = {
  critical: {
    label: 'Critical',
    color: '#ef4444',
    bg: '#fef2f2',
    border: '#fca5a5',
    icon: '🔴',
    desc: 'Overdue > 5 days',
  },
  warning: {
    label: 'Warning',
    color: '#f59e0b',
    bg: '#fffbeb',
    border: '#fcd34d',
    icon: '🟡',
    desc: '3–5 days overdue',
  },
  watch: {
    label: 'Watch',
    color: '#3b82f6',
    bg: '#eff6ff',
    border: '#93c5fd',
    icon: '🔵',
    desc: 'Outstanding, within 2 days',
  },
  ok: {
    label: 'OK',
    color: '#10b981',
    bg: '#ecfdf5',
    border: '#6ee7b7',
    icon: '🟢',
    desc: 'No outstanding empties',
  },
}

function calcSeverity(balance, days) {
  if (!balance || balance <= 0) return 'ok'
  if (days > 5) return 'critical'
  if (days >= 3) return 'warning'
  return 'watch'
}

async function fetchAlertData() {
  // Try the view first (requires migration to be run)
  const { data, error } = await supabase.from('empty_can_alerts').select('*')
  if (!error) return data || []

  // Fallback: direct query against customers + deliveries
  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('id, name, phone, area, empty_balance, created_at')
    .eq('active', true)
    .gt('empty_balance', 0)
  if (custErr) throw custErr
  if (!customers.length) return []

  const ids = customers.map(c => c.id)
  const { data: dels } = await supabase
    .from('deliveries')
    .select('customer_id, date')
    .in('customer_id', ids)

  const lastDelivery = {}
  ;(dels || []).forEach(d => {
    if (d.date && (!lastDelivery[d.customer_id] || d.date > lastDelivery[d.customer_id])) {
      lastDelivery[d.customer_id] = d.date
    }
  })

  const today = new Date()
  return customers
    .map(c => {
      const last = lastDelivery[c.id] || c.created_at?.split('T')[0]
      const days = last ? Math.floor((today - new Date(last)) / 86400000) : 0
      const severity = calcSeverity(c.empty_balance, days)
      return {
        customer_id: c.id,
        name: c.name,
        phone: c.phone,
        area: c.area,
        empty_balance: c.empty_balance,
        days_outstanding: days,
        severity,
      }
    })
    .sort((a, b) => {
      const rank = { critical: 0, warning: 1, watch: 2 }
      return (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3) || b.empty_balance - a.empty_balance
    })
}

export function useEmptyCanAlerts() {
  const [alerts, setAlerts] = useState([])
  const [summary, setSummary] = useState({ total: 0, totalCans: 0, critical: 0, warning: 0, watch: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchAlertData()
      setAlerts(data)
      setSummary({
        total: data.length,
        totalCans: data.reduce((s, d) => s + (d.empty_balance || 0), 0),
        critical: data.filter(d => d.severity === 'critical').length,
        warning: data.filter(d => d.severity === 'warning').length,
        watch: data.filter(d => d.severity === 'watch').length,
      })
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const ch = supabase
      .channel('empty-can-alerts-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, refresh)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [refresh])

  return { alerts, summary, loading, error, refresh }
}

export function useCustomerEmptyStatus(customerId) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(!!customerId)

  const refresh = useCallback(async () => {
    if (!customerId) {
      setLoading(false)
      return
    }
    try {
      // Try RPC first
      const { data: rpc, error: rpcErr } = await supabase
        .rpc('get_customer_empty_status', { p_customer_id: customerId })
      if (!rpcErr && rpc?.[0]) {
        setStatus(rpc[0])
        return
      }

      // Fallback: direct query
      const { data: c } = await supabase
        .from('customers')
        .select('id, name, empty_balance, created_at')
        .eq('id', customerId)
        .single()

      if (!c || !c.empty_balance) {
        setStatus(null)
        return
      }

      const { data: dels } = await supabase
        .from('deliveries')
        .select('date')
        .eq('customer_id', customerId)
        .order('date', { ascending: false })
        .limit(1)

      const last = dels?.[0]?.date || c.created_at?.split('T')[0]
      const days = last ? Math.floor((new Date() - new Date(last)) / 86400000) : 0
      setStatus({
        customer_id: c.id,
        name: c.name,
        empty_balance: c.empty_balance,
        days_outstanding: days,
        severity: calcSeverity(c.empty_balance, days),
      })
    } catch (e) {
      console.error('useCustomerEmptyStatus:', e)
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { refresh() }, [refresh])

  return { status, loading, refresh }
}

export async function recordEmptyCollection(customerId, qty, notes = '') {
  // Try RPC first
  const { data, error: rpcErr } = await supabase.rpc('record_empty_collection', {
    p_customer_id: customerId,
    p_qty: qty,
    p_notes: notes || null,
  })
  if (!rpcErr) return data

  // Fallback: direct update
  const { data: c } = await supabase
    .from('customers')
    .select('empty_balance')
    .eq('id', customerId)
    .single()
  const newBalance = Math.max(0, (c?.empty_balance || 0) - qty)
  const { error } = await supabase
    .from('customers')
    .update({ empty_balance: newBalance })
    .eq('id', customerId)
  if (error) throw error
  return { success: true, new_balance: newBalance }
}
