# Tool Mockups — attached screenshots

All three CMS screenshots referenced in the application are attached on the final page of the document.

## 1. Google Ads Dashboard

The client-facing reporting dashboard for Malcolm Thompson Pumps. Shows spend, clicks, avg CPC, conversions and CPA with vs-last-year comparison, monthly performance chart (spend + conversions overlay), conversion split by action (form submission, phone click, email click, get directions), and a top-4 campaigns table. This is the kind of report our team views internally and the kind of view we share with clients via PIN-gated links. The data shown is served from our own database, which is synced from the Google Ads API.

> Source file: `docs/google-ads-api-application/images/01-dashboard.png`

## 2. Account Structure Explorer

Drill-down from customer → campaign → ad group → keyword, showing the live data the CMS has synced from the Google Ads API. Demonstrates that the tool mirrors account structure for navigation and reporting. The health-coded rows (green / orange / red) are derived from CPA thresholds configured per client.

> Source file: `docs/google-ads-api-application/images/02-account-structure.png`

## 3. Ad Copy Editor

The CMS's RSA workflow: generated headlines per ad group, live Google Ads preview pane, PIN-gated publish toggle, and a public preview link (`/ad-copy/<slug>`) for client sign-off. The deploy that follows approval is what the application calls `AdGroupAdService` to write into the customer's account.

> Source file: `docs/google-ads-api-application/images/03-ad-copy.png`
