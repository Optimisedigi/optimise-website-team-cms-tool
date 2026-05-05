'use client';

import { useEffect, useState } from 'react';
import RocketSplash from './RocketSplash';

interface Row {
  id: number;
  name: string;
  email: string | null;
  currency: string;
  hourlyRate: number;
  defaultWeeklyHours: number;
  portalUrl: string | null;
  mtd: { hours: number; cost: number };
  ytd: { hours: number; cost: number };
  lastPaid: {
    fortnightStartDate: string;
    transferAmount: number;
    transferReference: string;
    paymentDate: string | null;
  } | null;
  next: {
    id: number;
    fortnightStartDate: string;
    transferAmount: number;
    transferReference: string;
  } | null;
  estimatedFortnightCost: number;
  pendingCount: number;
}

const fmtMoney = (n: number, currency: string) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function ContractorCostsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/contractor-overview', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { contractors: [] }))
      .then((data) => {
        setRows(data.contractors || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCopy = (ref: string, key: string) => {
    navigator.clipboard.writeText(ref).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  if (loading) return <RocketSplash />;

  return (
    <div className="od-settings">
      <h2 className="od-settings__title">Contractor Costs</h2>
      <p className="od-settings__subtitle">
        Per-contractor MTD / YTD totals, the next scheduled fortnight, and the last sent payment with its Wise reference. Click a reference to copy it.
      </p>

      <div className="od-box" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={thStyle}>Contractor</th>
              <th style={thStyle}>Rate</th>
              <th style={thStyle}>MTD hrs / cost</th>
              <th style={thStyle}>YTD hrs / cost</th>
              <th style={thStyle}>Next fortnight</th>
              <th style={thStyle}>Last paid</th>
              <th style={thStyle}>Pending</th>
              <th style={{ ...thStyle, textAlign: 'right', paddingRight: 16 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
                  No active contractors yet. Create one in <a href="/admin/collections/contractors">Contractors</a>.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.name}</div>
                  {r.email && <div style={{ fontSize: 12, color: '#64748b' }}>{r.email}</div>}
                </td>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{fmtMoney(r.hourlyRate, r.currency)}/hr</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{r.defaultWeeklyHours}h/week default</div>
                </td>
                <td style={tdStyle}>
                  <div style={{ color: '#0f172a' }}>{r.mtd.hours.toFixed(1)}h</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{fmtMoney(r.mtd.cost, r.currency)}</div>
                </td>
                <td style={tdStyle}>
                  <div style={{ color: '#0f172a' }}>{r.ytd.hours.toFixed(1)}h</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{fmtMoney(r.ytd.cost, r.currency)}</div>
                </td>
                <td style={tdStyle}>
                  {r.next ? (
                    <>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>
                        {fmtMoney(r.next.transferAmount, r.currency)}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{fmtDate(r.next.fortnightStartDate)}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ color: '#9ca3af', fontSize: 12 }}>None scheduled</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        Est: {fmtMoney(r.estimatedFortnightCost, r.currency)}
                      </div>
                    </>
                  )}
                </td>
                <td style={tdStyle}>
                  {r.lastPaid ? (
                    <>
                      <div style={{ color: '#0f172a' }}>{fmtMoney(r.lastPaid.transferAmount, r.currency)}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{fmtDate(r.lastPaid.paymentDate || r.lastPaid.fortnightStartDate)}</div>
                      {r.lastPaid.transferReference && (
                        <button
                          type="button"
                          onClick={() => handleCopy(r.lastPaid!.transferReference, `last-${r.id}`)}
                          style={{
                            marginTop: 4,
                            padding: '2px 6px',
                            fontSize: 11,
                            fontFamily: 'monospace',
                            background: '#f8fafc',
                            color: '#475569',
                            border: '1px solid #e2e8f0',
                            borderRadius: 3,
                            cursor: 'pointer',
                          }}
                          title="Click to copy"
                        >
                          {copied === `last-${r.id}` ? 'Copied!' : r.lastPaid.transferReference}
                        </button>
                      )}
                    </>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>—</span>
                  )}
                </td>
                <td style={tdStyle}>
                  {r.pendingCount > 0 ? (
                    <a
                      href={`/admin/collections/contractor-time-entries?where[and][0][contractor][equals]=${r.id}&where[and][1][status][equals]=submitted`}
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        background: '#fef3c7',
                        color: '#92400e',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      {r.pendingCount} to review
                    </a>
                  ) : (
                    <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', paddingRight: 16 }}>
                  <a
                    href={`/admin/collections/contractors/${r.id}`}
                    style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}
                  >
                    Open →
                  </a>
                  {r.portalUrl && (
                    <div style={{ marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => handleCopy(`${window.location.origin}${r.portalUrl}`, `portal-${r.id}`)}
                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 11, padding: 0 }}
                        title="Copy contractor portal link"
                      >
                        {copied === `portal-${r.id}` ? 'Copied!' : 'Copy portal link'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
};

const tdStyle: React.CSSProperties = {
  padding: '12px',
  verticalAlign: 'top',
};
