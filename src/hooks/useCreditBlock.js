// src/hooks/useCreditBlock.js
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export const CREDIT_STATUS = {
  BLOCKED  : 'blocked',
  WARNING  : 'warning',
  WATCH    : 'watch',
  OVERRIDE : 'override',
  CLEAR    : 'clear',
};

export const CREDIT_META = {
  blocked  : { label: 'Blocked',  color: 'text-red-700',   bg: 'bg-red-50',   border: 'border-red-300',   dot: 'bg-red-500',   blocksDelivery: true  },
  warning  : { label: 'Warning',  color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-300', dot: 'bg-amber-400', blocksDelivery: false },
  watch    : { label: 'Watch',    color: 'text-blue-700',  bg: 'bg-blue-50',  border: 'border-blue-200',  dot: 'bg-blue-400',  blocksDelivery: false },
  override : { label: 'Override', color: 'text-violet-700',bg: 'bg-violet-50',border: 'border-violet-200',dot: 'bg-violet-400',blocksDelivery: false },
  clear    : { label: 'Clear',    color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-400', blocksDelivery: false },
};

// ─── HOOK: ALL CREDIT ALERTS (Admin) ─────────────────────────
export function useCreditAlerts() {
  const [alerts,  setAlerts]  = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [alertsRes, summaryRes] = await Promise.all([
        supabase.from('customer_credit_alerts').select('*'),
        supabase.rpc('get_credit_summary'),
      ]);
      if (alertsRes.error)  throw alertsRes.error;
      if (summaryRes.error) throw summaryRes.error;
      setAlerts(alertsRes.data  ?? []);
      setSummary(summaryRes.data ?? {});
    } catch (err) {
      setError(err.message ?? 'Failed to load credit data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    const ch = supabase.channel('credit-customers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, fetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_transactions' }, fetch)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetch]);

  return { alerts, summary, loading, error, refetch: fetch };
}

// ─── HOOK: SINGLE CUSTOMER CREDIT STATUS (Delivery boy) ──────
export function useCustomerCreditStatus(customerId) {
  const [status,  setStatus]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc('get_customer_credit_status', { p_customer_id: customerId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setStatus(data?.[0] ?? null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [customerId]);

  return { status, loading, error };
}

// ─── ACTIONS ──────────────────────────────────────────────────
export async function recordCreditPayment(customerId, amount, mode = 'cash', notes = '') {
  const { error } = await supabase.rpc('record_credit_payment', {
    p_customer_id: customerId,
    p_amount: amount,
    p_mode: mode,
    p_notes: notes || null,
  });
  return { success: !error, error: error?.message ?? null };
}

export async function grantCreditOverride(customerId, note) {
  const { error } = await supabase.rpc('grant_credit_override', {
    p_customer_id: customerId,
    p_note: note,
  });
  return { success: !error, error: error?.message ?? null };
}