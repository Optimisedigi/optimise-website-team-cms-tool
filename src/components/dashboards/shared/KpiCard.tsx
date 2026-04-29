"use client";

function formatValue(value: number | null, format: "dollars" | "number" | "percent"): string {
  if (value == null) return "N/A";
  switch (format) {
    case "dollars":
      return value >= 1000
        ? `$${(value / 1000).toFixed(1)}k`
        : `$${value.toLocaleString("en-US")}`;
    case "number":
      return value.toLocaleString("en-US");
    case "percent":
      return `${value}%`;
  }
}

function pctChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

interface KpiCardProps {
  label: string;
  value: number | null;
  previousValue: number | null;
  format: "dollars" | "number" | "percent";
  /** For CPA/CPM, lower is better — green for decrease */
  invertColors?: boolean;
  comparisonLabel?: string;
}

export function KpiCard({ label, value, previousValue, format, invertColors, comparisonLabel = "vs prev month" }: KpiCardProps) {
  const change = pctChange(value, previousValue);

  let arrowColor = "text-slate-400";
  let arrowIcon = "";
  if (change != null && change !== 0) {
    const isPositive = change > 0;
    const isGood = invertColors ? !isPositive : isPositive;
    arrowColor = isGood ? "text-emerald-600" : "text-red-500";
    arrowIcon = isPositive ? "\u25B2" : "\u25BC";
  }

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm px-4" style={{ paddingTop: 3, paddingBottom: 3 }}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500" style={{ lineHeight: 1, marginBottom: -4 }}>
        {label}
      </p>
      <p className="font-bold text-slate-900" style={{ fontSize: '19px', lineHeight: 1 }}>
        {formatValue(value, format)}
      </p>
      {change != null && (
        <p className={`text-[10px] font-medium ${arrowColor}`} style={{ lineHeight: 1, marginTop: -4 }}>
          {arrowIcon} {change > 0 ? "+" : ""}{change}% {comparisonLabel}
        </p>
      )}
    </div>
  );
}
