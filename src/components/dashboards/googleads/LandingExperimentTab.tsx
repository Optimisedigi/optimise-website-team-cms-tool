"use client";

import { useEffect, useState } from "react";

/**
 * Landing A/B results and on-page behaviour for one client.
 *
 * The presentation rule here: never show a winner the data cannot support.
 * Uplift is always accompanied by its confidence interval and sample size, and
 * an underpowered test says so plainly instead of showing a green number that
 * invites a decision.
 */

interface VariantSummary {
  variantId: string;
  sessions: number;
  conversions: number;
  conversionRate: number;
  interval: [number, number];
  eventCounts: Record<string, number>;
}

interface ComparisonSummary {
  controlVariantId: string;
  variantId: string;
  upliftPct: number | null;
  pValue: number | null;
  significant: boolean;
  underpowered: boolean;
}

interface ReportResponse {
  experiment: {
    id: string;
    name: string;
    status: string;
    allocationVersion: string;
    primaryGoal: string;
    startedAt: string | null;
  } | null;
  rangeDays: number;
  controlVariantId: string;
  variants: VariantSummary[];
  comparisons: ComparisonSummary[];
  behaviourTotals: Record<string, number>;
  eventsScanned: number;
  truncated: boolean;
}

const BEHAVIOUR_LABELS: Record<string, string> = {
  page_view: "Page views",
  section_view: "Sections seen",
  section_engaged: "Sections engaged",
  cta_click: "CTA clicks",
  form_start: "Form starts",
  form_step: "Form steps",
  form_error: "Form errors",
  form_submit: "Form submits",
  booking_open: "Booking opened",
  booking_complete: "Bookings completed",
  scroll_depth: "Scroll milestones",
};

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function LandingExperimentTab({ slug }: { slug: string }) {
  const [data, setData] = useState<ReportResponse | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/dashboard/landing-experiments?slug=${encodeURIComponent(slug)}&days=${days}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as ReportResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load landing data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, days]);

  if (loading) return <div className="text-sm text-slate-500">Loading landing experiment data…</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data) return null;

  const hasVariants = data.variants.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {data.experiment ? data.experiment.name : "No experiment configured"}
          </h3>
          {data.experiment && (
            <p className="text-xs text-slate-500 mt-0.5">
              {data.experiment.id} · allocation v{data.experiment.allocationVersion} ·{" "}
              <span className="capitalize">{data.experiment.status}</span> · primary goal:{" "}
              {BEHAVIOUR_LABELS[data.experiment.primaryGoal] ?? data.experiment.primaryGoal}
            </p>
          )}
        </div>

        <label className="text-sm text-slate-600">
          Range{" "}
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="ml-1 rounded-md border border-slate-200 px-2 py-1"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </div>

      {data.truncated && (
        <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Showing the first {data.eventsScanned.toLocaleString()} events in this range. Totals below
          are partial — narrow the range for a complete picture.
        </p>
      )}

      {!hasVariants ? (
        <p className="text-sm text-slate-500">
          No landing events recorded in this range.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            {/* Every cell sets its own colour. This tab is embedded in the Google
                Ads dashboard, whose stylesheet defaults text to white for a dark
                surface, so an inherited colour renders invisible here. */}
            <table className="min-w-full text-sm text-slate-700">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Variant</th>
                  <th className="py-2 pr-4">Sessions</th>
                  <th className="py-2 pr-4">Conversions</th>
                  <th className="py-2 pr-4">Conversion rate</th>
                  <th className="py-2 pr-4">95% interval</th>
                  <th className="py-2 pr-4">vs control</th>
                </tr>
              </thead>
              <tbody>
                {data.variants.map((variant) => {
                  const comparison = data.comparisons.find((row) => row.variantId === variant.variantId);
                  const isControl = variant.variantId === data.controlVariantId;

                  return (
                    <tr key={variant.variantId} className="border-t border-slate-100">
                      <td className="py-2 pr-4 font-medium text-slate-900">
                        {variant.variantId}
                        {isControl && <span className="ml-2 text-xs text-slate-500">control</span>}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">{variant.sessions.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-slate-700">{variant.conversions.toLocaleString()}</td>
                      <td className="py-2 pr-4 font-medium text-slate-900">{pct(variant.conversionRate)}</td>
                      <td className="py-2 pr-4 text-slate-500">
                        {pct(variant.interval[0])} – {pct(variant.interval[1])}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {isControl || !comparison ? (
                          <span className="text-slate-400">—</span>
                        ) : comparison.underpowered ? (
                          <span className="text-slate-500">
                            {comparison.upliftPct === null ? "—" : `${comparison.upliftPct.toFixed(1)}%`}
                            <span className="ml-2 text-xs">not enough data</span>
                          </span>
                        ) : (
                          <span
                            className={
                              comparison.significant
                                ? comparison.upliftPct !== null && comparison.upliftPct > 0
                                  ? "text-green-700 font-medium"
                                  : "text-red-700 font-medium"
                                : "text-slate-600"
                            }
                          >
                            {comparison.upliftPct === null ? "—" : `${comparison.upliftPct.toFixed(1)}%`}
                            <span className="ml-2 text-xs">
                              {comparison.significant
                                ? `significant (p=${comparison.pValue?.toFixed(3)})`
                                : `inconclusive (p=${comparison.pValue?.toFixed(3)})`}
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            Sessions are counted once per variant, and a session converts at most once however many
            goal events it fires. A result is only called significant when it clears both the p-value
            threshold and a minimum sample, so an early lead is reported as inconclusive rather than
            as a win.
          </p>
        </>
      )}

      {/* The conditional block above is a fragment, so the parent's vertical
          rhythm does not reach across it. This section sets its own top margin. */}
      <div className="pt-2">
        <h4 className="text-sm font-semibold text-slate-900 mb-3">On-page behaviour</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(data.behaviourTotals)
            .sort((a, b) => b[1] - a[1])
            .map(([eventType, count]) => (
              <div key={eventType} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">{BEHAVIOUR_LABELS[eventType] ?? eventType}</div>
                <div className="text-lg font-semibold text-slate-900">{count.toLocaleString()}</div>
              </div>
            ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Counts consented visitors only, so they are lower than total traffic and should not be read
          as sitewide volume.
        </p>
      </div>
    </div>
  );
}
