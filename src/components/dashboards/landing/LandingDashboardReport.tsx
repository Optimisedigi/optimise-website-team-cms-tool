"use client";

import { useState } from "react";
import { LandingExperimentTab } from "../googleads/LandingExperimentTab";
import { DEFAULT_LANDING_DATE_RANGE, type LandingDateRange } from "@/lib/landing-date-range";
import { AdGroupPagesPanel, type ManifestPage } from "./AdGroupPagesPanel";
import { CategoryPreviewPanel } from "./CategoryPreviewPanel";
import { ChatFunnelPanel } from "./ChatFunnelPanel";
import { hasLayouts, type LandingLayoutId } from "@/lib/landing-layouts";

export function LandingDashboardReport({
  slug,
  clientName,
  standaloneHeader = false,
}: {
  slug: string;
  clientName?: string;
  standaloneHeader?: boolean;
}) {
  const [range, setRange] = useState<LandingDateRange>(DEFAULT_LANDING_DATE_RANGE);
  const [landingPages, setLandingPages] = useState<ManifestPage[]>([]);
  const [reportLoading, setReportLoading] = useState(true);
  // Away's pages were rebuilt in place; every panel reports on one layout at a
  // time, the current one unless the reader switches. Other clients have one.
  const [layoutState, setLayout] = useState<LandingLayoutId>("current");
  const layoutAware = hasLayouts(slug);
  const layout = layoutAware ? layoutState : undefined;

  return (
    <>
      <LandingExperimentTab
        slug={slug}
        clientName={clientName}
        range={range}
        onRangeChange={setRange}
        standaloneHeader={standaloneHeader}
        landingPages={landingPages}
        onLoadingChange={setReportLoading}
        layout={layout}
        onLayoutChange={setLayout}
      />
      {/* While the report is loading it fills the page with the rocket splash, and
          a panel finishing early underneath it - or failing early - showed up as a
          stray card floating below the animation. The panels stay mounted so their
          own requests still run in parallel; they are just kept out of sight until
          there is a report for them to sit beneath. */}
      <div hidden={reportLoading}>
        {layoutAware && (
          <div className="mt-6">
            <ChatFunnelPanel slug={slug} range={range} layout={layout} />
          </div>
        )}
        <div className="mt-6">
          <AdGroupPagesPanel slug={slug} range={range} layout={layout} onPagesLoaded={setLandingPages} />
        </div>
        <div className="mt-6">
          <CategoryPreviewPanel slug={slug} range={range} layout={layout} />
        </div>
      </div>
    </>
  );
}
