"use client";

import { useState } from "react";
import { LandingExperimentTab } from "../googleads/LandingExperimentTab";
import { DEFAULT_LANDING_DATE_RANGE, type LandingDateRange } from "@/lib/landing-date-range";
import { AdGroupPagesPanel, type ManifestPage } from "./AdGroupPagesPanel";
import { CategoryPreviewPanel } from "./CategoryPreviewPanel";

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

  return (
    <>
      <LandingExperimentTab
        slug={slug}
        clientName={clientName}
        range={range}
        onRangeChange={setRange}
        standaloneHeader={standaloneHeader}
        landingPages={landingPages}
      />
      <div className="mt-6">
        <AdGroupPagesPanel slug={slug} range={range} onPagesLoaded={setLandingPages} />
      </div>
      <div className="mt-6">
        <CategoryPreviewPanel slug={slug} range={range} />
      </div>
    </>
  );
}
