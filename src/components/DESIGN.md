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

---

# Blog post prompter

## Design read

- **Surface:** Payload-admin editorial workflow, led by a compact application UI.
- **Audience:** internal content strategists working primarily with keyboard and mouse, with touch and narrow-screen support.
- **Single job:** turn one selected client idea into a precise, reusable blog brief and draft.
- **Risk:** saving against the wrong client or losing manually entered brief details carries the highest task cost.
- **Platform:** Next.js/Payload admin; responsive from phone-width reflow to a 960px desktop content rail.

## Thesis and evidence

The supplied `blog-prompter.html` is the visual source of truth: a pale neutral canvas, crisp white bordered cards, compact IBM Plex typography, ranked backlog rows, restrained status pills, and a dark monospace prompt output. Existing client scoping, proposed-idea filtering, voice input, AI suggestion, saving, publishing, deletion, and draft generation remain functional rather than being replaced by static prototype data.

## Components and states

- The backlog keeps the reference row anatomy while exposing the existing manual/proposed tabs and proposed-blog filters.
- Client selection stays at the backlog header so all visible and saved records remain explicitly scoped.
- Brief fields preserve the project schema; the two-column layout collapses to one column below 700px.
- Buttons have hover, disabled, press, keyboard focus, and reduced-motion behavior; destructive actions use text/icon shape as well as colour.
- Loading, empty, selected, success, error, disabled, generated-prompt, generated-markdown, and selected-brief detail states are represented.
- Controls have explicit accessible names and live messages announce async outcomes. Forced-colors and assistive-technology testing remain runtime checks.
