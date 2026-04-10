# Google Ads Dashboard: CPA Consistency & Default YoY Comparison

## Analysis

### Issue 1: Inconsistent CPA / Cost per Conversion labelling
The KPI boxes on the overview tab use **"Cost/Conv"** while all tables (CategoryBreakdown, TopKeywords, KeywordDeepDive, QualityScoreTab) use **"CPA"**. The ProgressTab also uses "Cost per Conversion" in its stat card and trend metric config. Need to standardise everything to "CPA".

**Current inconsistencies found:**
- `KpiRow.tsx` line 47: `label="Cost/Conv"` → should be "CPA"
- `ProgressTab.tsx` line 35: `label: "Cost per Conversion"` (METRIC_CONFIG) → should be "CPA"
- `ProgressTab.tsx` line 36: `description: "Average cost to acquire one conversion"` → keep as-is (it's a description, not a label)
- `ProgressTab.tsx` line 343: `label="Cost per Conversion"` (StatCard) → should be "CPA"

### Issue 2: Default comparison should be vs Last Year, not vs Last Month
Currently `compareMode` defaults to `"month"` (line 48 of GoogleAdsDashboard.tsx). The user wants it to default to `"year"` so the KPI boxes show YoY comparison by default.

The YoY data (`yoy*` fields) is already provided by the Growth Tools service and wired up in KpiRow.tsx — it's just not the default view.

### Issue 3: "Same dates for this time last year"
The YoY comparison data comes from the Growth Tools external service (`GROWTH_TOOLS_URL`). The CMS just passes through whatever the service returns. This is a backend concern on the Growth Tools side, not something that can be changed here in the CMS frontend. The CMS frontend correctly passes the `range` parameter to Growth Tools. If the Growth Tools service needs adjusting to use exact date matching for YoY, that's a separate task outside this codebase. **No change needed here** — but worth noting to the user.

## Steps

1. In `src/components/dashboards/googleads/KpiRow.tsx`, change line 47 from `label="Cost/Conv"` to `label="CPA"` for consistency with all table columns
2. In `src/components/dashboards/googleads/GoogleAdsDashboard.tsx`, change line 48 from `useState<"month" | "year">("month")` to `useState<"month" | "year">("year")` so YoY is the default comparison mode
3. In `src/components/dashboards/googleads/ProgressTab.tsx`, change the METRIC_CONFIG `cpa.label` (line 35) from `"Cost per Conversion"` to `"CPA"` for consistency
4. In `src/components/dashboards/googleads/ProgressTab.tsx`, change the StatCard `label` (line 343) from `"Cost per Conversion"` to `"CPA"` for consistency
5. Run `npx tsc --noEmit` to verify no type errors
6. Run `npm test` to verify no test failures
