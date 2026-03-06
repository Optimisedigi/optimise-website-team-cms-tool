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
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900">
        {formatValue(value, format)}
      </p>
      {change != null && (
        <p className={`mt-1 text-sm font-medium ${arrowColor}`}>
          {arrowIcon} {change > 0 ? "+" : ""}{change}% {comparisonLabel}
        </p>
      )}
    </div>
  );
}
