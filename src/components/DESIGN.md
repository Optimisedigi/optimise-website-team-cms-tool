# Client Pulse dashboard

## Design read

- **Surface:** Payload-admin, desktop-first data-dense dashboard.
- **Audience:** account managers triaging client intervention risk.
- **Single job:** make the riskiest account and its configured KPI evidence obvious at a glance.
- **Risk:** an unsourced or fabricated metric can cause an incorrect client decision.
- **Platform:** Payload admin, keyboard/mouse/touch use, responsive down to narrow viewports.

## Thesis

A shared 1480px rail holds white, bordered cards on the existing neutral admin canvas. Each card has one 3px pulse-colour status bar, a consistent score ring, three CMS-selected metrics, budget pacing, and an inline detail region. Colour signals status, never an invented data state. The visual reference is the supplied Client Pulse handoff; local Payload controls and typography remain the system of record.

## Data sources

- `google_ads_cost_per_lead`, spend, and conversions use persisted `ROLLING_30D_CURRENT` / `ROLLING_30D_PREVIOUS` campaign snapshots.
- `ga4_sessions` and `ga4_key_events` use aggregate-only `client-analytics-snapshots` windows.
- Monthly GA4 bars use `MONTH_YYYY-MM` snapshots; absent history renders an explicit no-data state.
- Organic clicks and WeCanQuit assessments retain their existing aggregate sources.

## States and accessibility

- **Metrics:** first three enabled `clientPulse.dashboardMetrics` rows, in configured order; legacy `analyticsMetrics` remains readable server-side.
- **Details:** explicit View/Hide details button with `aria-expanded`; no hover-only content.
- **Ordering:** Move up/Move down buttons persist the existing preference without non-keyboard-operable drag semantics.
- **Responsive:** 3 columns to 1 column; long names wrap; action controls remain reachable.
- **Accessibility checks implemented:** semantic headings/landmarks, accessible chart summary, visible `:focus-visible`, reduced reliance on colour alone, and no motion-dependent interaction. Forced-colors and assistive-technology validation remain runtime checks.
