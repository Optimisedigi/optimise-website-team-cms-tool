"use client";

import { useState } from "react";

/**
 * Google Ads sessions by campaign and ad group.
 *
 * Built from the page manifest rather than the event stream because events
 * carry no campaign or ad group dimension: the join is "this page is the
 * landing page for these ad groups". So a page mapped to several ad groups
 * reports its own numbers once, on one row, listing those ad groups - splitting
 * a page's sessions between them would invent a measurement nobody took.
 *
 * Paid figures throughout: a campaign row that counted direct traffic would
 * credit the campaign for visits it never bought.
 */

export interface CampaignAdGroupRow {
  pageId: string;
  paidSessions: number;
  paidTrackedConversions?: number;
  /** Sessions whose browser delivered a dwell beacon. The rest cannot be timed. */
  paidTimedSessions?: number;
  paidAverageSeconds?: number | null;
  paidChecklistSessions?: number;
  adGroups: Array<{ name: string; campaign: string }>;
}

const CARD = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";
const MICRO = "font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500";
const CELL = "border-b border-slate-100 py-1.5 pr-4 tabular-nums";
/* A campaign row and its ad-group rows carry the same four numbers, so the
   grouping has to come from the surface, not the type: a tinted band, a rule
   above it, and a little more air separate one campaign from the next. */
const CAMPAIGN_CELL = `${CELL} border-t border-slate-200 bg-slate-100/80 pt-2.5 pb-2`;
const NO_DATA = "n/a";

/**
 * A time figure with the sessions it was actually measured on.
 *
 * Only sessions whose browser delivered a dwell beacon can be timed; a killed
 * tab or a dropped connection leaves no honest measurement, and those sessions
 * are excluded rather than counted as zero seconds. The coverage is printed
 * whenever it is short of the sessions on the row, so an average drawn from a
 * fraction of the traffic is never read as the whole picture.
 */
function TimeCell({ seconds, timed, sessions }: { seconds: number | null; timed: number; sessions: number }) {
  return (
    <>
      <span className="block">{formatSeconds(seconds)}</span>
      {timed < sessions && (
        <span className="block text-[10px] font-normal text-slate-400">
          {timed.toLocaleString()} of {sessions.toLocaleString()} timed
        </span>
      )}
    </>
  );
}

function formatSeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return NO_DATA;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
}

/** Mean seconds across the measured sessions in a group, or null when none were measured. */
function averageSeconds(rows: CampaignAdGroupRow[]): number | null {
  const measured = rows.filter((row) => row.paidAverageSeconds != null && (row.paidTimedSessions ?? 0) > 0);
  const samples = measured.reduce((total, row) => total + (row.paidTimedSessions ?? 0), 0);
  if (!samples) return null;
  return measured.reduce((total, row) => total + row.paidAverageSeconds! * (row.paidTimedSessions ?? 0), 0) / samples;
}

const sum = (rows: CampaignAdGroupRow[], pick: (row: CampaignAdGroupRow) => number | undefined) =>
  rows.reduce((total, row) => total + (pick(row) ?? 0), 0);

/**
 * The sortable metrics, each with how a campaign's rows roll up into one value.
 *
 * Time is the odd one out: it is a session-weighted mean, not a sum, and an
 * unmeasured row sorts as null rather than zero so "nobody was timed" never
 * outranks a page where people genuinely left fast.
 */
const METRICS = {
  sessions: { label: "Sessions", of: (row: CampaignAdGroupRow) => row.paidSessions, total: (rows: CampaignAdGroupRow[]) => sum(rows, (r) => r.paidSessions) },
  conversions: { label: "Conversions", of: (row: CampaignAdGroupRow) => row.paidTrackedConversions ?? 0, total: (rows: CampaignAdGroupRow[]) => sum(rows, (r) => r.paidTrackedConversions) },
  time: { label: "Avg time on page", of: (row: CampaignAdGroupRow) => ((row.paidTimedSessions ?? 0) > 0 ? row.paidAverageSeconds ?? null : null), total: averageSeconds },
  checklist: { label: "Checklist sign-ups", of: (row: CampaignAdGroupRow) => row.paidChecklistSessions ?? 0, total: (rows: CampaignAdGroupRow[]) => sum(rows, (r) => r.paidChecklistSessions) },
} as const;

type Metric = keyof typeof METRICS;

/**
 * A campaign name with its match type dropped.
 *
 * The build splits each campaign by match type - `… – US – Exact` and
 * `… – US – Phrase` - which is a bidding decision, not a different campaign. Two
 * near-identical rows for one audience is harder to read than their total, so
 * the trailing match type is trimmed and the pair folds into one group.
 */
function campaignGroupName(campaign: string): string {
  return campaign.replace(/\s*[–—-]\s*(exact|phrase|broad|bmm|modified broad)\s*$/i, "").trim() || campaign;
}

/** Nulls sink to the bottom whichever way the column is pointed. */
function compare(a: number | null, b: number | null, direction: "asc" | "desc"): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "desc" ? b - a : a - b;
}

export function CampaignAdGroupTable({ pages }: { pages: CampaignAdGroupRow[] }) {
  const [metric, setMetric] = useState<Metric>("sessions");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const mapped = pages.filter((page) => page.adGroups.length > 0 && page.paidSessions > 0);
  if (mapped.length === 0) return null;

  const { of, total } = METRICS[metric];
  const campaigns = [...mapped.reduce((groups, page) => {
    const named = page.adGroups.find((group) => group.campaign)?.campaign;
    const campaign = named ? campaignGroupName(named) : "Campaign not mapped";
    groups.set(campaign, [...(groups.get(campaign) ?? []), page]);
    return groups;
  }, new Map<string, CampaignAdGroupRow[]>())].sort(([, a], [, b]) => compare(total(a), total(b), direction));

  /* Clicking the active column flips it; a new column starts on the reading
     most people want first - biggest at the top. */
  const sortBy = (next: Metric) => {
    setDirection(next === metric && direction === "desc" ? "asc" : "desc");
    setMetric(next);
  };

  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="landing-campaigns-heading">
      <div>
        <h4 id="landing-campaigns-heading" className="text-base font-bold text-slate-900">
          Campaigns and ad groups
        </h4>
        <p className="text-xs text-slate-500">
          Google Ads sessions only. Figures are per landing page, so a page shared by several ad groups is
          reported once. Time is active on-page time, paused while the tab is hidden or idle, averaged over the
          sessions that could be timed.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-slate-700">
          <thead>
            <tr className={`text-left ${MICRO}`}>
              <th scope="col" className="border-b border-slate-200 pb-2 pr-4 font-normal">Campaign / ad group</th>
              {(Object.keys(METRICS) as Metric[]).map((key, index) => {
                const active = metric === key;
                return (
                  <th
                    key={key}
                    scope="col"
                    aria-sort={active ? (direction === "desc" ? "descending" : "ascending") : "none"}
                    className={`border-b border-slate-200 pb-2 text-right font-normal ${index === Object.keys(METRICS).length - 1 ? "" : "pr-4"}`}
                  >
                    <button
                      type="button"
                      onClick={() => sortBy(key)}
                      className={`inline-flex items-center gap-1 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 ${active ? "text-slate-900" : ""}`}
                    >
                      {METRICS[key].label}
                      <span aria-hidden="true" className={active ? "" : "text-slate-300"}>
                        {active && direction === "asc" ? "↑" : "↓"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {campaigns.map(([campaign, rows]) => (
              <CampaignRows key={campaign} campaign={campaign} rows={rows} sortValue={of} direction={direction} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** One campaign: a totals row, then its ad-group pages beneath it. */
function CampaignRows({
  campaign,
  rows,
  sortValue,
  direction,
}: {
  campaign: string;
  rows: CampaignAdGroupRow[];
  sortValue: (row: CampaignAdGroupRow) => number | null;
  direction: "asc" | "desc";
}) {
  const ordered = [...rows].sort((a, b) => compare(sortValue(a), sortValue(b), direction));
  return (
    <>
      <tr className="font-semibold text-slate-900">
        <th scope="rowgroup" className={`${CAMPAIGN_CELL} text-left font-semibold`}>{campaign}</th>
        <td className={`${CAMPAIGN_CELL} text-right`}>{sum(rows, (r) => r.paidSessions).toLocaleString()}</td>
        <td className={`${CAMPAIGN_CELL} text-right`}>{sum(rows, (r) => r.paidTrackedConversions).toLocaleString()}</td>
        <td className={`${CAMPAIGN_CELL} text-right`}>
          <TimeCell
            seconds={averageSeconds(rows)}
            timed={sum(rows, (r) => r.paidTimedSessions)}
            sessions={sum(rows, (r) => r.paidSessions)}
          />
        </td>
        <td className={`${CAMPAIGN_CELL} pr-0 text-right`}>{sum(rows, (r) => r.paidChecklistSessions).toLocaleString()}</td>
      </tr>
      {ordered.map((page) => (
        <tr key={page.pageId}>
          <th scope="row" className={`${CELL} pl-4 text-left font-normal text-slate-700`}>
            {[...new Set(page.adGroups.map((group) => group.name).filter(Boolean))].join(", ") || "Ad group not named"}
          </th>
          <td className={`${CELL} text-right`}>{page.paidSessions.toLocaleString()}</td>
          <td className={`${CELL} text-right`}>{(page.paidTrackedConversions ?? 0).toLocaleString()}</td>
          <td className={`${CELL} text-right`}>
            <TimeCell
              seconds={page.paidAverageSeconds ?? null}
              timed={page.paidTimedSessions ?? 0}
              sessions={page.paidSessions}
            />
          </td>
          <td className={`${CELL} pr-0 text-right`}>{(page.paidChecklistSessions ?? 0).toLocaleString()}</td>
        </tr>
      ))}
    </>
  );
}
