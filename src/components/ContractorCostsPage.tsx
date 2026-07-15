'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import RocketSplash from './RocketSplash';

interface ContractorRow {
  id: number;
  name: string;
  email: string | null;
  currency: string;
  hourlyRate: number;
  reimbursement: { amount: number; recurrence: string; startDate: string | null };
  mtd: { hours: number; cost: number };
  totalHours: number;
  totalPaid: number;
  latestWeek: {
    weekCommencing: string;
    hours: number;
    clientAllocations: { clientName: string; hours: number }[];
  } | null;
}

interface FortnightPayment {
  id: string;
  contractorId: number;
  contractorName: string;
  currency: string;
  fortnightStartDate: string;
  fortnightEndDate: string | null;
  totalHours: number;
  subtotal: number;
  reimbursement: number;
  fee: number;
  amount: number;
  transferReference: string;
  status: 'paid' | 'unpaid';
  paidDate: string | null;
}

interface Globals {
  activeContractors: number;
  owingNow: number;
  totalPaid: number;
  totalHours: number;
}

const EMPTY_GLOBALS: Globals = { activeContractors: 0, owingNow: 0, totalPaid: 0, totalHours: 0 };

const fmtMoney = (amount: number, currency = 'AUD') => new Intl.NumberFormat('en-AU', {
  style: 'currency', currency, maximumFractionDigits: 0,
}).format(amount);

const fmtDate = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

const fmtFortnight = (start: string, end: string | null) => {
  if (!end) return fmtDate(start);
  const options = { day: '2-digit', month: 'short' } as const;
  return `${new Date(start).toLocaleDateString('en-GB', options)} to ${new Date(end).toLocaleDateString('en-GB', options)}`;
};

const thStyle = { padding: '10px 12px', textAlign: 'left' as const, fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' as const };
const tdStyle = { padding: '12px', verticalAlign: 'top' as const, color: '#334155' };
const tooltipButtonStyle = { padding: 0, border: 0, background: 'none', color: '#0f172a', cursor: 'help', font: 'inherit', fontWeight: 600, textAlign: 'left' as const, textDecoration: 'underline', textUnderlineOffset: 3 };

function HoverTooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();

  // Position a fixed-layer tooltip below the trigger. Rendering in a portal
  // escapes the table's horizontal-scroll clipping so it is never cut off.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 6, left: rect.left });
  }, [open]);

  return (
    <span style={{ display: 'inline-block' }}>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={tooltipButtonStyle}
        aria-describedby={open ? tooltipId : undefined}
      >
        {label}
      </button>
      {open && coords && typeof document !== 'undefined' && createPortal(
        <span
          id={tooltipId}
          role="tooltip"
          style={{ position: 'fixed', zIndex: 9999, top: coords.top, left: coords.left, minWidth: 190, maxWidth: 300, padding: '8px 10px', borderRadius: 4, background: '#0f172a', color: '#fff', fontSize: 12, fontWeight: 400, lineHeight: 1.45, boxShadow: '0 4px 12px rgba(15, 23, 42, .2)', pointerEvents: 'none' }}
        >
          {children}
        </span>,
        document.body,
      )}
    </span>
  );
}

const RECURRENCE_LABEL: Record<string, string> = {
  none: 'none',
  'per-fortnight': 'every fortnight',
  monthly: 'monthly',
  'one-off': 'one-off',
};

function reimbursementSummary(reimbursement: ContractorRow['reimbursement'], currency: string): string {
  if (!reimbursement.amount || reimbursement.recurrence === 'none') return 'No reimbursement';
  const recurrence = RECURRENCE_LABEL[reimbursement.recurrence] || reimbursement.recurrence;
  const from = reimbursement.startDate ? ` from ${fmtDate(reimbursement.startDate)}` : '';
  return `${fmtMoney(reimbursement.amount, currency)} ${recurrence}${from}`;
}

export default function ContractorCostsPage() {
  const [contractors, setContractors] = useState<ContractorRow[]>([]);
  const [payments, setPayments] = useState<FortnightPayment[]>([]);
  const [globals, setGlobals] = useState<Globals>(EMPTY_GLOBALS);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => fetch('/api/contractor-overview', { credentials: 'include' })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('Could not load contractor costs.')))
    .then((data) => {
      setContractors(data.contractors || []);
      setPayments(data.fortnightlyPayments || []);
      setGlobals(data.globals || EMPTY_GLOBALS);
      setError(null);
    })
    .catch(() => setError('Could not load contractor costs. Refresh to try again.'));

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markPaid = async (payment: FortnightPayment) => {
    if (marking) return;
    setMarking(payment.id);
    setError(null);
    try {
      const response = await fetch('/api/contractor-payments/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ contractorId: payment.contractorId, fortnightStartDate: payment.fortnightStartDate }),
      });
      if (!response.ok) throw new Error('mark-paid failed');
      await load();
    } catch {
      setError('Could not mark this fortnight as paid. Try again.');
    } finally {
      setMarking(null);
    }
  };

  const currency = useMemo(() => contractors[0]?.currency || 'AUD', [contractors]);
  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  if (loading) return <RocketSplash />;

  return (
    <main className="od-settings" aria-labelledby="contractor-costs-heading">
      <div className="od-box" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', paddingBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
          <div>
            <h2 id="contractor-costs-heading" className="od-settings__title" style={{ marginBottom: 4 }}>Contractor costs</h2>
            <p className="od-settings__subtitle" style={{ margin: 0 }}>Prepare fortnightly transfers from logged contractor hours.</p>
          </div>
          <nav aria-label="Contractor cost actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href="/admin/collections/contractors/create" className="od-settings__btn od-settings__btn--primary" style={{ padding: '8px 14px', fontSize: 13, textDecoration: 'none' }}>New contractor</a>
            <a href="/admin/collections/contractor-time-entries" className="od-settings__btn" style={{ padding: '8px 14px', fontSize: 13, textDecoration: 'none' }}>All time entries</a>
          </nav>
        </div>
        <div className="od-box__stats od-box__stats--4" style={{ paddingTop: 16 }}>
          <div className="od-box__stat"><span className="od-box__stat-value">{globals.activeContractors}</span><span className="od-box__stat-label">Active contractors</span></div>
          <div className="od-box__stat"><span className="od-box__stat-value" style={{ color: globals.owingNow > 0 ? '#b45309' : undefined }}>{fmtMoney(globals.owingNow, currency)}</span><span className="od-box__stat-label">Owing now (unpaid)</span></div>
          <div className="od-box__stat"><span className="od-box__stat-value">{fmtMoney(globals.totalPaid, currency)}</span><span className="od-box__stat-label">Total paid</span></div>
          <div className="od-box__stat"><span className="od-box__stat-value">{globals.totalHours.toFixed(1)}h</span><span className="od-box__stat-label">Total hours worked</span></div>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>{error}</div>
      )}

      <section aria-labelledby="payments-heading">
        <h3 id="payments-heading" style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Fortnightly payments</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>Auto-built from approved time entries in 14-day fortnights (anchored 29 Jun 2026). Copy the transfer reference into Wise, then mark the fortnight paid.</p>
        <div className="od-box" style={{ padding: 0, overflowX: 'auto', marginBottom: 24 }}>
          <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}><tr>
              <th style={thStyle}>Contractor</th><th style={thStyle}>Fortnight</th><th style={thStyle}>Logged hours</th><th style={thStyle}>Amount</th><th style={thStyle}>Reference</th><th style={thStyle}>Status</th><th style={{ ...thStyle, textAlign: 'right' }}>Action</th>
            </tr></thead>
            <tbody>{payments.length === 0 ? <tr><td colSpan={7} style={{ ...tdStyle, padding: 28, textAlign: 'center', color: '#64748b' }}>No approved time entries yet. Approve a contractor&apos;s weeks to build a fortnightly payment.</td></tr> : payments.map((payment) => (
              <tr key={payment.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={tdStyle}><strong>{payment.contractorName}</strong></td>
                <td style={tdStyle}>{fmtFortnight(payment.fortnightStartDate, payment.fortnightEndDate)}</td>
                <td style={tdStyle}>{payment.totalHours.toFixed(2)}h</td>
                <td style={tdStyle}>
                  <HoverTooltip label={fmtMoney(payment.amount, payment.currency)}>
                    <span style={{ display: 'block' }}>Hours: {fmtMoney(payment.subtotal, payment.currency)}</span>
                    <span style={{ display: 'block' }}>Reimbursement: {fmtMoney(payment.reimbursement, payment.currency)}</span>
                    <span style={{ display: 'block' }}>Transfer fee: {fmtMoney(payment.fee, payment.currency)}</span>
                  </HoverTooltip>
                </td>
                <td style={tdStyle}>{payment.transferReference ? <button type="button" onClick={() => handleCopy(payment.transferReference, payment.id)} style={{ padding: '3px 7px', border: '1px solid #cbd5e1', borderRadius: 3, background: '#f8fafc', color: '#334155', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11 }}>{copied === payment.id ? 'Copied' : payment.transferReference}</button> : '—'}</td>
                <td style={tdStyle}>{payment.status === 'paid'
                  ? <span style={{ fontWeight: 600, color: '#166534' }}>Paid{payment.paidDate ? ` · ${fmtDate(payment.paidDate)}` : ''}</span>
                  : <span style={{ fontWeight: 600, color: '#b45309' }}>Unpaid</span>}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{payment.status === 'unpaid'
                  ? <button type="button" onClick={() => markPaid(payment)} disabled={marking === payment.id} className="od-settings__btn od-settings__btn--primary" style={{ padding: '5px 11px', fontSize: 12, cursor: marking === payment.id ? 'default' : 'pointer', opacity: marking === payment.id ? 0.6 : 1 }}>{marking === payment.id ? 'Saving…' : 'Mark paid'}</button>
                  : <span style={{ color: '#94a3b8' }}>—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <details style={{ marginBottom: 24 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#0f172a', padding: '8px 0' }}>Contractors ({contractors.length})</summary>
        <p style={{ margin: '4px 0 12px', fontSize: 13, color: '#64748b' }}>Rates, reimbursements, monthly costs, all-time totals, and the latest submitted week. Open a contractor to edit its rate and reimbursement (amount, recurrence, and start date).</p>
        <div className="od-box" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}><tr><th style={thStyle}>Contractor</th><th style={thStyle}>Rate</th><th style={thStyle}>Reimbursement</th><th style={thStyle}>Monthly cost</th><th style={thStyle}>Total paid / hours</th><th style={thStyle}>Latest logged week</th></tr></thead>
            <tbody>{contractors.length === 0 ? <tr><td colSpan={6} style={{ ...tdStyle, padding: 28, textAlign: 'center', color: '#64748b' }}>No active contractors yet.</td></tr> : contractors.map((contractor) => (
              <tr key={contractor.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={tdStyle}><HoverTooltip label={contractor.name}>{contractor.latestWeek ? `Latest week: ${contractor.latestWeek.hours.toFixed(2)} hours` : 'No logged weeks yet.'}</HoverTooltip>{contractor.email && <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{contractor.email}</div>}<div style={{ marginTop: 4 }}><a href={`/admin/collections/contractors/${contractor.id}`} style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>Edit rate &amp; reimbursement</a></div></td>
                <td style={tdStyle}>{fmtMoney(contractor.hourlyRate, contractor.currency)}/hr</td>
                <td style={tdStyle}>{reimbursementSummary(contractor.reimbursement, contractor.currency)}</td>
                <td style={tdStyle}>{fmtMoney(contractor.mtd.cost, contractor.currency)}<div style={{ fontSize: 12, color: '#64748b' }}>{contractor.mtd.hours.toFixed(1)}h this month</div></td>
                <td style={tdStyle}>{fmtMoney(contractor.totalPaid, contractor.currency)}<div style={{ fontSize: 12, color: '#64748b' }}>{contractor.totalHours.toFixed(1)}h logged</div></td>
                <td style={tdStyle}>{contractor.latestWeek ? <HoverTooltip label={fmtDate(contractor.latestWeek.weekCommencing)}>{contractor.latestWeek.clientAllocations.length ? contractor.latestWeek.clientAllocations.map((allocation) => <span key={allocation.clientName} style={{ display: 'block' }}>{allocation.clientName}: {allocation.hours.toFixed(2)}h</span>) : 'No client allocations'}</HoverTooltip> : 'No logged weeks'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </main>
  );
}
