# Improve Field Descriptions & Hide Raw JSON Fields

## Task 1: Add clear "influences" descriptions to input fields

Across all collections, any field that feeds into an audit, report, dashboard, or automation should have a description that explains what it affects. Currently many just say "Type of business" with no hint that it drives audit scoring, campaign proposals, etc.

### Fields to update (by collection)

**Google Ads Audits (`src/collections/GoogleAdsAudits.ts`)**
- `monthlySpend` (line 264): Currently "Client-stated monthly ad spend ($)" → add "Sent to the audit engine to contextualise waste as a % of spend."
- `brandTerms` (line 289): Currently no description in admin → add "Used by the audit, campaign proposal, negative list builder, and email generation to identify and exclude brand search terms."
- `conversionObjectives` (line 282): Currently no description in admin → add "Used by the audit engine and email to evaluate conversion tracking alignment. One per line."
- `businessType` (line 247): Currently "Type of business" → add "Influences audit scoring weights and campaign proposal structure."
- `adCopyBrandHeadlines` (line 797): Currently mentions examples → add note it's "Included in every generated ad group's RSA headlines."

**Client Proposals (`src/collections/ClientProposals.ts`)**
- `businessType` (line 357): Currently "Type of business — used for audit weighting" → expand to "Drives SEO/CRO audit scoring weights, proposal report presentation, and carries over to the Client record on conversion."
- `conversionGoal` (line 376): Currently "Primary conversion goal — used for CRO audit" → expand to "Drives CRO audit analysis and is shown on the client-facing proposal report."
- `targetLocation` (line 495): Currently "Location for keyword tracking and competitor analysis" → expand to "Determines the geo-location used for keyword volume lookups and competitor ranking checks."
- `keywordCategories` (line 456): Currently mentions grouping → add "All keywords across categories are sent to the audit engine for SEO ranking checks and competitor analysis."
- `websiteUrl` (line 282): Currently "Prospect website URL" → add "Used by SEO, CRO, and content audits to crawl and analyse the site."
- `googleAdsCustomerId` (line 419): Fine as is — already clear.
- `screenshotClickSelector` (line 426): Fine — already explains.
- `googleMapsUrls` (line 331): Currently "Google Maps listing URLs for GBP analysis" → add "Used by the audit to analyse Google Business Profile listings against competitors."

**Clients (`src/collections/Clients.ts`)**
- `brandKeywords` (line 1685): Currently "Brand terms to filter out from generic query analysis (one per line)" → expand to "Used by GSC monitoring, Google Ads dashboard, and quality score analysis to separate brand vs. generic traffic."
- `dashboardConversionActions` (line 544): Currently mentions showing conversions → expand to "Filters the Google Ads dashboard to only show these conversion actions. Leave blank to show all."
- `websiteType` (line 283): Currently mentions GSC alerts → expand to "Used by the tag setup checker to determine if issues are auto-fixable (built by us) or advisory-only (external)."
- `externalCms` (line 295): Currently "Which CMS platform" → add "Used by the tag setup checker to generate platform-specific fix instructions."
- `ga4MeasurementId` (line 1539): Currently has format hint → add "Used by the tag setup audit to verify GA4 is properly installed on the site."
- `gtmContainerId` (line 1555): Currently has format hint → add "Used by the tag setup audit and auto-generated bookmarks."
- `expectedEvents` (line 1569): Currently "Expected GA4 events" → add "The tag setup audit checks the site for these specific events and flags missing ones."
- `blogCategories` (line 1399): Currently "Blog categories for this client" → add "Pre-populates the category dropdown in the Blog Prompter."
- `blogTags` (line 1406): Currently "Available tags" → add "Pre-populates the tag options in the Blog Prompter."
- `servicePages` (line 1413): Currently mentions blog prompt requirements → add "Auto-inserted into generated blog prompts as internal linking requirements."
- `conversionGoal` (line 404): Currently "Primary conversion goal" → add "Carried over from proposal. Shown on client reports."
- `businessType` (line 764, Analysis tab): Currently "Type of business — used for report weighting and presentation" → fine, already descriptive.
- `targetLocation` (line 785, Analysis tab): Currently "Primary target location for rankings" → fine.
- `keywords` (line 799, Analysis tab): Currently "Consolidated keyword list" → add "Used as reference for blog content strategy and client reporting."
- `accountManagers` (line 330): Currently "Team members managing this client" → already mentions notifications, fine.

## Task 2: Hide rawData and scoredReport from the Audit Results tab

These JSON fields are system-internal data blobs that clutter the admin UI:
- `rawData`: Written during audit, immediately stripped by afterRead hook. Never read back by any component or API. Should be completely hidden.
- `scoredReport`: Used by the presentation page and email regeneration API, but the raw JSON editor on the Audit Results tab is not useful to the team. The `GoogleAdsAuditPreview` component already renders a user-friendly version of this data. Should be hidden.
- `emailHtml`: Already readOnly. Used by send-email. The raw textarea is not useful — the Presentation tab shows a preview. Should be hidden.

**Approach:** Set `admin.hidden: true` on `rawData`, `scoredReport`, and `emailHtml` in GoogleAdsAudits.ts. The data is still stored and accessible via API, just hidden from the admin UI.

## Steps

1. In `src/collections/GoogleAdsAudits.ts`, update field descriptions for `monthlySpend`, `brandTerms`, `conversionObjectives`, `businessType`, and `adCopyBrandHeadlines` to explain what each influences. Also set `admin.hidden: true` on `rawData`, `scoredReport`, and `emailHtml` fields in the Audit Results tab.
2. In `src/collections/ClientProposals.ts`, update field descriptions for `businessType`, `conversionGoal`, `targetLocation`, `keywordCategories`, `websiteUrl`, and `googleMapsUrls` to explain what each influences.
3. In `src/collections/Clients.ts`, update field descriptions for `brandKeywords`, `dashboardConversionActions`, `websiteType`, `externalCms`, `ga4MeasurementId`, `gtmContainerId`, `expectedEvents`, `blogCategories`, `blogTags`, `servicePages`, `conversionGoal`, and `keywords` to explain what each influences.
4. Run `npx tsc --noEmit` and `npm test` to verify no type errors or test failures.
