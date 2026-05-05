'use client';

import { useEffect, useState, useMemo } from 'react';
import RocketSplash from './RocketSplash';

interface ContractorRow {
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

interface PaymentRow {
  id: number;
  contractorId: number;
  contractorName: string;
  currency: string;
  fortnightStartDate: string;
  fortnightEndDate: string;
  transferAmount: number;
  transferReference: string;
  status: 'scheduled' | 'sent';
  paymentDate: string | null;
  sentAt: string | null;
}

interface PendingEntry {
  id: number;
  contractorId: number;
  contractorName: string;
  currency: string;
  weekCommencing: string;
  hours: number;
  totalFee: number;
  notes: string;
}

interface Globals {
  activeContractors: number;
  mtdHours: number;
  mtdCost: number;
  ytdHours: number;
  ytdCost: number;
  pendingCount: number;
}

const fmtMoney = (n: number, currency: string = 'AUD') =>
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

const fmtFortnight = (start: string, end: string) => {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${e.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
};

export default function ContractorCostsPage() {
  const [contractors, setContractors] = useState<ContractorRow[]>([]);
  const [recentPayments, setRecentPayments] = useState<PaymentRow[]>([]);
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const [globals, setGlobals] = useState<Globals>({
    activeContractors: 0,
    mtdHours: 0,
    mtdCost: 0,
    ytdHours: 0,
    ytdCost: 0,
    pendingCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [approving, setApproving] = useState<number | null>(null);

  const refresh = () => {
    fetch('/api/contractor-overview', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { contractors: [], recentPayments: [], pendingEntries: [], globals: {} }))
      .then((data) => {
        setContractors(data.contractors || []);
        setRecentPayments(data.recentPayments || []);
        setPendingEntries(data.pendingEntries || []);
        setGlobals(data.globals || globals);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const approveEntry = async (id: number) => {
    setApproving(id);
    try {
      const r = await fetch(`/api/contractor-time-entries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'approved' }),
      });
      if (!r.ok) throw new Error(`Failed (${r.status})`);
      refresh();
    } catch (err) {
      alert(`Failed to approve: ${(err as Error).message}`);
    } finally {
      setApproving(null);
    }
  };

  const currencyForGlobals = useMemo(() => {
    const c = contractors[0]?.currency;
    return c || 'AUD';
  }, [contractors]);

  if (loading) return <RocketSplash />;

  return (
    <div className="od-settings">
      <h2 className="od-settings__title">Contractors</h2>
      <p className="od-settings__subtitle">
        Per-contractor rates and totals, fortnightly payments with copyable Wise references, and time entries waiting on agency review. Auto-generated portal links for each contractor below — share the link, they log hours, you approve.
      </p>

      {/* Summary stats */}
      <div className="od-box" style={{ marginBottom: 16 }}>
        <div className="od-box__stats od-box__stats--4">
          <div className="od-box__stat">
            <span className="od-box__stat-value">{globals.activeContractors}</span>
            <span className="od-box__stat-label">Active contractors</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{fmtMoney(globals.mtdCost, currencyForGlobals)}</span>
            <span className="od-box__stat-label">MTD cost ({globals.mtdHours.toFixed(1)}h)</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{fmtMoney(globals.ytdCost, currencyForGlobals)}</span>
            <span className="od-box__stat-label">YTD cost ({globals.ytdHours.toFixed(0)}h)</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value" style={{ color: globals.pendingCount > 0 ? '#d97706' : undefined }}>
              {globals.pendingCount}
            </span>
            <span className="od-box__stat-label">Pending review</span>
          </div>
        </div>
      </div>

      {/* Quick actions row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <a href="/admin/collections/contractors/create" className="od-settings__btn od-settings__btn--primary" style={{ padding: '8px 14px', fontSize: 13, textDecoration: 'none' }}>
          + New contractor
        </a>
        <a href="/admin/collections/contractor-payments/create" className="od-settings__btn" style={{ padding: '8px 14px', fontSize: 13, textDecoration: 'none' }}>
          + New fortnightly payment
        </a>
        <a href="/admin/collections/contractor-time-entries" className="od-settings__btn" style={{ padding: '8px 14px', fontSize: 13, textDecoration: 'none' }}>
          All time entries
        </a>
      </div>

      {/* Contractors */}
      <SectionHeader title="Contractors" subtitle="Rates, weekly hours, and per-contractor totals." />
      <div className="od-box" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={thStyle}>Contractor</th>
              <th style={thStyle}>Rate</th>
              <th style={thStyle}>MTD hrs / cost</th>
              <th style={thStyle}>YTD hrs / cost</th>
              <th style={thStyle}>Next fortnight</th>
              <th style={thStyle}>Last paid</th>
              <th style={{ ...thStyle, textAlign: 'right', paddingRight: 16 }}></th>
            </tr>
          </thead>
          <tbody>
            {contractors.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
                  No active contractors yet. Click <strong>+ New contractor</strong> above to add one.
                </td>
              </tr>
            )}
            {contractors.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.name}</div>
                  {r.email && <div style={{ fontSize: 12, color: '#64748b' }}>{r.email}</div>}
                  {r.pendingCount > 0 && (
                    <a
                      href={`/admin/collections/contractor-time-entries?where[and][0][contractor][equals]=${r.id}&where[and][1][status][equals]=submitted`}
                      style={{ display: 'inline-block', marginTop: 4, padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: 12, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}
                    >
                      {r.pendingCount} entry{r.pendingCount === 1 ? '' : 'ies'} to review
                    </a>
                  )}
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
                  <div style={{ color: '#0f172a' }}>{r.ytd.hours.toFixed(0)}h</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{fmtMoney(r.ytd.cost, r.currency)}</div>
                </td>
                <td style={tdStyle}>
                  {r.next ? (
                    <>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{fmtMoney(r.next.transferAmount, r.currency)}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{fmtDate(r.next.fortnightStartDate)}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ color: '#9ca3af', fontSize: 12 }}>None scheduled</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Est: {fmtMoney(r.estimatedFortnightCost, r.currency)}</div>
                    </>
                  )}
                </td>
                <td style={tdStyle}>
                  {r.lastPaid ? (
                    <>
                      <div style={{ color: '#0f172a' }}>{fmtMoney(r.lastPaid.transferAmount, r.currency)}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{fmtDate(r.lastPaid.paymentDate || r.lastPaid.fortnightStartDate)}</div>
                    </>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>—</span>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', paddingRight: 16, whiteSpace: 'nowrap' }}>
                  <a href={`/admin/collections/contractors/${r.id}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}>
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

      {/* Pending time entries */}
      <SectionHeader
        title="Time entries to review"
        subtitle={pendingEntries.length === 0 ? 'No submissions waiting.' : 'Submitted by contractors and waiting on agency approval before they can roll into a fortnightly payment.'}
        rightAction={
          pendingEntries.length > 0 ? (
            <a href="/admin/collections/contractor-time-entries?where[status][equals]=submitted" style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none' }}>
              Filter all submitted →
            </a>
          ) : null
        }
      />
      {pendingEntries.length > 0 && (
        <div className="od-box" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={thStyle}>Contractor</th>
                <th style={thStyle}>Week</th>
                <th style={thStyle}>Hours</th>
                <th style={thStyle}>Notes</th>
                <th style={{ ...thStyle, textAlign: 'right', paddingRight: 16 }}></th>
              </tr>
            </thead>
            <tbody>
              {pendingEntries.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500, color: '#0f172a' }}>{e.contractorName}</div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ color: '#0f172a' }}>{fmtDate(e.weekCommencing)}</div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{e.hours.toFixed(2)}h</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{fmtMoney(e.totalFee, e.currency)}</div>
                  </td>
                  <td style={{ ...tdStyle, color: '#475569', maxWidth: 280, whiteSpace: 'pre-wrap' }}>
                    {e.notes || <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', paddingRight: 16, whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      onClick={() => approveEntry(e.id)}
                      disabled={approving === e.id}
                      className="od-settings__btn od-settings__btn--primary"
                      style={{ padding: '4px 10px', fontSize: 12, marginRight: 6 }}
                    >
                      {approving === e.id ? 'Approving…' : 'Approve'}
                    </button>
                    <a
                      href={`/admin/collections/contractor-time-entries/${e.id}`}
                      style={{ fontSize: 12, color: '#64748b', textDecoration: 'none' }}
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent payments */}
      <SectionHeader
        title="Recent fortnightly payments"
        subtitle="Latest fortnightly transfers across all contractors. Click a reference to copy it into Wise."
        rightAction={
          <a href="/admin/collections/contractor-payments" style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none' }}>
            View all payments →
          </a>
        }
      />
      <div className="od-box" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={thStyle}>Contractor</th>
              <th style={thStyle}>Fortnight</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Reference</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Sent</th>
              <th style={{ ...thStyle, textAlign: 'right', paddingRight: 16 }}></th>
            </tr>
          </thead>
          <tbody>
            {recentPayments.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                  No payments yet.
                </td>
              </tr>
            )}
            {recentPayments.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 500, color: '#0f172a' }}>{p.contractorName}</div>
                </td>
                <td style={tdStyle}>
                  <div style={{ color: '#0f172a' }}>{fmtFortnight(p.fortnightStartDate, p.fortnightEndDate)}</div>
                </td>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{fmtMoney(p.transferAmount, p.currency)}</div>
                </td>
                <td style={tdStyle}>
                  {p.transferReference ? (
                    <button
                      type="button"
                      onClick={() => handleCopy(p.transferReference, `pay-${p.id}`)}
                      style={{
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
                      {copied === `pay-${p.id}` ? 'Copied!' : p.transferReference}
                    </button>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>—</span>
                  )}
                </td>
                <td style={tdStyle}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600,
                    background: p.status === 'sent' ? '#dcfce7' : '#dbeafe',
                    color: p.status === 'sent' ? '#166534' : '#1e40af',
                  }}>
                    {p.status === 'sent' ? 'Sent' : 'Scheduled'}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: '#475569' }}>{fmtDate(p.paymentDate || p.sentAt)}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', paddingRight: 16 }}>
                  <a href={`/admin/collections/contractor-payments/${p.id}`} style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none' }}>
                    Open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle, rightAction }: { title: string; subtitle?: string; rightAction?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{title}</h3>
        {subtitle && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{subtitle}</p>}
      </div>
      {rightAction}
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
