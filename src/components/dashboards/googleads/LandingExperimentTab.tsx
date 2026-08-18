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
 *
 * Layout is a light card stack on a neutral field: a headline row of the four
 * numbers a reader needs before anything else, then one card per question
 * (where people drop off, which market, where attention goes, what fired).
 * Every colour is set explicitly, including on containers, because this tab is
 * also embedded in the Google Ads dashboard, whose stylesheet defaults text to
 * white for a dark surface — an inherited colour renders invisible there.
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
  attribution: Segment[];
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
  formSubmissions?: { formId: string; label: string; sessions: number }[];
  /** Outcomes counted beside the primary goal. Absent from older responses. */
  secondaryConversions?: { id: string; label: string; sessions: number; rate: number }[];
  /** Post-click ad performance per page. `preClickAvailable` is false until Growth Tools exposes it. */
  paidTraffic?: { pages: Segment[]; preClickAvailable: boolean };
  sections: SectionDwell[];
  /** Absent from responses served before session timing shipped. */
  sessionTime?: {
    measuredSessions: number;
    unmeasuredSessions: number;
    medianActiveSeconds: number;
    p90ActiveSeconds: number;
    medianTotalSeconds: number;
  };
  behaviourTotals: Record<string, number>;
  eventsScanned: number;
  truncated: boolean;
  /** Reporting baseline: events before this are excluded whatever range is picked. */
  dataStartDate?: string | null;
  baselineApplied?: boolean;
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
  page_dwell: "Pages timed",
};

/** Words that look wrong in plain title case. */
const SECTION_WORDS: Record<string, string> = {
  faq: "FAQ",
  faqs: "FAQs",
  cta: "CTA",
  roi: "ROI",
};

/** Column headings and other microtype: monospaced, so tables read as data. */
const MICRO = "font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500";
const CARD = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";
const SELECT =
  "rounded-lg border border-slate-300 bg-white py-1.5 pl-2.5 pr-8 text-sm text-slate-900 " +
  "focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30";

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

/** One headline number. `tone="dark"` inverts the card, for the single worst finding. */
function StatCard({
  label,
  value,
  note,
  tone = "light",
  accent,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "light" | "dark";
  accent?: boolean;
}) {
  const dark = tone === "dark";
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        dark ? "border-slate-900 bg-slate-900" : "border-slate-200 bg-white"
      }`}
    >
      <div className={`text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>{label}</div>
      <div
        className={`mt-1.5 text-3xl font-bold tracking-tight tabular-nums ${
          dark ? "text-amber-300" : accent ? "text-teal-700" : "text-slate-900"
        }`}
      >
        {value}
      </div>
      <div className={`mt-1.5 text-xs ${dark ? "text-slate-300" : "text-slate-500"}`}>{note}</div>
    </div>
  );
}

/** The months of HubSpot post-click data this tab reads. The rest of the payload is ignored. */
interface PostClickMonth {
  month: string;
  paidLeads: number;
  meetings: number;
  meetingRate: number | null;
  qualifiedLeads: number;
  qualifiedLeadRate: number | null;
}

export function LandingExperimentTab({
  slug,
  customerId,
  clientName,
}: {
  slug: string;
  customerId?: string;
  clientName?: string;
}) {
  const [data, setData] = useState<ReportResponse | null>(null);
  const [postClick, setPostClick] = useState<PostClickMonth[] | null>(null);
  const [postClickNote, setPostClickNote] = useState<string | null>(null);
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
   * What happened to these leads after the form, from HubSpot.
   *
   * Read-only, and only for the client that has the integration. Nothing here
   * creates or edits a HubSpot record. A missing service URL or key is reported
   * as a configuration gap rather than as zero leads, because "not connected"
   * and "nobody converted" are opposite findings.
   */
  useEffect(() => {
    if (slug !== "away-digital" || !customerId) return;
    let cancelled = false;

    const query = new URLSearchParams({
      slug,
      customerId,
      range: "last_14_months",
      clientName: clientName || "Away Digital Teams",
    });

    fetch(`/api/dashboard/hubspot-post-click?${query}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        if (res.status === 503) throw new Error("not-configured");
        if (!res.ok) throw new Error(`status-${res.status}`);
        return (await res.json()) as { monthly?: PostClickMonth[] };
      })
      .then((json) => {
        if (cancelled) return;
        setPostClick(Array.isArray(json.monthly) ? json.monthly : []);
        setPostClickNote(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPostClick(null);
        setPostClickNote(
          err instanceof Error && err.message === "not-configured"
            ? "HubSpot is not connected to this environment (the Growth Tools service URL or internal key is unset), so lead outcomes cannot be shown. This is a configuration gap, not zero leads."
            : "Could not load HubSpot lead outcomes. The on-site numbers above are unaffected."
        );
      });

    return () => {
      cancelled = true;
    };
  }, [slug, customerId, clientName]);

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
    if (page || !data || data.pages.length === 0) return;
    const busiest = data.pages.find((entry) => entry.key !== "(unset)") ?? data.pages[0];
    if (busiest) setPage(busiest.key);
  }, [data, page]);

  if (loading)
    return (
      <div className={CARD} role="status">
        <p className="text-sm text-slate-500">Loading landing performance…</p>
      </div>
    );
  if (error)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6" role="alert">
        <p className="text-sm font-medium text-red-800">Could not load landing data</p>
        <p className="mt-1 text-sm text-red-700">{error}</p>
      </div>
    );
  if (!data) return null;

  const hasVariants = data.variants.length > 0;
  // Sessions can appear on more than one device only if someone switches
  // mid-session, which is rare enough that the sum is the honest denominator.
  const totalDeviceSessions = data.devices.reduce((sum, entry) => sum + entry.sessions, 0);

  const sessions = data.variants.reduce((sum, variant) => sum + variant.sessions, 0);
  const conversions = data.variants.reduce((sum, variant) => sum + variant.conversions, 0);
  const conversionRate = sessions > 0 ? conversions / sessions : 0;
  const realMarkets = data.markets.filter((entry) => entry.key !== "(unset)");

  // The single worst hand-off in the funnel: the first thing worth fixing.
  const leak = data.funnel
    .slice(1)
    .reduce<FunnelStep | null>(
      (worst, step) => (step.dropOffRate > (worst?.dropOffRate ?? 0) ? step : worst),
      null
    );
  const leakPrevious = leak ? data.funnel[data.funnel.findIndex((s) => s.key === leak.key) - 1] : null;

  const goalLabel = data.experiment
    ? BEHAVIOUR_LABELS[data.experiment.primaryGoal] ?? data.experiment.primaryGoal
    : "Conversions";
  const running = data.experiment?.status?.toLowerCase() === "running";

  return (
    <div className="space-y-6 text-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-slate-900">
            {data.experiment ? data.experiment.name : "No experiment configured"}
          </h3>
          {data.experiment && (
            <p className="mt-1 text-sm text-slate-500">
              {data.experiment.id} · allocation v{data.experiment.allocationVersion} · primary goal:{" "}
              {goalLabel}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {data.experiment && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                running
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${running ? "bg-emerald-500" : "bg-slate-400"}`}
              />
              <span className="capitalize">{data.experiment.status}</span>
            </span>
          )}

          {/* Shown for a single page too. Selecting the one page is what gives
              the report its sections and its preview, so hiding the control
              there hid the preview with it. */}
          {data.pages.length > 0 && (
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Page
              <select
                value={page}
                onChange={(event) => setPage(event.target.value)}
                className={SELECT}
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

          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Range
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className={SELECT}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </label>
        </div>
      </div>

      {hasVariants && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Sessions"
            value={sessions.toLocaleString()}
            note={`Last ${data.rangeDays} days${page ? ` · ${page}` : ""}`}
          />
          <StatCard label="Conversions" value={conversions.toLocaleString()} note={goalLabel} />
          <StatCard
            label="Conversion rate"
            value={pct(conversionRate)}
            accent
            note={
              realMarkets.length > 1
                ? realMarkets.map((m) => `${m.key} ${pct(m.conversionRate)}`).join(" · ")
                : "Sessions that reached the primary goal"
            }
          />
          {leak && leak.dropOffRate > 0 ? (
            <StatCard
              tone="dark"
              label="Biggest leak"
              value={leak.label}
              note={`−${leak.droppedFromPrevious.toLocaleString()} sessions (${shortPct(
                leak.dropOffRate
              )}) after “${leakPrevious ? leakPrevious.label : "the previous step"}”`}
            />
          ) : (
            <StatCard
              label="Biggest leak"
              value="—"
              note="No drop-off measured in this range"
            />
          )}
        </div>
      )}

      {data.baselineApplied && data.dataStartDate && (
        <p
          className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          role="status"
        >
          <strong className="font-semibold text-slate-900">
            Showing data from {new Date(data.dataStartDate).toLocaleDateString()} onwards.
          </strong>{" "}
          The selected range starts earlier, but this property has a reporting baseline set, so
          anything before that date is left out — including while this view looks empty. The events
          still exist; clearing the baseline on the property brings them back.
        </p>
      )}

      {data.truncated && (
        <p
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          <strong className="font-semibold text-amber-900">These totals are incomplete.</strong> The
          scan stopped at {data.eventsScanned.toLocaleString()} events, so every number below
          undercounts. Choose a single page, or a shorter range, for figures you can act on.
        </p>
      )}

      {!hasVariants && (
        <div className={CARD}>
          <p className="text-sm text-slate-500">No landing events recorded in this range.</p>
        </div>
      )}

      {/* The variant split normally sits under the funnel it splits. With no
          funnel data there is nothing to sit under, so it stands on its own
          rather than taking the variant results off the page. */}
      {hasVariants && !data.funnel.some((step) => step.sessions > 0) && (
        <section className={CARD}>
          <VariantSplit
            variants={data.variants}
            comparisons={data.comparisons}
            controlVariantId={data.controlVariantId}
            funnelByVariant={data.funnelByVariant}
            funnel={data.funnel}
          />
        </section>
      )}

      {data.funnel.some((step) => step.sessions > 0) && (
        <section className={`${CARD} space-y-5`} aria-labelledby="landing-funnel-heading">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h4 id="landing-funnel-heading" className="text-base font-bold text-slate-900">
                Where people drop off
              </h4>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Distinct sessions reaching each step. The percentage on the right is the share lost
                since the previous step, which is where the journey is actually breaking.
              </p>
            </div>

            {/* Device split as a summary, then a toggle. The split is always visible,
                so selecting one device never hides how much traffic the other had. */}
            {data.devices.length > 0 && (
              <div
                className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"
                role="group"
                aria-label="Filter by device"
              >
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
                        className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 ${
                          active
                            ? "border-slate-300 bg-white font-semibold text-slate-900 shadow-sm"
                            : "border-transparent text-slate-600 hover:bg-white/70"
                        }`}
                      >
                        {entry.key === "" ? "All devices" : sectionLabel(entry.key)}
                        <span className="ml-1.5 text-slate-500 tabular-nums">
                          {entry.sessions.toLocaleString()}
                          {entry.key !== "" && ` · ${shortPct(share)}`}
                        </span>
                        {entry.conversionRate !== null && (
                          <span className="ml-1.5 text-slate-500 tabular-nums">
                            {pct(entry.conversionRate)}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-slate-700">
              <thead>
                <tr className={`text-left ${MICRO}`}>
                  <th
                    scope="col"
                    className="w-28 border-b border-slate-200 pb-2 pr-4 font-normal sm:w-44"
                  >
                    Step
                  </th>
                  <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
                    Reached
                  </th>
                  <th scope="col" className="w-32 border-b border-slate-200 pb-2 pr-4 font-normal">
                    Sessions
                  </th>
                  <th
                    scope="col"
                    className="w-40 border-b border-slate-200 pb-2 text-right font-normal"
                  >
                    Lost from previous
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.funnel.map((step, index) => {
                  const entry = data.funnel[0]?.sessions ?? 0;
                  const width = entry > 0 ? Math.max(step.shareOfEntry * 100, 1.5) : 0;
                  const isWorst = leak !== null && step.key === leak.key && leak.dropOffRate > 0;

                  return (
                    <tr
                      key={step.key}
                      className={`border-b border-slate-100 ${isWorst ? "bg-amber-50" : ""}`}
                    >
                      <th
                        scope="row"
                        className={`py-3 pr-4 text-left text-sm font-semibold ${
                          isWorst ? "pl-2 text-amber-900" : "text-slate-900"
                        }`}
                      >
                        {step.label}
                      </th>
                      {/* The bar sits beside the row rather than under the label:
                          text over a variable-width fill is unreadable wherever
                          the fill happens to end. */}
                      <td className="py-3 pr-4">
                        <div
                          aria-hidden="true"
                          className="h-5 min-w-[6rem] overflow-hidden rounded bg-slate-100"
                        >
                          <div
                            className={`h-full rounded-sm ${isWorst ? "bg-amber-500" : "bg-sky-500"}`}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        <span className="font-semibold text-slate-900">
                          {step.sessions.toLocaleString()}
                        </span>
                        <span className="ml-1.5 text-slate-500">{shortPct(step.shareOfEntry)}</span>
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        {index === 0 ? (
                          <span className="text-slate-500">—</span>
                        ) : (
                          <span
                            className={
                              isWorst ? "pr-2 font-bold text-amber-800" : "text-slate-600"
                            }
                          >
                            −{step.droppedFromPrevious.toLocaleString()} (
                            {shortPct(step.dropOffRate)})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(data.formSubmissions?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">Which form was submitted</p>
              <p className="mt-0.5 text-xs text-slate-500">
                The step above pools every form. The checklist PDF is an email capture, not a
                qualified lead, so it is counted separately here.
              </p>
              <ul className="mt-2 space-y-1">
                {data.formSubmissions!.map((form) => (
                  <li
                    key={form.formId}
                    className="flex items-center justify-between gap-3 text-sm text-slate-700"
                  >
                    <span>{form.label}</span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {form.sessions.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasVariants && (
            <VariantSplit
              variants={data.variants}
              comparisons={data.comparisons}
              controlVariantId={data.controlVariantId}
              funnelByVariant={data.funnelByVariant}
              funnel={data.funnel}
            />
          )}
        </section>
      )}

      {data.devices.filter((entry) => entry.key !== "(unset)").length > 1 && (
        <section className={`${CARD} space-y-4`} aria-labelledby="landing-devices-heading">
          <div>
            <h4 id="landing-devices-heading" className="text-base font-bold text-slate-900">
              Devices
            </h4>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              The same split as the toggle above, with conversion rate side by side for the selected
              page. A phone and a desktop are different reading experiences, so a gap here usually
              points at layout or form length rather than at the audience.
            </p>
          </div>
          <SegmentTable
            rows={data.devices.filter((entry) => entry.key !== "(unset)")}
            firstColumn="Device"
          />
        </section>
      )}

      {realMarkets.length > 1 && (
        <section className={`${CARD} space-y-4`} aria-labelledby="landing-markets-heading">
          <div>
            <h4 id="landing-markets-heading" className="text-base font-bold text-slate-900">
              Markets
            </h4>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Totals for the whole range, across every page, so the comparison holds while a single
              page is selected above. Each market runs its own page, so these are separate audiences
              rather than an experiment: read a difference as a prompt to look, not as a result.
            </p>
          </div>
          <SegmentTable rows={data.markets} firstColumn="Market" />
        </section>
      )}

      {(data.attribution?.length ?? 0) > 0 && (
        <section className={`${CARD} space-y-4`} aria-labelledby="landing-attribution-heading">
          <div>
            <h4 id="landing-attribution-heading" className="text-base font-bold text-slate-900">
              Attribution
            </h4>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Source / medium / campaign from the click that started the session, for the whole
              range. `(direct)` is a visit that arrived with no campaign tags — typing the URL, a
              bookmark, or a link that stripped them — not a tracking failure. Sessions are counted
              once against the attribution they arrived with.
            </p>
          </div>
          <SegmentTable rows={data.attribution} firstColumn="Source / medium / campaign" />
        </section>
      )}

      <SecondaryConversionsPanel rows={data.secondaryConversions} />

      <PaidTrafficPanel paidTraffic={data.paidTraffic} />

      <PostClickPanel months={postClick} note={postClickNote} />

      <SessionTimePanel sessionTime={data.sessionTime} />

      {(data.sections.length > 0 || LANDING_PAGES[page]) && (
        <SectionDwellPanel
          sections={data.sections}
          pageMeta={LANDING_PAGES[page] ?? null}
          conversions={conversions}
        />
      )}

      <section className={`${CARD} space-y-4`} aria-labelledby="landing-behaviour-heading">
        <h4 id="landing-behaviour-heading" className="text-base font-bold text-slate-900">
          On-page behaviour
        </h4>
        {/* Gapped cells rather than a hairline-divided block: the count of
            event types is whatever fired, so a divided grid would end in empty
            cells that read as missing data. */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {Object.entries(data.behaviourTotals)
            .sort((a, b) => b[1] - a[1])
            .map(([eventType, count]) => (
              <div key={eventType} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-500">
                  {BEHAVIOUR_LABELS[eventType] ?? eventType}
                </div>
                <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                  {count.toLocaleString()}
                </div>
              </div>
            ))}
        </div>
        <p className="text-sm text-slate-500">
          Counts consented visitors only, so they are lower than total traffic and should not be
          read as sitewide volume.
        </p>
      </section>
    </div>
  );
}

/** Markets and attribution share one shape, so they share one table. */
function SegmentTable({ rows, firstColumn }: { rows: Segment[]; firstColumn: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm text-slate-700">
        <thead>
          <tr className={`text-left ${MICRO}`}>
            <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
              {firstColumn}
            </th>
            <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
              Sessions
            </th>
            <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
              Conversions
            </th>
            <th scope="col" className="border-b border-slate-200 pb-2 font-normal">
              Conversion rate
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.key} className="border-b border-slate-100 last:border-0">
              <th scope="row" className="py-3 pr-4 text-left font-semibold text-slate-900">
                {entry.key}
              </th>
              <td className="py-3 pr-4 text-slate-700 tabular-nums">
                {entry.sessions.toLocaleString()}
              </td>
              <td className="py-3 pr-4 text-slate-700 tabular-nums">
                {entry.conversions.toLocaleString()}
              </td>
              <td className="py-3 font-semibold text-slate-900 tabular-nums">
                {pct(entry.conversionRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The same funnel, split by variant, with the verdict stated in words.
 *
 * Each variant is a card rather than a column in one wide table, so its rate,
 * its interval and its own drop-off stay together: a reader comparing two
 * numbers can see the uncertainty attached to each of them without moving.
 */
function VariantSplit({
  variants,
  comparisons,
  controlVariantId,
  funnelByVariant,
  funnel,
}: {
  variants: VariantSummary[];
  comparisons: ComparisonSummary[];
  controlVariantId: string;
  funnelByVariant: Record<string, FunnelStep[]>;
  funnel: FunnelStep[];
}) {
  const winner = comparisons.find((row) => row.significant && (row.upliftPct ?? 0) > 0);
  const anyUnderpowered = comparisons.some((row) => row.underpowered);
  const verdict = winner
    ? `Variant ${winner.variantId} is ahead`
    : anyUnderpowered
      ? "Not enough data"
      : "No winner yet";

  return (
    <div className="space-y-4 border-t border-slate-200 pt-5">
      <h5 className="text-sm font-bold text-slate-900">Same funnel, split by variant</h5>

      <div className="grid gap-4 lg:grid-cols-2">
        {variants.map((variant) => {
          const comparison = comparisons.find((row) => row.variantId === variant.variantId);
          const isControl = variant.variantId === controlVariantId;
          const steps = funnelByVariant[variant.variantId] ?? [];
          const badge = isControl
            ? "Control"
            : comparison?.upliftPct === null || comparison === undefined
              ? "No comparison"
              : comparison.underpowered
                ? `${comparison.upliftPct.toFixed(1)}% · not enough data`
                : `${comparison.upliftPct.toFixed(1)}% vs control · ${
                    comparison.significant ? "significant" : "inconclusive"
                  }`;
          // p stays out of the uppercased badge: "P=0.212" is not the notation.
          const pValueNote =
            !isControl && comparison && !comparison.underpowered && comparison.pValue !== null
              ? `p=${comparison.pValue.toFixed(3)}`
              : null;

          return (
            <div
              key={variant.variantId}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-base font-bold text-slate-900">
                  Variant {variant.variantId}
                </span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-600">
                  {badge}
                </span>
                {pValueNote && (
                  <span className="font-mono text-[10px] text-slate-500">{pValueNote}</span>
                )}
                <span className="ml-auto text-base font-bold text-slate-900 tabular-nums">
                  {pct(variant.conversionRate)}
                </span>
              </div>

              <dl className="mt-3 space-y-2 text-sm">
                {(steps.length > 0 ? steps : funnel.map(() => null)).map((step, index) => {
                  const label = funnel[index]?.label ?? "";
                  if (!step) return null;
                  const worstOfVariant = Math.max(...steps.slice(1).map((s) => s.dropOffRate), 0);
                  const isWorst =
                    index > 0 && step.dropOffRate === worstOfVariant && step.dropOffRate > 0;
                  return (
                    <div key={step.key} className="flex items-baseline justify-between gap-3">
                      <dt className="text-slate-600">{label}</dt>
                      <dd className="tabular-nums">
                        {index > 0 && (
                          <span className={isWorst ? "text-amber-800" : "text-slate-500"}>
                            −{shortPct(step.dropOffRate)}{" "}
                          </span>
                        )}
                        <span className="font-semibold text-slate-900">
                          {step.sessions.toLocaleString()}
                        </span>
                      </dd>
                    </div>
                  );
                })}
              </dl>

              <p className="mt-3 text-xs text-slate-500 tabular-nums">
                {variant.sessions.toLocaleString()} sessions ·{" "}
                {variant.conversions.toLocaleString()} conversions · 95% interval{" "}
                {pct(variant.interval[0])} – {pct(variant.interval[1])}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <span className="rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-700">
          {verdict}
        </span>
        <p className="flex-1 text-sm text-slate-600">
          Sessions are counted once per variant, and a session converts at most once however many
          goal events it fires. A result is only called significant when it clears both the p-value
          threshold and a minimum sample, so an early lead is reported as inconclusive rather than
          as a win.
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
/**
 * What happened after the form, from HubSpot — read-only.
 *
 * Sits beside the on-site funnel rather than inside it: these are different
 * systems counting different things over different windows, and stacking them
 * into one funnel would imply a session-level join that does not exist.
 */
function PostClickPanel({ months, note }: { months: PostClickMonth[] | null; note: string | null }) {
  if (!months && !note) return null;
  const recent = (months ?? []).slice(-6).reverse();

  return (
    <section className={`${CARD} space-y-4`} aria-labelledby="landing-postclick-heading">
      <div>
        <h4 id="landing-postclick-heading" className="text-base font-bold text-slate-900">
          After the form — HubSpot
        </h4>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Lead outcomes from the CRM, by month, read-only. Counted per lead record rather than per
          session, so these do not tie row-for-row to the sessions above.
        </p>
      </div>

      {note ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {note}
        </p>
      ) : recent.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          HubSpot returned no months for this range.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-slate-700">
            <thead>
              <tr className={`text-left ${MICRO}`}>
                <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
                  Month
                </th>
                <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
                  Paid leads
                </th>
                <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
                  Meetings
                </th>
                <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
                  Meeting rate
                </th>
                <th scope="col" className="border-b border-slate-200 pb-2 font-normal">
                  Qualified
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => (
                <tr key={row.month} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="py-3 pr-4 text-left font-semibold text-slate-900">
                    {row.month}
                  </th>
                  <td className="py-3 pr-4 tabular-nums">{row.paidLeads.toLocaleString()}</td>
                  <td className="py-3 pr-4 tabular-nums">{row.meetings.toLocaleString()}</td>
                  <td className="py-3 pr-4 tabular-nums">
                    {/* HubSpot rates arrive already scaled to 0–100, unlike the
                        on-site rates above, which are fractions. */}
                    {row.meetingRate === null ? "—" : `${row.meetingRate}%`}
                  </td>
                  <td className="py-3 font-semibold text-slate-900 tabular-nums">
                    {row.qualifiedLeads.toLocaleString()}
                    {row.qualifiedLeadRate !== null && (
                      <span className="ml-1.5 font-normal text-slate-500">
                        {row.qualifiedLeadRate}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Google Ads traffic, post-click only.
 *
 * The missing half is named explicitly rather than left as a blank column:
 * impressions, clicks, CTR and cost are not in this database at all, and a
 * dashboard that shows only what it happens to have looks like a complete
 * account report.
 */
function PaidTrafficPanel({
  paidTraffic,
}: {
  paidTraffic?: { pages: Segment[]; preClickAvailable: boolean };
}) {
  if (!paidTraffic || paidTraffic.pages.length === 0) return null;

  return (
    <section className={`${CARD} space-y-4`} aria-labelledby="landing-paid-heading">
      <div>
        <h4 id="landing-paid-heading" className="text-base font-bold text-slate-900">
          Google Ads traffic by landing page
        </h4>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Sessions that arrived on an ad click, identified by the click id on the landing URL
          (gclid, or gbraid/wbraid when the click id is restricted), and what those sessions did
          next.
        </p>
      </div>
      <SegmentTable rows={paidTraffic.pages} firstColumn="Landing page" />
      {!paidTraffic.preClickAvailable && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong className="font-semibold">This is the post-click half only.</strong> Impressions,
          clicks, CTR and cost per landing page live in Google Ads and are not stored here. They
          need a landing-page endpoint on the Growth Tools service, which does not exist yet, so no
          figure for them can be shown — an empty column here would be a missing integration, not a
          zero.
        </p>
      )}
    </section>
  );
}

/**
 * Outcomes counted beside the primary goal — the checklist sign-up in
 * particular, which is a form submit from one form rather than an event type of
 * its own, so it counts retroactively over data already collected.
 *
 * Rendered even at zero: "nobody downloaded the checklist" is a finding, and
 * hiding the row would read as the metric not existing.
 */
function SecondaryConversionsPanel({
  rows,
}: {
  rows?: { id: string; label: string; sessions: number; rate: number }[];
}) {
  if (!rows || rows.length === 0) return null;

  return (
    <section className={`${CARD} space-y-4`} aria-labelledby="landing-secondary-heading">
      <div>
        <h4 id="landing-secondary-heading" className="text-base font-bold text-slate-900">
          Other conversions
        </h4>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Counted on distinct sessions, alongside the primary goal rather than added to it. One
          session can appear in more than one row, so these do not sum to a total.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">{row.label}</div>
            <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
              {row.sessions.toLocaleString()}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {pct(row.rate)} of sessions
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Time on the page per session.
 *
 * Sessions with no page_dwell are shown as unmeasured rather than folded in as
 * zero seconds: every session recorded before the page started sending the
 * event is in that bucket, and counting them as zero would read as a collapse
 * in engagement that never happened.
 */
function SessionTimePanel({ sessionTime }: { sessionTime?: ReportResponse["sessionTime"] }) {
  if (!sessionTime) return null;
  const { measuredSessions, unmeasuredSessions } = sessionTime;
  const secs = (value: number) => `${value.toLocaleString()}s`;

  return (
    <section className={`${CARD} space-y-4`} aria-labelledby="landing-session-time-heading">
      <div>
        <h4 id="landing-session-time-heading" className="text-base font-bold text-slate-900">
          Time on page per session
        </h4>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Active time only: the tab in front of the visitor, page on screen. This is not the sum of
          the section times below — two sections are often half-visible at once, so that sum
          overcounts. Median first, because a handful of tabs left open all afternoon wrecks a mean.
        </p>
      </div>

      {measuredSessions === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Not measured for any session in this range. Page timing started with the current landing
          build; sessions recorded before it carry no timing at all, which is different from
          visitors leaving instantly.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: "Median active", value: secs(sessionTime.medianActiveSeconds) },
              { label: "90th percentile active", value: secs(sessionTime.p90ActiveSeconds) },
              { label: "Median wall clock", value: secs(sessionTime.medianTotalSeconds) },
            ].map((cell) => (
              <div key={cell.label} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-500">{cell.label}</div>
                <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                  {cell.value}
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-500">
            Measured on {measuredSessions.toLocaleString()} session
            {measuredSessions === 1 ? "" : "s"}.
            {unmeasuredSessions > 0
              ? ` ${unmeasuredSessions.toLocaleString()} session${
                  unmeasuredSessions === 1 ? "" : "s"
                } in this range reported no timing and are excluded rather than counted as zero.`
              : ""}
          </p>
        </>
      )}
    </section>
  );
}

function SectionDwellPanel({
  sections,
  pageMeta,
  conversions,
}: {
  sections: SectionDwell[];
  pageMeta: LandingPageMeta | null;
  conversions: number;
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

  // A conversion recorded while its section never registered as seen is not a
  // contradiction — the section can be completed without ever clearing the 50%
  // visibility bar — but it reads as one, so the row says which it is.
  const goalSectionId = pageMeta?.goalSectionId ?? null;
  const unseenGoalSection =
    conversions > 0 &&
    goalSectionId !== null &&
    !sections.some((section) => section.sectionId === goalSectionId)
      ? goalSectionId
      : null;

  const worstExit = Math.max(...sections.map((s) => s.exitRate), 0);
  const longestMedian = Math.max(...sections.map((s) => s.medianSeconds), 1);
  const previewSrc = pageMeta ? `${pageMeta.url}${activeAnchor ? `#${activeAnchor}` : ""}` : null;

  return (
    <section className={`${CARD} space-y-4`} aria-labelledby="landing-attention-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 id="landing-attention-heading" className="text-base font-bold text-slate-900">
            Where people spend their time
          </h4>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {pageMeta
              ? "Sections in the order they appear on the page. Click a section to scroll the live page beside the numbers. "
              : ""}
            Active seconds with the section on screen and the tab focused, so a page left open in a
            background tab does not read as attention. Median rather than average, because a few
            long sessions would otherwise move every number.
          </p>
        </div>
        {pageMeta && (
          <div className="flex items-center gap-3">
            <a
              href={pageMeta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-teal-700 underline-offset-2 hover:underline"
            >
              Open page ↗
            </a>
            <button
              type="button"
              onClick={() => setShowPreview((value) => !value)}
              aria-pressed={showPreview}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
            >
              {showPreview ? "Hide page" : "Show page"}
            </button>
          </div>
        )}
      </div>

      {/* Preview first in both source and layout: it is the thing being measured.
          Its outer cell stretches to the grid row, so it matches the sections
          table height; the inner card is the sticky element and is capped to the
          viewport, so a table taller than the screen still leaves the preview in
          view instead of scrolling it away. */}
      <div className={pageMeta && showPreview ? "grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]" : ""}>
        {pageMeta && showPreview && previewSrc && (
          <div className="h-full">
            <div className="flex h-full max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white xl:sticky xl:top-4">
              <div className="shrink-0 border-b border-slate-100 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.06em] leading-relaxed text-slate-500">
                {pageMeta.label} — live page, scrollable. Interactions here are not tracked.
              </div>
              <iframe
                src={previewSrc}
                title={`Preview of ${pageMeta.label}`}
                sandbox="allow-scripts allow-forms"
                className="w-full flex-1 min-h-[420px]"
                loading="lazy"
              />
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-slate-700">
            <thead>
              <tr className={`text-left ${MICRO}`}>
                <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
                  Section
                </th>
                <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
                  Sessions
                </th>
                <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
                  Median time
                </th>
                <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
                  Top 10%
                </th>
                <th scope="col" className="border-b border-slate-200 pb-2 text-right font-normal">
                  Left from here
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const dwell = row.dwell;
                const isExitPoint =
                  dwell !== null && dwell.exitRate === worstExit && dwell.exitRate > 0;
                const clickable = pageMeta !== null && showPreview;
                const isActive = activeAnchor !== null && activeAnchor === row.anchor;
                return (
                  <tr
                    key={row.id}
                    onClick={clickable ? () => setActiveAnchor(row.anchor) : undefined}
                    className={`border-b border-slate-100 ${
                      clickable ? "cursor-pointer hover:bg-slate-50" : ""
                    } ${isActive ? "bg-sky-50" : ""}`}
                  >
                    <th scope="row" className="py-2.5 pr-4 text-left font-semibold text-slate-900">
                      {clickable ? (
                        <button
                          type="button"
                          onClick={() => setActiveAnchor(row.anchor)}
                          className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
                        >
                          {row.label}
                        </button>
                      ) : (
                        row.label
                      )}
                    </th>
                    {dwell ? (
                      <>
                        <td className="py-2.5 pr-4 text-slate-700 tabular-nums">
                          {dwell.sessions.toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 sm:block"
                            >
                              <span
                                className="block h-full rounded-full bg-teal-700"
                                style={{
                                  width: `${Math.round((dwell.medianSeconds / longestMedian) * 100)}%`,
                                }}
                              />
                            </span>
                            <span className="font-semibold text-slate-900 tabular-nums">
                              {dwell.medianSeconds}s
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-slate-500 tabular-nums">
                          {dwell.p90Seconds}s
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          <span
                            className={
                              isExitPoint ? "font-semibold text-amber-800" : "text-slate-700"
                            }
                          >
                            {dwell.exits.toLocaleString()} ({shortPct(dwell.exitRate)})
                          </span>
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="py-2.5 pr-4 text-sm text-slate-500">
                        {row.id === unseenGoalSection
                          ? "Never registered on screen, though the goal was completed — see the note below"
                          : "No session reached this section in the range"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 max-w-2xl text-sm text-slate-500">
            A long time on a section is not automatically good: it can mean the content is
            compelling, or that it is confusing. Read it alongside the drop-off above.
          </p>
          {unseenGoalSection && (
            <p className="mt-3 max-w-2xl rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <strong className="font-semibold text-slate-800">Why “{sectionLabel(unseenGoalSection)}” is empty.</strong>{" "}
              This table measures whether a section was <em>on screen</em>, at least half visible.
              The goal was completed {conversions.toLocaleString()} time
              {conversions === 1 ? "" : "s"} in this range without that section ever clearing the
              bar, so the two numbers do not contradict each other — the conversion is real, the
              visibility was never recorded.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
