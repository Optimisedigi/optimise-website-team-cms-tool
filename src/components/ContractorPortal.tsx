'use client';

import { useCallback, useEffect, useState } from 'react';

interface WeekRow {
  weekCommencing: string;
  hours: number | null;
  status: string;
  notes: string;
  locked: boolean;
}

interface Props {
  token: string;
  contractorId: number;
  contractorName: string;
  defaultWeeklyHours: number;
}

const STATUS_LABEL: Record<string, { label: string; bg: string; fg: string }> = {
  empty: { label: 'Not logged', bg: '#f1f5f9', fg: '#64748b' },
  draft: { label: 'Draft', bg: '#fef3c7', fg: '#92400e' },
  submitted: { label: 'Submitted', bg: '#dbeafe', fg: '#1e40af' },
  approved: { label: 'Approved', bg: '#dcfce7', fg: '#166534' },
  paid: { label: 'Paid', bg: '#e0e7ff', fg: '#3730a3' },
};

function fmtWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ContractorPortal({ token, contractorName, defaultWeeklyHours }: Props) {
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { hours: string; notes: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingWeek, setSavingWeek] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/contractor/${token}?weeks=8`, { cache: 'no-store' });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${r.status})`);
      }
      const data = await r.json();
      setWeeks(data.weeks);
      const initialDrafts: Record<string, { hours: string; notes: string }> = {};
      for (const w of data.weeks as WeekRow[]) {
        initialDrafts[w.weekCommencing] = {
          hours: w.hours != null ? String(w.hours) : '',
          notes: w.notes || '',
        };
      }
      setDrafts(initialDrafts);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateDraft = (week: string, patch: Partial<{ hours: string; notes: string }>) => {
    setDrafts((d) => ({ ...d, [week]: { ...d[week], ...patch } }));
  };

  const handleSave = async (week: string, action: 'save' | 'submit') => {
    const draft = drafts[week];
    if (!draft) return;
    const hours = Number(draft.hours);
    if (!Number.isFinite(hours) || hours < 0) {
      setToast('Hours must be a number ≥ 0');
      setTimeout(() => setToast(null), 2500);
      return;
    }
    setSavingWeek(week);
    setError(null);
    try {
      const r = await fetch(`/api/contractor/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekCommencing: week,
          hours,
          notes: draft.notes,
          action,
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${r.status})`);
      }
      setToast(action === 'submit' ? 'Submitted for review' : 'Saved');
      setTimeout(() => setToast(null), 2000);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingWeek(null);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '32px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Hi {contractorName}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>
            Log your hours for each week below. Save as you go and submit when the week is finished. Default {defaultWeeklyHours}h/week.
          </p>
        </div>

        {toast && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 8, color: '#166534', fontSize: 13 }}>
            {toast}
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading && weeks.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {weeks.slice().reverse().map((w) => {
              const status = STATUS_LABEL[w.status] || STATUS_LABEL.empty;
              const draft = drafts[w.weekCommencing] || { hours: '', notes: '' };
              const isSaving = savingWeek === w.weekCommencing;
              return (
                <div
                  key={w.weekCommencing}
                  style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: 16,
                    opacity: w.locked ? 0.7 : 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
                        Week of {fmtWeek(w.weekCommencing)}
                      </div>
                    </div>
                    <span style={{ padding: '4px 10px', borderRadius: 12, background: status.bg, color: status.fg, fontSize: 12, fontWeight: 600 }}>
                      {status.label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                    <label style={{ fontSize: 13, color: '#475569', minWidth: 60 }}>Hours</label>
                    <input
                      type="number"
                      min={0}
                      max={168}
                      step={0.25}
                      value={draft.hours}
                      onChange={(e) => updateDraft(w.weekCommencing, { hours: e.target.value })}
                      disabled={w.locked || isSaving}
                      style={{ padding: '8px 12px', fontSize: 16, fontWeight: 600, border: '2px solid #cbd5e1', borderRadius: 8, width: 120, outline: 'none' }}
                    />
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>(default {defaultWeeklyHours})</span>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 4 }}>
                      Notes <span style={{ color: '#94a3b8' }}>(optional — what you worked on)</span>
                    </label>
                    <textarea
                      value={draft.notes}
                      onChange={(e) => updateDraft(w.weekCommencing, { notes: e.target.value })}
                      disabled={w.locked || isSaving}
                      rows={2}
                      style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 8, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </div>

                  {!w.locked && (
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleSave(w.weekCommencing, 'save')}
                        disabled={isSaving}
                        style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: isSaving ? 'not-allowed' : 'pointer' }}
                      >
                        Save draft
                      </button>
                      <button
                        onClick={() => handleSave(w.weekCommencing, 'submit')}
                        disabled={isSaving}
                        style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: isSaving ? 'not-allowed' : 'pointer' }}
                      >
                        {isSaving ? 'Saving…' : 'Submit for review'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 24, padding: '12px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
          Status guide: <strong>Draft</strong> — saved but not yet sent. <strong>Submitted</strong> — waiting on review. <strong>Approved</strong> / <strong>Paid</strong> — locked.
        </div>
      </div>
    </div>
  );
}
