"use client";

import { useEffect, useState } from "react";
import { landingDateRangeParams, type LandingDateRange } from "@/lib/landing-date-range";
import type { ManifestPage } from "./AdGroupPagesPanel";

const CARD = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";
const LABEL = "font-mono text-[9px] uppercase tracking-[0.08em] text-slate-400";

/** Local-only review catalog for category pages that have not been deployed yet. */
export function CategoryPreviewPanel({ slug, range }: { slug: string; range: LandingDateRange }) {
  const [pages, setPages] = useState<ManifestPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const query = new URLSearchParams({ slug, preview: "1" });
        landingDateRangeParams(range).forEach((value, key) => query.set(key, value));
        const response = await fetch(`/api/dashboard/landing-pages?${query}`);
        const json = await response.json();
        if (!response.ok) throw new Error(json?.error || `Failed (${response.status})`);
        if (!cancelled) {
          setPages((json.pages as ManifestPage[]).filter((page) => /-vietnam-(?:au|us)$/.test(page.slug)));
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load previews");
      }
    })();
    return () => { cancelled = true; };
  }, [slug, range]);

  if (error) return <section className={CARD}><h3 className="text-base font-bold">Category page previews</h3><p className="mt-2 text-sm text-red-600">{error}</p></section>;
  if (!pages) return <section className={CARD}><h3 className="text-base font-bold">Category page previews</h3><p className="mt-2 text-sm text-slate-500">Loading previews…</p></section>;

  const campaignGroups = [...pages.reduce((groups, page) => {
    const campaign = page.adGroups.find((group) => group.campaign)?.campaign || "Campaign not mapped";
    groups.set(campaign, [...(groups.get(campaign) ?? []), page]);
    return groups;
  }, new Map<string, ManifestPage[]>())].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className={CARD} aria-labelledby="category-preview-heading">
      <div>
        <h3 id="category-preview-heading" className="text-base font-bold text-slate-900">Category page previews</h3>
        <p className="mt-1 text-xs text-slate-500">{pages.length} local pages across {campaignGroups.length} campaigns. No performance metrics are shown.</p>
      </div>

      <div className="mt-4 space-y-4">
        {campaignGroups.map(([campaign, campaignPages]) => (
          <section key={campaign} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60" aria-label={campaign}>
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-100/80 px-4 py-2.5">
              <h4 className="text-sm font-semibold text-slate-800">{campaign}</h4>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">{campaignPages.length} pages</span>
            </header>
            <ul className="columns-1 gap-2 p-2 md:columns-2 xl:columns-3">
              {[...campaignPages].sort((a, b) => a.headline.localeCompare(b.headline)).map((page) => {
                const open = openSlug === page.slug;
                const adGroups = [...new Set(page.adGroups.map((group) => group.name).filter(Boolean))];
                return (
                  <li key={page.pageId} className="mb-2 break-inside-avoid rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <button type="button" onClick={() => setOpenSlug(open ? null : page.slug)} aria-expanded={open} className="min-w-0 text-left hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40">
                        <span className={`${LABEL} block`}>Ad group · {page.market}</span>
                        <span className="block truncate text-xs font-medium text-slate-600">{adGroups.join(", ") || "not mapped"}</span>
                        <span className="mt-0.5 block text-sm font-semibold leading-snug text-slate-900">{page.headline}</span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button type="button" onClick={() => setOpenSlug(open ? null : page.slug)} aria-expanded={open} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40">{open ? "Hide" : "Preview"}</button>
                        <a href={page.url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] text-teal-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40">Open ↗</a>
                      </div>
                    </div>
                    {open && <div className="mt-2 overflow-hidden rounded-lg border border-slate-200"><iframe src={page.url} title={`Preview of ${page.headline}`} sandbox="allow-scripts allow-forms" className="h-[520px] w-full" loading="lazy" /></div>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
