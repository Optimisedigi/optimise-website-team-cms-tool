"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_LANDING_DATE_RANGE,
  landingDateRangeLabel,
  landingDateRangeParams,
  type LandingDateRange,
} from "@/lib/landing-date-range";

/**
 * Every generated ad-group landing page, with a preview.
 *
 * Separate from the performance report on purpose: the report can only show
 * pages that have been visited, and a page with no traffic yet is the one most
 * likely to need a look. The list comes from the build manifest, so it is the
 * pages that actually exist rather than the pages that happen to have data.
 *
 * Each row opens the page in an iframe below it. The frame is sandboxed without
 * allow-same-origin, matching the report's preview: an admin scrolling a page
 * here must not be able to touch its storage or fire tracked events.
 */

export interface ManifestPage {
  pageId: string;
  slug: string;
  market: string;
  url: string;
  title: string;
  headline: string;
  adGroupIds: string[];
  noindex: boolean;
  adGroups: { id: string; name: string; campaign: string; clicks: number; cost: number }[];
  clicks: number;
  cost: number;
  conversions: number;
  sessions: number;
  paidSessions: number;
  engagedSessions: number;
  paidEngagedSessions: number;
  trackedConversions?: number;
  paidTrackedConversions?: number;
  averageSeconds?: number | null;
  paidTimedSessions?: number;
  paidAverageSeconds?: number | null;
  bounceRate: number | null;
  medianSeconds: number | null;
  paidMedianSeconds?: number | null;
}

const CARD = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";
const MICRO = "font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500";

const LABEL = "font-mono text-[9px] uppercase tracking-[0.08em] text-slate-400";

/** One line per ad-group name; its campaigns stay attached without repeating it. */
function adGroupSummary(groups: { name: string; campaign: string }[]) {
  const byName = new Map<string, string[]>();
  for (const group of groups) {
    const name = group.name || "unknown ad group";
    const campaigns = byName.get(name) ?? [];
    if (group.campaign && !campaigns.includes(group.campaign)) campaigns.push(group.campaign);
    byName.set(name, campaigns);
  }
  return [...byName].map(([name, campaigns]) => ({ name, campaigns }));
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className={`${LABEL} block leading-tight`}>{label}</dt>
      <dd className={`font-mono text-xs ${strong ? "text-slate-900" : "text-slate-600"}`}>
        {value}
      </dd>
    </div>
  );
}

export function AdGroupPagesPanel({
  slug,
  range = DEFAULT_LANDING_DATE_RANGE,
  onPagesLoaded,
}: {
  slug: string;
  range?: LandingDateRange;
  onPagesLoaded?: (pages: ManifestPage[]) => void;
}) {
  const [pages, setPages] = useState<ManifestPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const query = new URLSearchParams({ slug });
        landingDateRangeParams(range).forEach((value, key) => query.set(key, value));
        const res = await fetch(`/api/dashboard/landing-pages?${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);
        const loadedPages = json.pages as ManifestPage[];
        setPages(loadedPages);
        onPagesLoaded?.(loadedPages);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load pages");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, range, onPagesLoaded]);

  if (error) {
    return (
      <section className={CARD}>
        <h3 className="text-base font-bold text-slate-900">Landing pages</h3>
        <p className="mt-2 text-sm text-red-600">{error}</p>
      </section>
    );
  }
  if (!pages) return null;
  if (pages.length === 0) {
    return (
      <section className={CARD}>
        <h3 className="text-base font-bold text-slate-900">Landing pages</h3>
        <p className="mt-2 text-sm text-slate-500">No generated pages found in the manifest.</p>
      </section>
    );
  }

  const servedPages = pages.filter((page) => page.paidSessions > 0);
  const rangeLabel = landingDateRangeLabel(range);
  if (servedPages.length === 0) {
    return (
      <section className={CARD}>
        <h3 className="text-base font-bold text-slate-900">Landing pages</h3>
        <p className="mt-2 text-sm text-slate-500">
          No landing page recorded a Google Ads session in {rangeLabel.toLowerCase()}.
        </p>
      </section>
    );
  }
  const markets = [...new Set(servedPages.map((page) => page.market))].sort();
  const adGroupCount = new Set(
    servedPages.flatMap((page) => page.adGroups.map((group) => group.name)),
  ).size;
  const openAll = () => {
    for (const page of servedPages) window.open(page.url, "_blank", "noopener,noreferrer");
  };

  return (
    <section className={CARD} aria-labelledby="ad-group-pages-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 id="ad-group-pages-heading" className="text-base font-bold text-slate-900">
          Landing pages
        </h3>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className={MICRO}>
            {servedPages.length} URLs · {adGroupCount} mapped ad groups ·{" "}
            {servedPages.reduce((total, page) => total + page.clicks, 0)} Google Ads clicks ·{" "}
            {servedPages.reduce((total, page) => total + page.paidSessions, 0)} Google Ads sessions ·{" "}
            {servedPages.reduce((total, page) => total + page.paidEngagedSessions, 0)} engaged
            {` (${rangeLabel})`}
          </p>
          <button
            type="button"
            onClick={openAll}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
          >
            Open all
          </button>
        </div>
      </div>
      <p className="mt-2 max-w-5xl text-xs leading-relaxed text-slate-500">
        Only sessions carrying gclid, gbraid or wbraid are reported. Google Ads clicks are mapped
        from each page&apos;s ad groups; sessions require analytics consent, so the gap between clicks
        and sessions includes consent decline, click-ID loss and exits before tracking starts.
      </p>

      {markets.map((market) => (
        <div key={market} className="mt-5">
          <h4 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-slate-700">
            {market}
          </h4>
          <ul className="space-y-3">
            {servedPages
              .filter((page) => page.market === market)
              .sort(
                (a, b) => b.paidSessions - a.paidSessions || a.url.localeCompare(b.url),
              )
              .map((page) => {
                const open = openSlug === page.slug;
                const trackedConversions = page.paidTrackedConversions ?? 0;
                const timePerSession = page.paidAverageSeconds ?? page.paidMedianSeconds;
                const conversionRate =
                  page.paidSessions > 0
                    ? `${((trackedConversions / page.paidSessions) * 100).toFixed(2)}%`
                    : "0.00%";
                return (
                  <li
                    key={page.slug}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm"
                  >
                    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,46%)_minmax(0,1fr)] lg:items-center">
                      {/* Identity on the left, measurement on the right: the
                          left column answers "which page is this", the right
                          answers "how is it doing". */}
                      <button
                        type="button"
                        onClick={() => setOpenSlug(open ? null : page.slug)}
                        aria-expanded={open}
                        className="min-w-0 text-left hover:text-teal-700"
                      >
                        <span className="block text-lg font-semibold leading-tight text-slate-900">
                          {page.headline}
                        </span>
                        <span className="mt-1 block break-all text-xs text-slate-500">
                          {page.url.replace(/^https?:\/\//, "")}
                        </span>

                        {/* Campaign first, then its ad group: that is how the account is organised. */}
                        {page.adGroups.length ? (
                          adGroupSummary(page.adGroups).map((line) => (
                            <span key={line.name} className="mt-0.5 block text-[11px] leading-relaxed text-slate-600">
                              <span className="block lg:whitespace-nowrap">
                                <span className={LABEL}>Campaign</span> {line.campaigns.join(" · ")}
                              </span>
                              <span className="block">
                                <span className={LABEL}>Ad group</span> {line.name}
                              </span>
                            </span>
                          ))
                        ) : (
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">
                            <span className="block"><span className={LABEL}>Campaign</span> not mapped</span>
                            <span className="block"><span className={LABEL}>Ad group</span> not mapped</span>
                          </span>
                        )}
                      </button>

                      <div className="flex w-full flex-wrap items-end justify-between gap-4 lg:justify-end">
                        <dl className="grid w-full grid-cols-2 gap-x-3 gap-y-3 text-left sm:grid-cols-3 lg:w-auto lg:grid-cols-6 lg:text-right">
                          <Metric label="Google Ads clicks" value={String(page.clicks)} />
                          <Metric label="Google Ads sessions" value={String(page.paidSessions)} strong />
                          <Metric label="Engaged sessions" value={String(page.paidEngagedSessions)} />
                          <Metric
                            label="Time / session"
                            value={timePerSession == null ? "n/a" : `${timePerSession}s`}
                          />
                          <Metric label="Conversions" value={String(trackedConversions)} />
                          <Metric label="Conversion rate" value={conversionRate} />
                        </dl>

                        <div className="ml-auto flex shrink-0 flex-col items-stretch gap-2">
                          <button
                            type="button"
                            onClick={() => setOpenSlug(open ? null : page.slug)}
                            aria-expanded={open}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
                          >
                            {open ? "Hide preview" : "Preview"}
                          </button>
                          <a
                            href={page.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg px-3 py-1.5 text-center text-xs text-teal-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
                          >
                            Open ↗
                          </a>
                        </div>
                      </div>
                    </div>

                    {open && (
                      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                        <div className={`border-b border-slate-100 px-3 py-2 ${MICRO} leading-relaxed`}>
                          {page.url} — live page, scrollable. Interactions here are not tracked.
                        </div>
                        <iframe
                          src={page.url}
                          title={`Preview of /lp/${page.slug}`}
                          sandbox="allow-scripts allow-forms"
                          className="h-[600px] w-full"
                          loading="lazy"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </section>
  );
}
