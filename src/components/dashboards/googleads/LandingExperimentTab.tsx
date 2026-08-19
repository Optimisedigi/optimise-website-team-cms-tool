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
  /** Attribution rows only: distinct sessions that signed up for the checklist. */
  checklistSessions?: number;
  /** Paid-traffic rows only: median active seconds per session, null when unmeasured. */
  medianActiveSeconds?: number | null;
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
// Matches the Google Ads dashboard's range control, so the two reports read as
// one product rather than two apps that happen to share a login.
const SELECT =
  "rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-slate-700 " +
  "hover:bg-slate-50 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500";

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function shortPct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

/** Turn a section id into something readable without inventing a label. */
/**
 * The section template used to describe the report.
 *
 * A selected page uses its own. "All pages" uses the shared template when every
 * page in range runs the same one — true of the market pages, which are one
 * build with one section order — so the pooled view still reads in real page
 * order, with the page's own headings, and can still show the page it
 * describes. When templates differ it returns null and the table falls back to
 * raw ids ordered by time: one ordered list across two different pages would
 * describe a page that does not exist.
 */
function resolveSectionTemplate(page: string, pages: Segment[]): LandingPageMeta | null {
  if (page) return LANDING_PAGES[page] ?? null;

  const known = pages
    .filter((entry) => entry.key !== "(unset)")
    .map((entry) => LANDING_PAGES[entry.key]);
  if (known.length === 0 || known.some((meta) => !meta)) return null;

  const shape = (meta: LandingPageMeta) => meta.sections.map((section) => section.id).join("|");
  const [first, ...rest] = known;
  return rest.every((meta) => shape(meta) === shape(first)) ? first : null;
}

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
  // Promoted to the headline row: the checklist is the second outcome the page
  // is built to produce, so it belongs beside the primary goal rather than
  // further down the page.
  const checklist = data.secondaryConversions?.find((row) => row.id === "readiness_checklist");
  const running = data.experiment?.status?.toLowerCase() === "running";
  const sectionTemplate = resolveSectionTemplate(page, data.pages);

  return (
    <div className="space-y-6 text-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-slate-900">
            {data.experiment ? data.experiment.name : "No experiment configured"}
          </h3>
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
          {/* Rendered even at zero: "nobody downloaded the checklist" is a
              finding, and an absent box would read as the metric not existing. */}
          <StatCard
            label={checklist ? checklist.label : "Readiness checklist sign-ups"}
            value={checklist ? checklist.sessions.toLocaleString() : "—"}
            note={checklist ? `${pct(checklist.rate)} of sessions` : "Not counted in this range"}
          />
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

      {/* "Where people spend their time" leads: with no experiment running it is
          the question the page is actually being read for, so it sits directly
          under the headline numbers. It owns the device toggle, because the
          device split is what changes the numbers inside it. */}
      {(data.sections.length > 0 || sectionTemplate) && (
        <SectionDwellPanel
          sections={data.sections}
          pageMeta={sectionTemplate}
          conversions={conversions}
          devices={data.devices}
          totalDeviceSessions={totalDeviceSessions}
          device={device}
          onDeviceChange={setDevice}
        />
      )}

      {/* Markets and devices answer the same shape of question, so they sit on
          one row: comparing two small tables side by side is the whole point of
          having both. */}
      {(realMarkets.length > 1 ||
        data.devices.filter((entry) => entry.key !== "(unset)").length > 1) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {realMarkets.length > 1 && (
            <section className={`${CARD} space-y-4`} aria-labelledby="landing-markets-heading">
              <h4 id="landing-markets-heading" className="text-base font-bold text-slate-900">
                Markets
              </h4>
              <SegmentTable rows={data.markets} firstColumn="Market" checklistColumn />
            </section>
          )}

          {data.devices.filter((entry) => entry.key !== "(unset)").length > 1 && (
            <section className={`${CARD} space-y-4`} aria-labelledby="landing-devices-heading">
              <h4 id="landing-devices-heading" className="text-base font-bold text-slate-900">
                Devices
              </h4>
              <SegmentTable
                rows={data.devices.filter((entry) => entry.key !== "(unset)")}
                firstColumn="Device"
                checklistColumn
              />
            </section>
          )}
        </div>
      )}

      {(data.attribution?.length ?? 0) > 0 && (
        <section className={`${CARD} space-y-4`} aria-labelledby="landing-attribution-heading">
          <h4 id="landing-attribution-heading" className="text-base font-bold text-slate-900">
            Attribution
          </h4>
          <SegmentTable
            rows={data.attribution}
            firstColumn="Source / medium / campaign"
            checklistColumn
          />
        </section>
      )}

      <PaidTrafficPanel paidTraffic={data.paidTraffic} />

      <PostClickPanel months={postClick} note={postClickNote} />

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

/**
 * Markets, devices, attribution and paid traffic share one shape, so they share
 * one table. The two optional columns are opt-in per caller rather than derived
 * from the data: a column that appears only when a value happens to be present
 * reads as a rendering bug.
 */
function SegmentTable({
  rows,
  firstColumn,
  checklistColumn = false,
  timeColumn = false,
}: {
  rows: Segment[];
  firstColumn: string;
  checklistColumn?: boolean;
  timeColumn?: boolean;
}) {
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
            <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
              Conversion rate
            </th>
            {timeColumn && (
              <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
                Time on page per session
              </th>
            )}
            {checklistColumn && (
              <th scope="col" className="border-b border-slate-200 pb-2 font-normal">
                Readiness checklist sign-ups
              </th>
            )}
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
              <td className="py-3 pr-4 font-semibold text-slate-900 tabular-nums">
                {pct(entry.conversionRate)}
              </td>
              {timeColumn && (
                <td className="py-3 pr-4 text-slate-700 tabular-nums">
                  {/* Unmeasured is a dash, never 0s: a session that predates page
                      timing is not a visitor who left instantly. */}
                  {entry.medianActiveSeconds === null || entry.medianActiveSeconds === undefined
                    ? "—"
                    : `${entry.medianActiveSeconds}s`}
                </td>
              )}
              {checklistColumn && (
                <td className="py-3 text-slate-700 tabular-nums">
                  {(entry.checklistSessions ?? 0).toLocaleString()}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
      <h4 id="landing-postclick-heading" className="text-base font-bold text-slate-900">
        After the form — HubSpot
      </h4>

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
      <h4 id="landing-paid-heading" className="text-base font-bold text-slate-900">
        Google Ads traffic by landing page
      </h4>
      <SegmentTable rows={paidTraffic.pages} firstColumn="Landing page" timeColumn />
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
  conversions,
  devices,
  totalDeviceSessions,
  device,
  onDeviceChange,
}: {
  sections: SectionDwell[];
  pageMeta: LandingPageMeta | null;
  conversions: number;
  devices: Segment[];
  totalDeviceSessions: number;
  device: string;
  onDeviceChange: (device: string) => void;
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
        <h4 id="landing-attention-heading" className="text-base font-bold text-slate-900">
          Where people spend their time
        </h4>
        <div className="flex flex-wrap items-center gap-3">
          {/* The split is always visible beside the toggle, so selecting one
              device never hides how much traffic the other had. */}
          {devices.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"
              role="group"
              aria-label="Filter by device"
            >
              {[{ key: "", sessions: totalDeviceSessions, conversionRate: null as number | null }]
                .concat(
                  devices.map((entry) => ({
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
                      onClick={() => onDeviceChange(entry.key)}
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
                    </button>
                  );
                })}
            </div>
          )}
          {pageMeta && (
            <>
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
            </>
          )}
        </div>
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
