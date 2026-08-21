"use client";

import { useEffect, useState } from "react";
import RocketSplash from "@/components/RocketSplash";
import { resolveLandingPage, type LandingPageMeta } from "@/lib/landing-page-sections";
import { isAwayDigitalSlug } from "@/lib/away-digital";
import {
  DEFAULT_LANDING_DATE_RANGE,
  landingDateRangeLabel,
  landingDateRangeParams,
  type LandingDateRange,
  type LandingDateRangeMode,
} from "@/lib/landing-date-range";

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
  timingSamples?: number;
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
  /** Distinct Google Ads sessions that reached the engagement threshold. */
  engagedSessions?: number;
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

/**
 * Shown where a figure genuinely has no value behind it.
 *
 * Spelled out rather than a dash: "n/a" survives being read aloud, copied into
 * a spreadsheet, or skimmed at a glance, where a lone punctuation mark reads as
 * a rendering fault. Never used for a real zero, which is a finding of its own.
 */
const NO_DATA = "n/a";

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function shortPct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

/**
 * Seconds as a duration a reader can judge at a glance.
 *
 * Under a minute stays in seconds, because "0m 42s" is harder to read than
 * "42s". Above it, minutes lead: "3m 05s" lands faster than "185s".
 */
function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return NO_DATA;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
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
  if (page) return resolveLandingPage(page) ?? null;

  /* Unrecognised ids are skipped rather than treated as fatal. Bailing out on
     the first unknown id meant one stray page_id - or one new page - removed
     the section table AND the preview for every page in the report, which is a
     far worse answer than describing the pages we do recognise. */
  const known = pages
    .filter((entry) => entry.key !== "(unset)")
    .map((entry) => resolveLandingPage(entry.key))
    .filter((meta): meta is LandingPageMeta => meta !== null);
  if (known.length === 0) return null;

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

/** One headline number. */
function StatCard({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm min-[1120px]:p-5">
      <div className="text-[11px] text-slate-500 min-[1120px]:text-xs">{label}</div>
      <div
        className={`mt-1.5 text-[clamp(1rem,2.1vw,1.875rem)] font-bold leading-tight tracking-tight tabular-nums ${
          accent ? "text-teal-700" : "text-slate-900"
        }`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11px] leading-snug text-slate-500 min-[1120px]:text-xs">
        {note}
      </div>
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
  range: controlledRange,
  onRangeChange,
  standaloneHeader = false,
  landingPages,
}: {
  slug: string;
  customerId?: string;
  clientName?: string;
  range?: LandingDateRange;
  onRangeChange?: (range: LandingDateRange) => void;
  standaloneHeader?: boolean;
  landingPages?: Array<{
    pageId: string;
    title: string;
    clicks: number;
    paidSessions: number;
    paidEngagedSessions: number;
    paidTrackedConversions?: number;
    paidTimedSessions?: number;
    paidAverageSeconds?: number | null;
    adGroups: Array<{ name: string }>;
  }>;
}) {
  const [data, setData] = useState<ReportResponse | null>(null);
  const [catalogPages, setCatalogPages] = useState<
    Array<{ pageId: string; title: string; adGroupName?: string; clicks: number }>
  >([]);
  const providedCatalogPages = landingPages?.map((entry) => ({
    pageId: entry.pageId,
    title: entry.title,
    clicks: entry.clicks,
    adGroupName: entry.adGroups[0]?.name,
  }));
  const effectiveCatalogPages = providedCatalogPages ?? catalogPages;
  const [postClick, setPostClick] = useState<PostClickMonth[] | null>(null);
  const [postClickNote, setPostClickNote] = useState<string | null>(null);
  const [internalRange, setInternalRange] = useState<LandingDateRange>(DEFAULT_LANDING_DATE_RANGE);
  const [rangeTooltipVisible, setRangeTooltipVisible] = useState(false);
  const range = controlledRange ?? internalRange;
  const updateRange = (next: LandingDateRange) => {
    setInternalRange(next);
    onRangeChange?.(next);
  };
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

    const query = new URLSearchParams({ slug });
    landingDateRangeParams(range).forEach((value, key) => query.set(key, value));
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
  }, [slug, range, page, device]);

  useEffect(() => {
    if (landingPages !== undefined || !isAwayDigitalSlug(slug)) return;
    let cancelled = false;
    const catalogQuery = new URLSearchParams({ slug });
    landingDateRangeParams(range).forEach((value, key) => catalogQuery.set(key, value));

    fetch(`/api/dashboard/landing-pages?${catalogQuery}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as { pages?: unknown[] };
      })
      .then(({ pages }) => {
        if (cancelled || !Array.isArray(pages)) return;
        setCatalogPages(
          pages.flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const row = entry as Record<string, unknown>;
            const pageId = typeof row.pageId === "string" ? row.pageId : "";
            const title = typeof row.title === "string" ? row.title : pageId;
            const numericClicks = Number(row.clicks);
            const clicks = Number.isFinite(numericClicks) && numericClicks >= 0 ? numericClicks : 0;
            const adGroupName = Array.isArray(row.adGroups)
              ? row.adGroups.flatMap((group) => {
                  if (!group || typeof group !== "object") return [];
                  const name = (group as Record<string, unknown>).name;
                  return typeof name === "string" && name.trim() ? [name.trim()] : [];
                })[0]
              : undefined;
            return resolveLandingPage(pageId) ? [{ pageId, title, adGroupName, clicks }] : [];
          }),
        );
      })
      .catch(() => {
        // Event-backed pages remain usable if the optional catalog is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [slug, range, landingPages]);
  /**
   * What happened to these leads after the form, from HubSpot.
   *
   * Read-only, and only for the client that has the integration. Nothing here
   * creates or edits a HubSpot record. A missing service URL or key is reported
   * as a configuration gap rather than as zero leads, because "not connected"
   * and "nobody converted" are opposite findings.
   */
  useEffect(() => {
    if (!isAwayDigitalSlug(slug) || !customerId) return;
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

  // The same rocket the Google Ads dashboard shows, so moving between the two
  // reports does not look like moving between two different products.
  if (loading)
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <RocketSplash onLight />
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
  const realMarkets = data.markets.filter((entry) => entry.key !== "(unset)");
  const catalogTitles = new Map(effectiveCatalogPages.map((entry) => [entry.pageId, entry.title]));
  const headlinePages = landingPages?.filter((entry) => !page || entry.pageId === page);
  const googleAdsClicks = (headlinePages ?? effectiveCatalogPages)
    .filter((entry) => !page || entry.pageId === page)
    .reduce((sum, entry) => sum + entry.clicks, 0);
  const headlineSessions = headlinePages
    ? headlinePages.reduce((sum, entry) => sum + entry.paidSessions, 0)
    : sessions;
  const headlineEngagedSessions = headlinePages
    ? headlinePages.reduce((sum, entry) => sum + entry.paidEngagedSessions, 0)
    : (data.engagedSessions ?? 0);
  const headlineConversions = headlinePages
    ? headlinePages.reduce((sum, entry) => sum + (entry.paidTrackedConversions ?? 0), 0)
    : conversions;
  const headlineConversionRate =
    headlineSessions > 0 ? headlineConversions / headlineSessions : 0;
  const headlineTimedSessions = headlinePages
    ? headlinePages.reduce((sum, entry) => sum + (entry.paidTimedSessions ?? 0), 0)
    : (data.sessionTime?.measuredSessions ?? 0);
  const headlineAverageSeconds = headlinePages
    ? headlineTimedSessions > 0
      ? headlinePages.reduce(
          (sum, entry) =>
            sum + (entry.paidAverageSeconds ?? 0) * (entry.paidTimedSessions ?? 0),
          0,
        ) / headlineTimedSessions
      : null
    : (data.sessionTime?.medianActiveSeconds ?? null);
  const hasHeadlineData = headlineSessions > 0 || googleAdsClicks > 0;
  const pageLabel = (key: string) =>
    (catalogTitles.get(key) ?? key).replace(/\s*\|\s*Away Digital Teams[’']?\s*$/i, "");
  const pageOptions = [...data.pages];
  for (const entry of effectiveCatalogPages) {
    if (!pageOptions.some((option) => option.key === entry.pageId)) {
      pageOptions.push({ key: entry.pageId, sessions: 0, conversions: 0, conversionRate: 0 });
    }
  }

  const goalLabel = data.experiment
    ? BEHAVIOUR_LABELS[data.experiment.primaryGoal] ?? data.experiment.primaryGoal
    : "Conversions";
  const running = data.experiment?.status?.toLowerCase() === "running";
  const sectionTemplate = resolveSectionTemplate(page, pageOptions);
  // The shared market previews predate ad-group landing page IDs; each is the
  // template behind its matching generic Vietnam outsourcing ad group.
  const previewCatalogPageId =
    sectionTemplate?.pageId === "offshore-teams-au"
      ? "ag-vietnam-outsourcing-au"
      : sectionTemplate?.pageId === "offshore-teams-us"
        ? "ag-vietnam-outsourcing-us"
        : sectionTemplate?.pageId;
  const previewAdGroupName = effectiveCatalogPages.find(
    (entry) => entry.pageId === previewCatalogPageId,
  )?.adGroupName;

  return (
    <div className="space-y-6 text-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {standaloneHeader && (
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="my-0 text-[26px] font-bold leading-tight tracking-tight text-slate-900">
              {clientName}
            </h1>
            <span className="text-lg font-normal text-slate-400">Landing Page Performance</span>
          </div>
        )}
        <div
          className="relative ml-auto flex flex-wrap items-end gap-3"
          onMouseLeave={() => setRangeTooltipVisible(false)}
        >
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
          {pageOptions.length > 0 && (
            <label className="flex max-w-full flex-col gap-1 text-xs text-slate-500">
              Page
              <select
                value={page}
                onChange={(event) => setPage(event.target.value)}
                className={`${SELECT} max-w-full`}
              >
                <option value="">All pages</option>
                {pageOptions.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {pageLabel(entry.key)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex flex-col gap-1 text-xs text-slate-500">
            <label htmlFor="landing-range-select" className="flex items-center gap-1">
              Range
              {data.baselineApplied && data.dataStartDate && (
                <span className="inline-flex">
                  <button
                    type="button"
                    aria-label="About this report's data range"
                    aria-describedby="landing-range-tooltip"
                    onMouseEnter={() => setRangeTooltipVisible(true)}
                    onFocus={() => setRangeTooltipVisible(true)}
                    onBlur={() => setRangeTooltipVisible(false)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setRangeTooltipVisible(false);
                        event.currentTarget.blur();
                      }
                    }}
                    className="flex size-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-medium text-slate-400 hover:border-slate-300 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/30"
                  >
                    ?
                  </button>
                </span>
              )}
            </label>
            <select
              id="landing-range-select"
              value={range.mode}
              onChange={(event) => {
                const mode = event.target.value as LandingDateRangeMode;
                if (mode === "custom") {
                  const today = new Date().toISOString().slice(0, 10);
                  updateRange({ mode, start: range.start ?? today, end: range.end ?? today });
                } else {
                  updateRange({ mode });
                }
              }}
              className={SELECT}
            >
              <option value="this_week">This week (Mon–Sun)</option>
              <option value="today">Today</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom dates</option>
            </select>
          </div>
          {range.mode === "custom" && (
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                From
                <input
                  type="date"
                  value={range.start ?? ""}
                  max={range.end ?? new Date().toISOString().slice(0, 10)}
                  onChange={(event) => updateRange({ ...range, start: event.target.value })}
                  className={SELECT}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                To
                <input
                  type="date"
                  value={range.end ?? ""}
                  min={range.start}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => updateRange({ ...range, end: event.target.value })}
                  className={SELECT}
                />
              </label>
            </div>
          )}
          {data.baselineApplied && data.dataStartDate && (
            <span
              id="landing-range-tooltip"
              role="tooltip"
              className={`absolute right-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg ${
                rangeTooltipVisible ? "visible" : "invisible"
              }`}
            >
              Showing data from {new Date(data.dataStartDate).toLocaleDateString()} onwards.
            </span>
          )}
        </div>
      </div>

      {/* Six across for as long as they fit, because they are read together as
          one headline; stacked they stop being a summary and start being a list
          you have to scroll. The dashboard renders at 85% zoom, so the sm/md
          breakpoints land far wider than they read, and holding six to `xl`
          wrapped them two-up on a laptop that had room for the row. */}
      {hasHeadlineData && (
        <div className="grid grid-cols-2 gap-3 min-[640px]:grid-cols-3 min-[760px]:grid-cols-6 min-[1120px]:gap-4">
          <StatCard
            label="Google Ads clicks"
            value={googleAdsClicks.toLocaleString()}
            note="Mapped ad-group clicks from Google Ads"
          />
          <StatCard
            label="Google Ads sessions"
            value={headlineSessions.toLocaleString()}
            note={`${landingDateRangeLabel(range)}${page ? ` · ${pageLabel(page)}` : ""}`}
          />
          <StatCard
            label="Engaged sessions"
            value={headlineEngagedSessions.toLocaleString()}
            note="Google Ads sessions engaged for at least three seconds"
          />
          <StatCard label="Conversions" value={headlineConversions.toLocaleString()} note={goalLabel} />
          <StatCard
            label="Conversion rate"
            value={pct(headlineConversionRate)}
            accent
            note={
              realMarkets.length > 1
                ? realMarkets.map((m) => `${m.key} ${pct(m.conversionRate)}`).join(" · ")
                : "Google Ads sessions that reached the primary goal"
            }
          />
          {/* Active time, not wall-clock: a tab left open in the background is
              not someone reading. Median, because a handful of abandoned tabs
              would pull a mean away from the typical visit. */}
          <StatCard
            label="Time / session"
            value={headlineAverageSeconds == null ? NO_DATA : formatSeconds(headlineAverageSeconds)}
            note={
              headlineTimedSessions > 0
                ? `Average across ${headlineTimedSessions.toLocaleString()} measured Google Ads sessions`
                : "Not measured in this range"
            }
          />
        </div>
      )}


      {/* A quiet footnote, not a warning banner. It only appears once the scan
          actually hits its ceiling, and by then the numbers shown are the most
          recent ones — which is what the reader wanted anyway. */}
      {data.truncated && (
        <p className="text-xs text-slate-500" role="status">
          Showing the most recent {data.eventsScanned.toLocaleString()} events in this range. Older
          activity is not included in the figures above.
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
          previewLabel={previewAdGroupName ?? sectionTemplate?.label ?? "Landing page"}
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
              <SegmentTable
                rows={data.markets}
                firstColumn="Market"
                checklistColumn
                timeColumn
                timeLabel="Average time on site"
              />
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
                timeColumn
                timeLabel="Average time on site"
              />
            </section>
          )}
        </div>
      )}


      <PostClickPanel months={postClick} note={postClickNote} />

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
  // Named by the caller: the same median reads as "time on page" for one
  // landing page and "time on site" for a market spanning several.
  timeLabel = "Time on page per session",
}: {
  rows: Segment[];
  firstColumn: string;
  checklistColumn?: boolean;
  timeColumn?: boolean;
  timeLabel?: string;
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
                {timeLabel}
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
                  {/* Unmeasured is a dash, never 0s: a session recorded before
                      page timing shipped is not a visitor who left instantly. */}
                  {entry.medianActiveSeconds === null || entry.medianActiveSeconds === undefined
                    ? NO_DATA
                    : formatSeconds(entry.medianActiveSeconds)}
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
        After the form: HubSpot
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
                    {row.meetingRate === null ? NO_DATA : `${row.meetingRate}%`}
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
  previewLabel,
  conversions,
  devices,
  totalDeviceSessions,
  device,
  onDeviceChange,
}: {
  sections: SectionDwell[];
  pageMeta: LandingPageMeta | null;
  previewLabel: string;
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
  const hasReachData = sections.length > 0 && sections.every((section) => section.timingSamples !== undefined);
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
          {pageMeta && !showPreview && (
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
            >
              Show preview
            </button>
          )}
        </div>
      </div>

      {/* Preview first in both source and layout: it is the thing being measured.
          Its outer cell stretches to the grid row, so it matches the sections
          table height; the inner card is the sticky element and is capped to the
          viewport, so a table taller than the screen still leaves the preview in
          view instead of scrolling it away. */}
      <div
        className={
          pageMeta && showPreview
            ? "grid gap-6 min-[860px]:grid-cols-[clamp(280px,32vw,400px)_minmax(0,1fr)]"
            : ""
        }
      >
        {pageMeta && showPreview && previewSrc && (
          <div className="h-full">
            <div className="flex h-full max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white min-[860px]:sticky min-[860px]:top-4">
              <div className="shrink-0 border-b border-slate-100 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.06em] leading-relaxed text-slate-500">
                {previewLabel}
              </div>
              <iframe
                src={previewSrc}
                title={`Preview of ${pageMeta.label}`}
                sandbox="allow-scripts allow-forms"
                className="w-full flex-1 min-h-[420px]"
                loading="lazy"
              />
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-3 py-2">
                <a
                  href={pageMeta.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-teal-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
                >
                  Open page ↗
                </a>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
                >
                  Hide preview
                </button>
              </div>
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
                  {hasReachData ? "Reached" : "Sessions"}
                </th>
                <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">
                  Median dwell
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
                const timingSamples = dwell?.timingSamples ?? dwell?.sessions ?? 0;
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
                          {timingSamples > 0 ? (
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
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
                              <span className="text-[10px] text-slate-400 tabular-nums">
                                {timingSamples.toLocaleString()} timed
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400">Not timed</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-slate-500 tabular-nums">
                          {timingSamples > 0 ? `${dwell.p90Seconds}s` : "—"}
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
                          ? "Never registered on screen, though the goal was completed. See the note below."
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
              bar, so the two numbers do not contradict each other. The conversion is real, the
              visibility was never recorded.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
