"use client";

import { useEffect, useState } from "react";
import { LANDING_PAGES, type LandingPageMeta } from "@/lib/landing-page-sections";

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

interface FunnelStep {
  key: string;
  label: string;
  sessions: number;
  shareOfEntry: number;
  droppedFromPrevious: number;
  dropOffRate: number;
}

interface SectionDwell {
  sectionId: string;
  sessions: number;
  medianSeconds: number;
  p90Seconds: number;
  exits: number;
  exitRate: number;
}

interface Segment {
  key: string;
  sessions: number;
  conversions: number;
  conversionRate: number;
}

interface ReportResponse {
  filters: { page: string | null; device: string | null; market: string | null };
  pages: Segment[];
  markets: Segment[];
  devices: Segment[];
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
  funnel: FunnelStep[];
  funnelByVariant: Record<string, FunnelStep[]>;
  sections: SectionDwell[];
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
  section_dwell: "Sections timed",
};

/** Words that look wrong in plain title case. */
const SECTION_WORDS: Record<string, string> = { faq: "FAQ", cta: "CTA", roi: "ROI" };

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function shortPct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

/** Turn a section id into something readable without inventing a label. */
function sectionLabel(id: string): string {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => SECTION_WORDS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function LandingExperimentTab({ slug }: { slug: string }) {
  const [data, setData] = useState<ReportResponse | null>(null);
  const [days, setDays] = useState(30);
  // Each landing page has its own sections and funnel, and phone behaviour is
  // not desktop behaviour, so both are selectable rather than averaged.
  const [page, setPage] = useState("");
  const [device, setDevice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const query = new URLSearchParams({ slug, days: String(days) });
    if (page) query.set("page", page);
    if (device) query.set("device", device);

    fetch(`/api/dashboard/landing-experiments?${query}`)
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
  }, [slug, days, page, device]);

  /**
   * Land on a single page rather than on everything pooled together.
   *
   * Pooling is both inaccurate and meaningless here. Inaccurate because the scan
   * is capped, so "all pages" silently reports partial totals once a client runs
   * more than one page. Meaningless because pages have different sections: a
   * section table mixing one page's Security block with another's How It Works
   * describes a page that does not exist.
   */
  useEffect(() => {
    if (page || !data || data.pages.length < 2) return;
    const busiest = data.pages.find((entry) => entry.key !== "(unset)") ?? data.pages[0];
    if (busiest) setPage(busiest.key);
  }, [data, page]);

  if (loading) return <div className="text-sm text-slate-500">Loading landing experiment data…</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data) return null;

  const hasVariants = data.variants.length > 0;
  // Sessions can appear on more than one device only if someone switches
  // mid-session, which is rare enough that the sum is the honest denominator.
  const totalDeviceSessions = data.devices.reduce((sum, entry) => sum + entry.sessions, 0);

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

        <div className="flex items-center gap-3">
          {data.pages.length > 1 && (
            <label className="text-sm text-slate-600">
              Page{" "}
              <select
                value={page}
                onChange={(event) => setPage(event.target.value)}
                className="ml-1 rounded-md border border-slate-200 px-2 py-1"
              >
                <option value="">All pages</option>
                {data.pages.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.key} ({entry.sessions.toLocaleString()})
                  </option>
                ))}
              </select>
            </label>
          )}

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
      </div>

      {/* Device split as a summary, then a toggle. The split is always visible,
          so selecting one device never hides how much traffic the other had. */}
      {data.devices.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-500 mr-1">Device</span>
            {[{ key: "", sessions: totalDeviceSessions, conversionRate: null as number | null }]
              .concat(
                data.devices.map((entry) => ({
                  key: entry.key,
                  sessions: entry.sessions,
                  conversionRate: entry.conversionRate,
                }))
              )
              .map((entry) => {
                const active = device === entry.key;
                const share = totalDeviceSessions > 0 ? entry.sessions / totalDeviceSessions : 0;
                return (
                  <button
                    key={entry.key || "all"}
                    type="button"
                    onClick={() => setDevice(entry.key)}
                    aria-pressed={active}
                    className={`rounded-md border px-3 py-1.5 text-xs transition ${
                      active
                        ? "border-sky-500 bg-white font-medium text-sky-700 shadow-sm"
                        : "border-transparent text-slate-600 hover:bg-white"
                    }`}
                  >
                    {entry.key === "" ? "All devices" : sectionLabel(entry.key)}
                    <span className="ml-1.5 text-slate-500">
                      {entry.sessions.toLocaleString()}
                      {entry.key !== "" && ` · ${shortPct(share)}`}
                    </span>
                    {entry.conversionRate !== null && (
                      <span className="ml-1.5 text-slate-400">{pct(entry.conversionRate)} conv</span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {data.markets.filter((entry) => entry.key !== "(unset)").length > 1 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-1">Markets</h4>
          <p className="text-xs text-slate-500 mb-3">
            Totals for the whole range, across every page, so the comparison holds while a single
            page is selected above. Each market runs its own page, so these are separate audiences
            rather than an experiment: read a difference as a prompt to look, not as a result.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-slate-700">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Market</th>
                  <th className="py-2 pr-4">Sessions</th>
                  <th className="py-2 pr-4">Conversions</th>
                  <th className="py-2 pr-4">Conversion rate</th>
                </tr>
              </thead>
              <tbody>
                {data.markets.map((entry) => (
                  <tr key={entry.key} className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-900">{entry.key}</td>
                    <td className="py-2 pr-4 text-slate-700">{entry.sessions.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-slate-700">{entry.conversions.toLocaleString()}</td>
                    <td className="py-2 pr-4 font-medium text-slate-900">{pct(entry.conversionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.truncated && (
        <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <strong className="font-semibold">These totals are incomplete.</strong> The scan stopped
          at {data.eventsScanned.toLocaleString()} events, so every number below undercounts.
          Choose a single page, or a shorter range, for figures you can act on.
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

      {data.funnel.some((step) => step.sessions > 0) && (
        <div className="pt-2">
          <h4 className="text-sm font-semibold text-slate-900 mb-1">Where people drop off</h4>
          <p className="text-xs text-slate-500 mb-3">
            Distinct sessions reaching each step. The percentage on the right is the share lost
            since the previous step, which is where the journey is actually breaking.
          </p>

          <div className="space-y-1.5">
            {data.funnel.map((step, index) => {
              const entry = data.funnel[0]?.sessions ?? 0;
              const width = entry > 0 ? Math.max(step.shareOfEntry * 100, 1.5) : 0;
              // The worst single drop is the one worth looking at first.
              const worst = Math.max(...data.funnel.slice(1).map((s) => s.dropOffRate), 0);
              const isWorst = index > 0 && step.dropOffRate === worst && step.dropOffRate > 0;

              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 text-xs text-slate-600">{step.label}</div>
                  {/* The bar sits behind the row and the label beside it, rather
                      than on top of the fill. Text over a variable-width bar is
                      unreadable wherever the fill happens to end. */}
                  <div className="relative h-7 flex-1 rounded bg-slate-100">
                    <div
                      className={`absolute inset-y-0 left-0 rounded ${isWorst ? "bg-amber-400" : "bg-sky-400"}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <div className="w-36 shrink-0 text-xs">
                    <span className="font-medium text-slate-900">
                      {step.sessions.toLocaleString()}
                    </span>
                    <span className="ml-1.5 text-slate-500">{shortPct(step.shareOfEntry)}</span>
                  </div>
                  <div className="w-32 shrink-0 text-right text-xs">
                    {index === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className={isWorst ? "font-medium text-amber-700" : "text-slate-600"}>
                        −{step.droppedFromPrevious.toLocaleString()} ({shortPct(step.dropOffRate)})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {Object.keys(data.funnelByVariant).length > 1 && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-xs text-slate-700">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1.5 pr-4">Step</th>
                    {Object.keys(data.funnelByVariant).map((variantId) => (
                      <th key={variantId} className="py-1.5 pr-4">
                        Variant {variantId}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.funnel.map((step, index) => (
                    <tr key={step.key} className="border-t border-slate-100">
                      <td className="py-1.5 pr-4 text-slate-600">{step.label}</td>
                      {Object.entries(data.funnelByVariant).map(([variantId, steps]) => {
                        const row = steps[index];
                        return (
                          <td key={variantId} className="py-1.5 pr-4 text-slate-700">
                            {row ? row.sessions.toLocaleString() : "0"}
                            {row && index > 0 && (
                              <span className="ml-1.5 text-slate-400">
                                −{shortPct(row.dropOffRate)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {(data.sections.length > 0 || LANDING_PAGES[page]) && (
        <SectionDwellPanel sections={data.sections} pageMeta={LANDING_PAGES[page] ?? null} />
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

/**
 * "Where people spend their time", in the page's real order when we know the
 * page, with the actual page embedded alongside so a number is never read
 * without the section it describes.
 *
 * With a known page the rows are the page's real sections top-to-bottom —
 * including ones no session reached, which event data alone cannot list —
 * and clicking a row scrolls the embedded page to that section.
 *
 * The iframe is sandboxed without allow-same-origin: the preview page's SDK
 * then calls the CMS from an opaque origin, which the origin allowlist
 * refuses, so admins scrolling the preview can never pollute the analytics
 * they are reading.
 */
function SectionDwellPanel({
  sections,
  pageMeta,
}: {
  sections: SectionDwell[];
  pageMeta: LandingPageMeta | null;
}) {
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const byId = new Map(sections.map((section) => [section.sectionId, section]));
  const rows: { id: string; label: string; anchor: string | null; dwell: SectionDwell | null }[] =
    pageMeta
      ? [
          ...pageMeta.sections.map((section) => ({
            id: section.id,
            label: section.label,
            anchor: section.anchor,
            dwell: byId.get(section.id) ?? null,
          })),
          // Ids the page reported that the map does not know (e.g. after a
          // page edit): keep them visible rather than silently dropping data.
          ...sections
            .filter((section) => !pageMeta.sections.some((s) => s.id === section.sectionId))
            .map((section) => ({
              id: section.sectionId,
              label: sectionLabel(section.sectionId),
              anchor: null,
              dwell: section,
            })),
        ]
      : sections.map((section) => ({
          id: section.sectionId,
          label: sectionLabel(section.sectionId),
          anchor: null,
          dwell: section,
        }));

  const worstExit = Math.max(...sections.map((s) => s.exitRate), 0);
  const previewSrc = pageMeta ? `${pageMeta.url}${activeAnchor ? `#${activeAnchor}` : ""}` : null;

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-1">
        <h4 className="text-sm font-semibold text-slate-900">Where people spend their time</h4>
        {pageMeta && (
          <div className="flex items-center gap-3">
            <a
              href={pageMeta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-sky-700 hover:underline"
            >
              Open page ↗
            </a>
            <button
              type="button"
              onClick={() => setShowPreview((value) => !value)}
              aria-pressed={showPreview}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {showPreview ? "Hide page" : "Show page"}
            </button>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-3">
        {pageMeta
          ? "Sections in the order they appear on the page. Click a section to scroll the live page beside the numbers. "
          : ""}
        Active seconds with the section on screen and the tab focused, so a page left open in a
        background tab does not read as attention. Median rather than average, because a few long
        sessions would otherwise move every number.
      </p>

      <div className={pageMeta && showPreview ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]" : ""}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-slate-700">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Section</th>
                <th className="py-2 pr-4">Sessions</th>
                <th className="py-2 pr-4">Median time</th>
                <th className="py-2 pr-4">Top 10% spend</th>
                <th className="py-2 pr-4">Left from here</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const dwell = row.dwell;
                const isExitPoint = dwell !== null && dwell.exitRate === worstExit && dwell.exitRate > 0;
                const clickable = pageMeta !== null && showPreview;
                return (
                  <tr
                    key={row.id}
                    onClick={clickable ? () => setActiveAnchor(row.anchor) : undefined}
                    className={`border-t border-slate-100 ${
                      clickable ? "cursor-pointer hover:bg-slate-50" : ""
                    } ${activeAnchor !== null && activeAnchor === row.anchor ? "bg-sky-50" : ""}`}
                  >
                    <td className="py-2 pr-4 font-medium text-slate-900">{row.label}</td>
                    {dwell ? (
                      <>
                        <td className="py-2 pr-4 text-slate-700">{dwell.sessions.toLocaleString()}</td>
                        <td className="py-2 pr-4 font-medium text-slate-900">{dwell.medianSeconds}s</td>
                        <td className="py-2 pr-4 text-slate-500">{dwell.p90Seconds}s</td>
                        <td className="py-2 pr-4">
                          <span className={isExitPoint ? "font-medium text-amber-700" : "text-slate-700"}>
                            {dwell.exits.toLocaleString()} ({shortPct(dwell.exitRate)})
                          </span>
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="py-2 pr-4 text-xs text-slate-400">
                        No session reached this section in the range
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-slate-500 mt-2">
            A long time on a section is not automatically good: it can mean the content is
            compelling, or that it is confusing. Read it alongside the drop-off above.
          </p>
        </div>

        {pageMeta && showPreview && previewSrc && (
          <div className="xl:sticky xl:top-4 self-start">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                {pageMeta.label} — live page, scrollable. Interactions here are not tracked.
              </div>
              <iframe
                src={previewSrc}
                title={`Preview of ${pageMeta.label}`}
                sandbox="allow-scripts allow-forms"
                className="h-[600px] w-full"
                loading="lazy"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
