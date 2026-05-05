'use client';

interface SplitTotals {
  phone: number;
  form: number;
  other: number;
}

interface SplitByCampaign {
  name: string;
  phone: number;
  form: number;
  other: number;
  total: number;
}

interface ConversionSplitProps {
  totals: SplitTotals | null;
  byCampaign: SplitByCampaign[];
}

const COLOR_PHONE = '#0ea5e9'; // sky-500
const COLOR_FORM = '#8b5cf6';  // violet-500
const COLOR_OTHER = '#94a3b8'; // slate-400

function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

function fmt(n: number): string {
  if (n >= 100) return Math.round(n).toLocaleString();
  return Math.round(n * 10) / 10 + '';
}

export function ConversionSplit({ totals, byCampaign }: ConversionSplitProps) {
  // Hide the section entirely when the client hasn't categorised anything.
  if (!totals) return null;

  const grand = totals.phone + totals.form + totals.other;
  const phonePct = pct(totals.phone, grand);
  const formPct = pct(totals.form, grand);
  const otherPct = pct(totals.other, grand);

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
          Conversion Split
        </h2>
        <span className="text-[11px] text-slate-400">
          Phone vs Form for the selected period
        </span>
      </div>

      {grand === 0 ? (
        <div className="text-sm text-slate-400 py-6 text-center">
          No conversions recorded for the selected period against the configured phone or form actions.
        </div>
      ) : (
        <>
          {/* Headline totals */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <SplitStat label="Phone Calls" value={totals.phone} percent={phonePct} color={COLOR_PHONE} />
            <SplitStat label="Form Submits" value={totals.form} percent={formPct} color={COLOR_FORM} />
            <SplitStat label="Other" value={totals.other} percent={otherPct} color={COLOR_OTHER} />
          </div>

          {/* Stacked bar */}
          <div className="flex w-full h-3 rounded-full overflow-hidden mb-4 bg-slate-100">
            {phonePct > 0 && <div style={{ width: `${phonePct}%`, background: COLOR_PHONE }} />}
            {formPct > 0 && <div style={{ width: `${formPct}%`, background: COLOR_FORM }} />}
            {otherPct > 0 && <div style={{ width: `${otherPct}%`, background: COLOR_OTHER }} />}
          </div>

          {/* Per-campaign table */}
          {byCampaign.length > 0 && (
            <>
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mt-2 mb-2">
                By Campaign (top {byCampaign.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      <th className="py-2 pr-3">Campaign</th>
                      <th className="py-2 px-2 text-right">Phone</th>
                      <th className="py-2 px-2 text-right">Form</th>
                      <th className="py-2 px-2 text-right">Other</th>
                      <th className="py-2 pl-2 text-right">Total</th>
                      <th className="py-2 pl-3 w-40">Split</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCampaign.map((c) => {
                      const cPhonePct = pct(c.phone, c.total);
                      const cFormPct = pct(c.form, c.total);
                      const cOtherPct = pct(c.other, c.total);
                      return (
                        <tr key={c.name} className="border-b border-slate-50">
                          <td className="py-2 pr-3 text-slate-800">{c.name}</td>
                          <td className="py-2 px-2 text-right text-slate-700">{fmt(c.phone)}</td>
                          <td className="py-2 px-2 text-right text-slate-700">{fmt(c.form)}</td>
                          <td className="py-2 px-2 text-right text-slate-500">{fmt(c.other)}</td>
                          <td className="py-2 pl-2 text-right font-semibold text-slate-900">{fmt(c.total)}</td>
                          <td className="py-2 pl-3">
                            <div className="flex w-full h-2 rounded-full overflow-hidden bg-slate-100">
                              {cPhonePct > 0 && <div style={{ width: `${cPhonePct}%`, background: COLOR_PHONE }} title={`Phone: ${cPhonePct.toFixed(0)}%`} />}
                              {cFormPct > 0 && <div style={{ width: `${cFormPct}%`, background: COLOR_FORM }} title={`Form: ${cFormPct.toFixed(0)}%`} />}
                              {cOtherPct > 0 && <div style={{ width: `${cOtherPct}%`, background: COLOR_OTHER }} title={`Other: ${cOtherPct.toFixed(0)}%`} />}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function SplitStat({ label, value, percent, color }: { label: string; value: number; percent: number; color: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
        {label}
      </div>
      <div className="text-xl font-semibold text-slate-900">{fmt(value)}</div>
      <div className="text-[11px] text-slate-500">{percent.toFixed(0)}% of total</div>
    </div>
  );
}
