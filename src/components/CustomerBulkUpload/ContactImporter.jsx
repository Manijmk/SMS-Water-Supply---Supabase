// src/components/CustomerBulkUpload/ContactImporter.jsx

import { useState, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../../supabase/client';
import * as XLSX from 'xlsx';

const STEPS  = { UPLOAD:'upload', PICK:'pick', FILL:'fill', DONE:'done' };
const TYPES  = ['home','shop','walkin'];
const AREAS  = ['Tondiarpet', 'New Washermanpet', 'Kaladipet', 'Tollgate', 'Thiruvotriyur'];

// ─── PARSERS ─────────────────────────────────────────────────

function cleanPhone(raw) {
  if (!raw) return '';
  const d = String(raw).replace(/[\s\-\(\)\+]/g, '');
  const stripped = d.startsWith('91') && d.length === 12 ? d.slice(2) : d;
  return stripped.slice(-10);
}

function parseCSVLine(line) {
  const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
  const cols = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === sep && !inQuote) { cols.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

function parseGoogleCSV(text) {
  const clean = text.replace(/^﻿/, '').replace(/\r/g, '');
  const lines = clean.split('\n').filter(l => l.trim());
  if (!lines.length) return [];

  const headers = parseCSVLine(lines[0]).map(h =>
    h.trim().replace(/^﻿/, '')
  );

  const low = h => h.toLowerCase().trim();

  // Support both Google CSV ("Name") and Outlook CSV ("First Name" + "Last Name")
  const nameIdx      = headers.findIndex(h => low(h) === 'name');
  const firstNameIdx = headers.findIndex(h => low(h) === 'first name');
  const lastNameIdx  = headers.findIndex(h => low(h) === 'last name');

  const hasName      = nameIdx !== -1;
  const hasFirstLast = firstNameIdx !== -1;

  if (!hasName && !hasFirstLast) {
    const found = headers.slice(0, 8).join(', ');
    throw new Error(
      `Could not find name columns.\n\nColumns found: ${found}\n\nOn contacts.google.com → Export → choose "Google CSV" (not Outlook CSV).`
    );
  }

  // Phone columns — covers both formats
  const phoneIdxs = headers
    .map((h, i) => {
      const l = low(h);
      return (
        l === 'phone 1 - value' ||
        l === 'mobile phone'    ||
        l === 'home phone'      ||
        l === 'business phone'  ||
        l.includes('phone')     ||
        l.includes('mobile')    ||
        l.includes('telephone')
      ) ? i : -1;
    })
    .filter(i => i !== -1);

  const contacts = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);

    let name = '';
    if (hasName) {
      name = cols[nameIdx]?.trim() ?? '';
    } else {
      const first = cols[firstNameIdx]?.trim() ?? '';
      const last  = cols[lastNameIdx]?.trim()  ?? '';
      name = [first, last].filter(Boolean).join(' ');
    }
    if (!name) continue;

    let phone = '';
    for (const pi of phoneIdxs) {
      const p = cleanPhone(cols[pi]);
      if (p.length === 10) { phone = p; break; }
    }

    contacts.push({ id: i, name, phone });
  }
  return contacts;
}

function parseVCF(text) {
  const contacts = [];
  let id = 0;
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  for (const card of cards) {
    const fnMatch  = card.match(/^FN[;:](.+)$/m);
    const telMatch = card.match(/^TEL[^:]*:(.+)$/m);
    if (!fnMatch) continue;
    const name  = fnMatch[1].trim().replace(/\\,/g, ',');
    const phone = telMatch ? cleanPhone(telMatch[1].trim()) : '';
    contacts.push({ id: ++id, name, phone });
  }
  return contacts;
}

function parseContactsFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target.result;
        const contacts = file.name.toLowerCase().endsWith('.vcf')
          ? parseVCF(text)
          : parseGoogleCSV(text);
        resolve(contacts.filter(c => c.name));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });
}

// ─── UI HELPERS ───────────────────────────────────────────────

function Avatar({ name }) {
  const initials = name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="avatar-circle" style={{ width: 36, height: 36, fontSize: 13, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function AppSpinner({ size = 20 }) {
  return <div className="spinner" style={{ width: size, height: size, borderWidth: Math.max(2, size / 8) }} />;
}

// ─── STEP 1: UPLOAD ───────────────────────────────────────────

function UploadStep({ onParsed }) {
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [dragging, setDragging] = useState(false);
  const ref = useRef();

  const downloadTemplate = () => {
    const rows = [
      ['name *', 'phone', 'area *', 'type *', 'price_per_can *'],
      ['Rajan Kumar', '9876543210', 'Tondiarpet', 'home', 50],
      ['Sri Stores',  '9845012345', 'Kaladipet',  'shop', 45],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [22, 16, 18, 14, 16].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    XLSX.writeFile(wb, 'customer_template.xlsx');
  };

  const handle = async (file) => {
    if (!file) return;
    if (!/\.(csv|vcf|xlsx|xls)$/i.test(file.name)) {
      setError('Please upload a .csv, .vcf, or .xlsx file');
      return;
    }
    setLoading(true); setError('');
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const buf  = await file.arrayBuffer();
        const wb   = XLSX.read(buf, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (data.length < 2) { setError('Template appears empty'); setLoading(false); return; }
        const [headerRow, ...dataRows] = data;
        const headers = headerRow.map(h => String(h).replace(' *','').trim());
        const nameIdx  = headers.indexOf('name');
        const phoneIdx = headers.indexOf('phone');
        const areaIdx  = headers.indexOf('area');
        const typeIdx  = headers.indexOf('type');
        const priceIdx = headers.indexOf('price_per_can');
        const parsed = dataRows
          .filter(r => r[nameIdx])
          .map((r, i) => ({
            id           : i + 1,
            name         : String(r[nameIdx] ?? '').trim(),
            phone        : cleanPhone(r[phoneIdx]),
            area         : String(r[areaIdx]  ?? '').trim(),
            type         : String(r[typeIdx]  ?? 'home').toLowerCase().trim(),
            price_per_can: parseFloat(r[priceIdx]) || '',
          }));
        onParsed(parsed);
        return;
      }
      const contacts = await parseContactsFile(file);
      if (!contacts.length) throw new Error('No contacts found in this file');
      onParsed(contacts);
    } catch (e) {
      setError(e.message ?? 'Could not read file');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Instructions */}
      <div className="alert alert-info" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <strong style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>
            How to export from Google Contacts
          </strong>
          {[
            ['1', 'Open contacts.google.com on your phone or computer'],
            ['2', 'Tap ☰ Menu → Export'],
            ['3', 'Choose "Google CSV" format'],
            ['4', 'Download the file and upload it below'],
          ].map(([n, text]) => (
            <div key={n} style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'flex-start' }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'rgba(14,165,233,0.2)',
                color: '#0c4a6e',
                fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 1,
              }}>{n}</span>
              <span style={{ fontSize: 13 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => ref.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
        style={{
          border: `2px dashed ${dragging ? 'var(--teal-400)' : 'var(--n-200)'}`,
          background: dragging ? 'var(--teal-50)' : 'var(--n-25)',
          borderRadius: 'var(--radius)',
          padding: '40px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s var(--ease)',
        }}
      >
        <input ref={ref} type="file" accept=".csv,.vcf,.xlsx,.xls" style={{ display: 'none' }}
          onChange={e => handle(e.target.files?.[0])} />
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <AppSpinner size={32} />
            <p style={{ fontSize: 13, color: 'var(--n-500)', fontWeight: 500 }}>Reading contacts…</p>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 40, marginBottom: 12, lineHeight: 1 }}>📱</div>
            <p style={{ fontWeight: 700, color: 'var(--n-800)', fontSize: 15, marginBottom: 6 }}>
              Drop your Google Contacts file here
            </p>
            <p style={{ fontSize: 13, color: 'var(--n-400)' }}>
              or click to browse · .csv, .vcf, .xlsx
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="alert alert-danger" style={{ whiteSpace: 'pre-line' }}>{error}</div>
      )}

      {/* OR / Excel template */}
      <div style={{ borderTop: '1px solid var(--n-100)', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{
          fontSize: 11, textAlign: 'center', color: 'var(--n-400)',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px',
        }}>OR</p>
        <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center' }} onClick={downloadTemplate}>
          📋 Download Excel template instead
        </button>
        <p style={{ fontSize: 12, textAlign: 'center', color: 'var(--n-400)' }}>
          Fill in name, phone, area, type and price — upload the filled file here
        </p>
      </div>

    </div>
  );
}

// ─── STEP 2: CONTACT PICKER ───────────────────────────────────

function ContactPicker({ contacts, onSelected }) {
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState(new Set());

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q)
    );
  }, [contacts, search]);

  const allFilteredSelected = filtered.length > 0 &&
    filtered.every(c => selected.has(c.id));

  const toggle = (id) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelected(s => {
      const n = new Set(s);
      if (allFilteredSelected) { filtered.forEach(c => n.delete(c.id)); }
      else                     { filtered.forEach(c => n.add(c.id));    }
      return n;
    });

  const selectedContacts = contacts.filter(c => selected.has(c.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Search + select-all */}
      <div style={{ paddingBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="search-container" style={{ maxWidth: '100%' }}>
          <span className="search-icon">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${contacts.length} contacts…`}
            className="form-control"
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={toggleAll}
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--teal-600)', padding: '4px 10px' }}
          >
            {allFilteredSelected ? 'Deselect all' : `Select all ${filtered.length}`}
          </button>
          <span style={{ fontSize: 12, color: 'var(--n-400)', fontWeight: 500 }}>
            {filtered.length} shown
          </span>
        </div>
      </div>

      {/* Contact list */}
      <div style={{ overflowY: 'auto', maxHeight: 360, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(c => {
          const isSelected = selected.has(c.id);
          return (
            <label
              key={c.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: `1.5px solid ${isSelected ? 'var(--teal-300)' : 'var(--n-100)'}`,
                background: isSelected ? 'var(--teal-50)' : 'var(--n-0)',
                cursor: 'pointer',
                transition: 'all 0.15s var(--ease)',
              }}
            >
              <input type="checkbox" checked={isSelected} onChange={() => toggle(c.id)} style={{ display: 'none' }} />
              <div style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                border: `2px solid ${isSelected ? 'var(--teal-500)' : 'var(--n-300)'}`,
                background: isSelected ? 'var(--teal-500)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                {isSelected && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <Avatar name={c.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--n-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </p>
                <p style={{ fontSize: 12, color: 'var(--n-400)', marginTop: 2 }}>
                  {c.phone || 'No phone number'}
                </p>
              </div>
            </label>
          );
        })}

        {filtered.length === 0 && (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <span className="empty-icon">🔍</span>
            <h3>No contacts match</h3>
            <p>Try a different name or phone number</p>
          </div>
        )}
      </div>

      {/* Action */}
      <div style={{ paddingTop: 16, borderTop: '1px solid var(--n-100)', marginTop: 12 }}>
        <button
          className="btn btn-primary btn-lg"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => onSelected(selectedContacts)}
          disabled={selected.size === 0}
        >
          {selected.size === 0
            ? 'Select contacts to continue'
            : `Continue with ${selected.size} contact${selected.size !== 1 ? 's' : ''} →`}
        </button>
      </div>
    </div>
  );
}

// ─── STEP 3: BULK FILL ────────────────────────────────────────

function BulkFill({ contacts, onConfirm, onBack, onDraftSaved }) {
  const [rows,     setRows]     = useState(() =>
    contacts.map(c => ({ ...c, area: '', type: 'home', price_per_can: '' }))
  );
  const [defaults, setDefaults] = useState({ area: '', type: 'home', price_per_can: '' });
  const [uploading, setUploading] = useState(false);

  const applyDefaults = () => {
    setRows(r => r.map(row => ({
      ...row,
      area          : defaults.area          || row.area,
      type          : defaults.type          || row.type,
      price_per_can : defaults.price_per_can || row.price_per_can,
    })));
  };

  const updateRow = (id, field, val) =>
    setRows(r => r.map(row => row.id === id ? { ...row, [field]: val } : row));

  const allValid = rows.every(r => r.area && r.price_per_can && parseFloat(r.price_per_can) > 0);

  const handleConfirm = async () => {
    setUploading(true);
    const payload = rows.map(r => ({
      name          : r.name,
      phone         : r.phone || null,
      area          : r.area,
      type          : r.type,
      price_per_can : parseFloat(r.price_per_can),
      active        : true,
    }));
    await onConfirm(payload);
    setUploading(false);
  };

  const handleSaveDraft = async () => {
    setUploading(true);
    const payload = rows.map(r => ({
      name     : r.name,
      phone    : r.phone || null,
      area     : r.area     || null,
      type     : r.type     || 'home',
      price_per_can : parseFloat(r.price_per_can) || 0,
      active   : false,
      is_draft : true,
    }));
    const BATCH = 50;
    let count = 0;
    for (let i = 0; i < payload.length; i += BATCH) {
      const { error } = await supabase
        .from('customers')
        .insert(payload.slice(i, i + BATCH));
      if (!error) count += Math.min(BATCH, payload.length - i);
    }
    setUploading(false);
    onDraftSaved?.(count);
  };

  const cellInput = (missing) => ({
    padding: '6px 10px',
    fontSize: 12,
    border: `1.5px solid ${missing ? 'var(--rose-500)' : 'var(--n-200)'}`,
    background: missing ? 'var(--rose-50)' : undefined,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Apply-to-all panel */}
      <div className="alert alert-warning" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <strong style={{ display: 'block', marginBottom: 14, fontSize: 13 }}>
            Set for all {rows.length} contacts at once
          </strong>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Area</label>
              <select value={defaults.area}
                onChange={e => setDefaults(d => ({ ...d, area: e.target.value }))}
                className="form-control">
                <option value="">Pick area</option>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Type</label>
              <select value={defaults.type}
                onChange={e => setDefaults(d => ({ ...d, type: e.target.value }))}
                className="form-control">
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Price ₹</label>
              <input type="number" value={defaults.price_per_can}
                onChange={e => setDefaults(d => ({ ...d, price_per_can: e.target.value }))}
                placeholder="e.g. 50"
                className="form-control" />
            </div>
          </div>
          <button
            className="btn btn-warning"
            style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}
            onClick={applyDefaults}
            disabled={!defaults.area && !defaults.price_per_can}
          >
            Apply to all rows →
          </button>
        </div>
      </div>

      {/* Per-row table */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="table-wrapper" style={{ maxHeight: 260, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                {['Contact', 'Area *', 'Type *', 'Price/Can ₹ *'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="cell-main">{r.name}</div>
                    <div className="cell-sub">{r.phone || '—'}</div>
                  </td>
                  <td>
                    <select value={r.area}
                      onChange={e => updateRow(r.id, 'area', e.target.value)}
                      className="form-control"
                      style={cellInput(!r.area)}>
                      <option value="">Pick area</option>
                      {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={r.type}
                      onChange={e => updateRow(r.id, 'type', e.target.value)}
                      className="form-control"
                      style={{ padding: '6px 10px', fontSize: 12 }}>
                      {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: 'var(--n-400)', fontSize: 12, fontWeight: 600 }}>₹</span>
                      <input type="number" value={r.price_per_can}
                        onChange={e => updateRow(r.id, 'price_per_can', e.target.value)}
                        placeholder="50"
                        className="form-control"
                        style={{ ...cellInput(!r.price_per_can), width: 72 }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!allValid && (
        <div className="alert alert-danger" style={{ marginBottom: 0 }}>
          Fill in Area and Price for all rows to continue
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="px-5 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            ← Back
          </button>
          <button
            onClick={handleConfirm}
            disabled={!allValid || uploading}
            className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {uploading
              ? <><AppSpinner size={16} /> Uploading…</>
              : `Upload ${rows.length} customers →`}
          </button>
        </div>

        <button
          onClick={handleSaveDraft}
          disabled={uploading}
          className="w-full py-2.5 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          💾 Save {rows.length} contacts as draft — fill details later
        </button>
        <p className="text-xs text-center text-gray-400">
          Drafts are saved to the database. Come back anytime to complete them.
        </p>
      </div>
    </div>
  );
}

// ─── DONE SCREEN ──────────────────────────────────────────────

function DoneScreen({ count, onMore, onFinish }) {
  return (
    <div className="empty-state" style={{ padding: '32px 20px' }}>
      <span className="empty-icon">🎉</span>
      <div style={{
        display: 'inline-block',
        background: 'var(--teal-50)',
        border: '1.5px solid var(--teal-200)',
        borderRadius: 'var(--radius)',
        padding: '20px 48px',
        marginBottom: 16,
      }}>
        <p style={{ fontSize: 48, fontWeight: 800, color: 'var(--teal-700)', letterSpacing: '-2px', lineHeight: 1 }}>
          {count}
        </p>
        <p style={{ fontSize: 13, color: 'var(--teal-600)', marginTop: 6, fontWeight: 600 }}>
          customers added
        </p>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--n-500)', maxWidth: 320, margin: '0 auto 24px' }}>
        All {count} customers are now in the system and ready for delivery assignment.
      </p>
      <div className="btn-group" style={{ justifyContent: 'center' }}>
        <button className="btn btn-ghost" onClick={onMore}>Import more</button>
        <button className="btn btn-primary" onClick={onFinish}>Go to customers →</button>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────

export default function ContactImporter({ onComplete }) {
  const [step,     setStep]     = useState(STEPS.UPLOAD);
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [result,   setResult]   = useState(0);

  const stepLabels = { upload: 'Import file', pick: 'Select contacts', fill: 'Add details' };
  const stepOrder  = [STEPS.UPLOAD, STEPS.PICK, STEPS.FILL, STEPS.DONE];
  const currentIdx = stepOrder.indexOf(step);

  const handleParsed = (allContacts) => {
    if (!allContacts.length) {
      setSelected([]);
      setStep(STEPS.FILL);
    } else {
      setContacts(allContacts);
      setStep(STEPS.PICK);
    }
  };

  const handleSelected = (sel) => {
    setSelected(sel);
    setStep(STEPS.FILL);
  };

  const handleConfirm = useCallback(async (payload) => {
    const BATCH = 50;
    let count = 0;
    for (let i = 0; i < payload.length; i += BATCH) {
      const { error } = await supabase
        .from('customers')
        .insert(payload.slice(i, i + BATCH));
      if (!error) count += Math.min(BATCH, payload.length - i);
    }
    setResult(count);
    setStep(STEPS.DONE);
    onComplete?.(count);
  }, [onComplete]);

  const reset = () => {
    setStep(STEPS.UPLOAD); setContacts([]); setSelected([]); setResult(0);
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>📱 Import from Contacts</h1>
          <p>Import your Google Contacts or fill in an Excel template</p>
        </div>
      </div>

      <div className="page-body">

        {/* Progress stepper */}
        {step !== STEPS.DONE && (
          <div className="status-stepper" style={{ maxWidth: 480, marginBottom: 28 }}>
            {stepOrder.slice(0, 3).map((s, i) => {
              const done   = i < currentIdx;
              const active = i === currentIdx;
              return (
                <div key={s} className={`step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                  <div className="step-dot">{done ? '✓' : i + 1}</div>
                  <span className="step-label">{stepLabels[s]}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Content card */}
        <div className="card animate-in" style={{ maxWidth: 560 }}>
          <div className="card-body">
            {step === STEPS.UPLOAD && <UploadStep onParsed={handleParsed} />}
            {step === STEPS.PICK   && (
              <ContactPicker contacts={contacts} onSelected={handleSelected} />
            )}
            {step === STEPS.FILL   && (
              <BulkFill
                contacts={selected}
                onConfirm={handleConfirm}
                onBack={() => contacts.length ? setStep(STEPS.PICK) : setStep(STEPS.UPLOAD)}
                onDraftSaved={(count) => {
                  setResult(count);
                  setStep(STEPS.DONE);
                }}
              />
            )}
            {step === STEPS.DONE   && (
              <DoneScreen
                count={result}
                onMore={reset}
                onFinish={() => onComplete?.(result)}
              />
            )}
          </div>
        </div>

      </div>
    </>
  );
}
