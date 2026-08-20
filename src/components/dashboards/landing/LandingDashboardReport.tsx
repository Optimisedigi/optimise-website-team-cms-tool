"use client";

import { useState } from "react";
import { LandingExperimentTab } from "../googleads/LandingExperimentTab";
import { DEFAULT_LANDING_DATE_RANGE, type LandingDateRange } from "@/lib/landing-date-range";
import { AdGroupPagesPanel } from "./AdGroupPagesPanel";

export function LandingDashboardReport({ slug }: { slug: string }) {
  const [range, setRange] = useState<LandingDateRange>(DEFAULT_LANDING_DATE_RANGE);

  return (
    <>
      <LandingExperimentTab slug={slug} range={range} onRangeChange={setRange} />
      <div className="mt-6">
        <AdGroupPagesPanel slug={slug} range={range} />
      </div>
    </>
  );
}
