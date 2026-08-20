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

interface ManifestPage {
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
  bounceRate: number | null;
  medianSeconds: number | null;
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
    <div className="min-w-[4.5rem]">
      <dt className={LABEL}>{label}</dt>
      <dd className={`font-mono text-xs ${strong ? "text-slate-900" : "text-slate-600"}`}>
        {value}
      </dd>
    </div>
  );
}

/** Whole dollars: cents are noise next to a monthly spend figure. */
const money = (value: number) =>
  `A$${Math.round(value).toLocaleString("en-AU")}`;

export function AdGroupPagesPanel({
  slug,
  range = DEFAULT_LANDING_DATE_RANGE,
}: {
  slug: string;
  range?: LandingDateRange;
}) {
  const [pages, setPages] = useState<ManifestPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [adMetrics, setAdMetrics] = useState(false);

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
        setPages(json.pages as ManifestPage[]);
        setAdMetrics(Boolean(json.adMetricsAvailable));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load pages");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, range]);

  if (error) {
    return (
      <section className={CARD}>
        <h3 className="text-base font-bold text-slate-900">Ad-group landing pages</h3>
        <p className="mt-2 text-sm text-red-600">{error}</p>
      </section>
    );
  }
  if (!pages) return <section className={CARD}><p className="text-sm text-slate-500">Loading pages…</p></section>;
  if (pages.length === 0) {
    return (
      <section className={CARD}>
        <h3 className="text-base font-bold text-slate-900">Ad-group landing pages</h3>
        <p className="mt-2 text-sm text-slate-500">No generated pages found in the manifest.</p>
      </section>
    );
  }

  const markets = [...new Set(pages.map((p) => p.market))].sort();
  const adGroupCount = new Set(pages.flatMap((page) => page.adGroups.map((group) => group.name))).size;
  const rangeLabel = landingDateRangeLabel(range);

  return (
    <section className={CARD} aria-labelledby="ad-group-pages-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 id="ad-group-pages-heading" className="text-base font-bold text-slate-900">
          Ad-group landing pages
        </h3>
        <p className={MICRO}>
          {pages.length} pages · {adGroupCount} ad groups
          {adMetrics && (
            <>
              {" · "}
              {money(pages.reduce((n, p) => n + p.cost, 0))} · {pages.reduce((n, p) => n + p.clicks, 0)} clicks
              {` (${rangeLabel})`}
            </>
          )}
        </p>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Spend and clicks come from Google Ads. Sessions, bounce, and time on site come from consented page tracking.
      </p>

      {markets.map((market) => (
        <div key={market} className="mt-5">
          <h4 className={`${MICRO} mb-2`}>{market}</h4>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {pages
              .filter((page) => page.market === market)
              /* Spend descending: the page costing the most appears first. */
              .sort((a, b) => b.cost - a.cost || b.sessions - a.sessions || a.slug.localeCompare(b.slug))
              .map((page) => {
                const open = openSlug === page.slug;
                return (
                  <li key={page.slug} className="py-2">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      {/* Identity on the left, measurement on the right: the
                          left column answers "which page is this", the right
                          answers "how is it doing". */}
                      <button
                        type="button"
                        onClick={() => setOpenSlug(open ? null : page.slug)}
                        aria-expanded={open}
                        className="min-w-[16rem] flex-1 text-left hover:text-teal-700"
                      >
                        <span className="block text-sm font-medium text-slate-900">/lp/{page.slug}</span>

                        <span className="mt-1 block text-[11px] leading-relaxed text-slate-600">
                          <span className={LABEL}>Headline</span> {page.headline}
                        </span>

                        {/* Ad group names and their campaign, not numeric ids:
                            an id says nothing about what someone searched for. */}
                        {page.adGroups.length ? (
                          adGroupSummary(page.adGroups).map((line) => (
                            <span key={line.name} className="mt-0.5 block text-[11px] leading-relaxed text-slate-600">
                              <span className={LABEL}>Ad group</span> {line.name}
                              <span className="text-slate-400"> · </span>
                              <span className={LABEL}>Campaigns</span> {line.campaigns.join(" · ")}
                            </span>
                          ))
                        ) : (
                          <span className="mt-0.5 block text-[11px] text-slate-400">
                            <span className={LABEL}>Ad group</span> none reporting
                          </span>
                        )}
                      </button>

                      <div className="flex items-start gap-4">
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-right sm:grid-cols-5">
                          {adMetrics && (
                            <>
                              <Metric label={`Spend · ${rangeLabel}`} value={money(page.cost)} strong />
                              <Metric label="Clicks" value={String(page.clicks)} />
                            </>
                          )}
                          <Metric label="Sessions" value={String(page.sessions)} />
                          <Metric
                            label="Bounce"
                            value={page.bounceRate == null ? "n/a" : `${page.bounceRate.toFixed(1)}%`}
                          />
                          <Metric
                            label="Time on site"
                            value={page.medianSeconds == null ? "n/a" : `${page.medianSeconds}s`}
                          />
                        </dl>

                        <div className="flex shrink-0 items-center gap-3 pt-3">
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
                            className="text-xs text-teal-700 underline-offset-2 hover:underline"
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
