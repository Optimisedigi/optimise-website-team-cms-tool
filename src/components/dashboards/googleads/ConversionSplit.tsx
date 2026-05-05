'use client';

interface CategoryDef {
  label: string;
  color: string; // sky | violet | emerald | amber | rose | slate
}

interface ConversionSplitProps {
  totals: { categories: CategoryDef[]; totals: Record<string, number> } | null;
  byCampaign: Array<{ name: string; byCategory: Record<string, number>; total: number }>;
}

const COLORS: Record<string, string> = {
  sky: '#0ea5e9',
  violet: '#8b5cf6',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  slate: '#94a3b8',
};

const colorFor = (key: string) => COLORS[key] || COLORS.slate;

function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

function fmt(n: number): string {
  if (n >= 100) return Math.round(n).toLocaleString();
  return Math.round(n * 10) / 10 + '';
}

export function ConversionSplit({ totals, byCampaign }: ConversionSplitProps) {
  if (!totals || totals.categories.length === 0) return null;

  const grand = Object.values(totals.totals).reduce((s, n) => s + n, 0);
  const visibleCategories = totals.categories.filter(
    (c) => (totals.totals[c.label] || 0) > 0,
  );

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
          Conversion Split
        </h2>
        <span className="text-[11px] text-slate-400">
          By category for the selected period
        </span>
      </div>

      {grand === 0 ? (
        <div className="text-sm text-slate-400 py-6 text-center">
          No conversions recorded for the selected period against the configured categories.
        </div>
      ) : (
        <>
          {/* Headline tiles — one per category, dynamic */}
          <div
            className="grid gap-3 mb-4"
            style={{ gridTemplateColumns: `repeat(${Math.min(visibleCategories.length, 4)}, minmax(0, 1fr))` }}
          >
            {visibleCategories.map((c) => {
              const value = totals.totals[c.label] || 0;
              return (
                <SplitStat
                  key={c.label}
                  label={c.label}
                  value={value}
                  percent={pct(value, grand)}
                  color={colorFor(c.color)}
                />
              );
            })}
          </div>

          {/* Stacked bar */}
          <div className="flex w-full h-3 rounded-full overflow-hidden mb-4 bg-slate-100">
            {totals.categories.map((c) => {
              const v = totals.totals[c.label] || 0;
              const p = pct(v, grand);
              if (p <= 0) return null;
              return (
                <div
                  key={c.label}
                  style={{ width: `${p}%`, background: colorFor(c.color) }}
                  title={`${c.label}: ${fmt(v)} (${p.toFixed(0)}%)`}
                />
              );
            })}
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
                      {totals.categories.map((c) => (
                        <th key={c.label} className="py-2 px-2 text-right">{c.label}</th>
                      ))}
                      <th className="py-2 pl-2 text-right">Total</th>
                      <th className="py-2 pl-3 w-40">Split</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCampaign.map((c) => (
                      <tr key={c.name} className="border-b border-slate-50">
                        <td className="py-2 pr-3 text-slate-800">{c.name}</td>
                        {totals.categories.map((cat) => {
                          const v = c.byCategory[cat.label] || 0;
                          return (
                            <td key={cat.label} className="py-2 px-2 text-right text-slate-600">
                              {v > 0 ? fmt(v) : '—'}
                            </td>
                          );
                        })}
                        <td className="py-2 pl-2 text-right font-semibold text-slate-900">{fmt(c.total)}</td>
                        <td className="py-2 pl-3">
                          <div className="flex w-full h-2 rounded-full overflow-hidden bg-slate-100">
                            {totals.categories.map((cat) => {
                              const v = c.byCategory[cat.label] || 0;
                              const p = pct(v, c.total);
                              if (p <= 0) return null;
                              return (
                                <div
                                  key={cat.label}
                                  style={{ width: `${p}%`, background: colorFor(cat.color) }}
                                  title={`${cat.label}: ${p.toFixed(0)}%`}
                                />
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ))}
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
        <span className="truncate" title={label}>{label}</span>
      </div>
      <div className="text-xl font-semibold text-slate-900">{fmt(value)}</div>
      <div className="text-[11px] text-slate-500">{percent.toFixed(0)}% of total</div>
    </div>
  );
}
