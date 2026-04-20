# Mission Brief Slide Redesign

## Analysis

The Mission Brief (slide-5) in `src/app/(frontend)/proposals/[slug]/page.tsx` (lines 2150-2329) currently has:

1. **Client overview section** (dark bg `#0b1120`) with business name, type, goal, GBP, services
2. **PageSpeed Insights** — 4 gauges: Performance, Accessibility, Best Practices, SEO
3. **Mission brief details** — avg order value, lead conversion rate, etc. (white text on dark bg)
4. **Instrument panel** (below client-overview) — 4 score cards: Monthly Search Volume, Competitor Monthly Web Traffic, CRO Score, SEO Score

CSS: `report.css`

## Changes Required

### A. Reduce font size of forecast data points (avg order value, conversion rate, etc.)
- File: `report.css`
- `.mission-brief-detail-label` line 1863: reduce `font-size: 14px` → `12px`
- `.mission-brief-detail-value` line 1871: reduce `font-size: 18px` → `15px`
- Add a title above this section: "Forecast Estimates" or similar

### B. Remove SEO circle from PageSpeed Insights
- File: `page.tsx` line 2237: remove the `lighthouseScores.seo` gauge

### C. Move CRO + SEO scores next to PageSpeed Insights as gauge circles
- Remove croScore and seoScore from the `instrument-panel-cards` (OverviewScoreCard)
- Add them as PageSpeedGauge-style circles to the right of PageSpeed Insights
- Scores are out of 10 (e.g. 5.2, 5.6), not out of 100 — display just the number, no "/10"
- Color: score >= 8.5 → light green, score >= 5 → amber, < 5 → red (these are /10 scores)
- Create a new combined "scores-row" section that has PSI gauges on left, audit scores on right

### D. Make Monthly Search Volume and Competitor Traffic more prominent
- Replace the generic OverviewScoreCard with two styled "stat-box" cards
- Monthly Search Volume box: "For relevant search terms in {location}, there are {volume} monthly searches from potential customers"
- Competitor Traffic box: "Across {keywords.length} keywords, competitors drive {traffic} monthly visits to their websites"
- Make these bigger, more prominent — they're key selling points

### E. Intro page — dark blue client name
- File: `report.css` line 1793: `.slide-1-business` color change from `#3b82f6` to `#1e3a5f` (dark blue)

## Steps
1. Change `.slide-1-business` color from `#3b82f6` to `#1e3a5f` (dark blue) in report.css line 1796
2. Reduce `.mission-brief-detail-label` font-size to 12px and `.mission-brief-detail-value` font-size to 15px in report.css lines 1864/1872, and add a "Used for Forecast Estimates" title above the details section in page.tsx line 2242
3. Remove the PageSpeed Insights SEO gauge from page.tsx line 2237
4. Create a new combined scores row: PSI gauges on left, CRO/SEO audit score gauges on right — reuse PageSpeedGauge but scale scores from /10 to display value, use green >= 8.5, amber >= 5, red < 5 thresholds; add new CSS class `.audit-score-gauges` for the right section; remove seoScore/croScore OverviewScoreCards from instrument-panel
5. Redesign the instrument panel: replace the two traffic OverviewScoreCards with two prominent stat-box cards showing contextual copy with location and keyword count, add CSS for `.stat-highlight-box` styling
6. Run `npx tsc --noEmit` and `npm test` to verify no type errors or test failures
