# Audit Health Score Slide Redesign

## Analysis

The screenshot shows a new layout for SEO (slide 10) and CRO (slide 8) overview sections:
- **Left side**: Large circular ring gauge (score/100) with status label
- **Right side**: Horizontal score bars for each category, sorted lowest-first, with index, name, colored bar, score/10

### Current state
- **SEO (slide 10)**: `audit-hero` (ScoreGauge + info + SERP mockup) + `score-bars-3col` grid of ScoreBar components
- **CRO (slide 8)**: `audit-hero` (ScoreGauge + info) + `cro-scores-grid` 2-col grid of ScoreBar + interpretation text + findings list

### Data available
- SEO: `seoAudit.overallScore` (0-10), `categoryScores` (Record<string, number>, each 0-10), 12-16 categories
- CRO: `overallScore` (0-10), 6 sub-scores (firstImpressionScore, trustScore, ctaScore, leadCaptureScore, contentReadabilityScore, navigationScore), each 0-10

### New design from screenshot
- Overall score displayed as /100 (multiply by 10)
- Ring gauge: simple circle with arc filled proportionally, not the current half-dial
- Status label: Critical (<30), Needs Work (<50), Fair (<65), Good (<80), Excellent (>=80)
- Bars: sorted by score ascending (worst first), bar width = score/10 * 100%, colors: <=3/10 red, <=5/10 orange, >5/10 green-ish
- Each bar row has: category index (original numbering), category name, colored bar on light grey track, score/10 on right

### New component: `HealthScorePanel`
Props: `title`, `subtitle`, `overallScore` (0-10), `categories` (array of {label, score})

### Ring gauge component: `RingGauge`  
Props: `score` (0-100)
- SVG circle, stroke-dasharray for progress arc
- Color: red <30, orange <50, amber <65, green <80, bright green >=80
- Shows score number centered, "/100" below, status word below the gauge

## Steps
1. Add a `RingGauge` component in page.tsx (after existing ScoreGauge) — SVG ring showing score/100 with color coding and status label, replacing the half-dial for the new layout
2. Add a `HealthScorePanel` component in page.tsx that renders the full layout: RingGauge on left, sorted category bars on right (each bar = index, name, colored bar on grey track, score/10)
3. Replace SEO slide 10 audit-hero + score-bars-3col section with a single `HealthScorePanel` using title "SEO Health Score", subtitle with category count, overallScore, and categoryScores data — keep the SERP mockup below
4. Replace CRO slide 8 audit-hero + cro-scores-grid section with a single `HealthScorePanel` using title "CRO Health Score", subtitle with category count, overallScore, and the 6 CRO sub-scores — keep the CRO findings list below
5. Add CSS for `.health-panel`, `.ring-gauge`, `.health-bars`, `.health-bar-row`, `.health-bar-track`, `.health-bar-fill` in report.css
6. Run `npx tsc --noEmit` and `npm test` to verify no errors
