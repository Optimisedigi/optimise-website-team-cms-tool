"use client";

import { AWAY_LAYOUT_CUTOVER, type LandingLayoutId } from "@/lib/landing-layouts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "25 Sep": the cutover's day in Sydney, where the client reads the dashboard.
 * Built by hand because Intl's short month varies by runtime ("Sep" / "Sept"),
 * which would make the server and browser render different text.
 */
export const LAYOUT_CUTOVER_LABEL = (() => {
  const parts = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "numeric",
    timeZone: "Australia/Sydney",
  }).formatToParts(new Date(AWAY_LAYOUT_CUTOVER));
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = Number(parts.find((part) => part.type === "month")?.value ?? 0);
  return `${day} ${MONTHS[month - 1] ?? ""}`.trim();
})();

const OPTIONS: { id: LandingLayoutId; label: string }[] = [
  { id: "current", label: `New layout · from ${LAYOUT_CUTOVER_LABEL}` },
  { id: "original", label: `Original layout · until ${LAYOUT_CUTOVER_LABEL}` },
];

/**
 * Switches every panel between the page as it is now and the page as it was.
 * Two real buttons with aria-pressed, so it is reachable and announced by
 * keyboard and screen reader like any other toggle.
 */
export function LandingLayoutToggle({
  layout,
  onChange,
}: {
  layout: LandingLayoutId;
  onChange: (layout: LandingLayoutId) => void;
}) {
  return (
    <div role="group" aria-label="Page layout" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
      {OPTIONS.map((option) => {
        const active = option.id === layout;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(option.id);
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              active ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
