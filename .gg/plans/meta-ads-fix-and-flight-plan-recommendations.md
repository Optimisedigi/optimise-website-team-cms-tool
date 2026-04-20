# Meta Ads Image Fix + Flight Plan Recommendations System

## Part 1: Meta Ads Image Bug

**Root cause**: In `src/app/(frontend)/proposals/[slug]/page.tsx` line 1525, meta ad screenshots are only rendered as images if they match `u.startsWith('/') || u.includes('/media/')`. But all screenshots — both CMS-uploaded (Vercel Blob) and API-captured (Scrapling → Blob upload) — produce URLs like `https://xxxx.blob.vercel-storage.com/...` which fail this check. They fall through to the "View Ad" link fallback instead.

**Fix**: Change the `hasImageUrls` check to also accept `https://` URLs (Blob storage URLs), or simplify it to always render as images when the URL looks like an image URL. The original intent was to distinguish between Facebook Ad Library page URLs vs actual image URLs. A better heuristic: render as images if the URL starts with `/`, `http`, or `data:`.

## Part 2: Flight Plan Recommendations

**Concept**: A predefined set of recommendation templates stored as an array field in the CMS. Each recommendation has a title, description, benefit, and a checkbox. When checked, it appears on the Flight Plan slide in order. This makes it one-click to build a tailored flight plan for any client.

### Predefined Recommendations (initial set)

- **New Website Build** — A modern, mobile-first website built for conversions. Fast-loading, professional design that builds trust and drives enquiries.
- **Conversion Rate Optimisation (CRO)** — Optimise the website journey to convert more visitors into leads. Clear CTAs, trust signals, and streamlined forms.
- **Technical SEO Foundation** — Fix crawlability, indexing, site speed, and structured data so Google can properly rank the site.
- **On-Page SEO & Content Optimisation** — Optimise page titles, meta descriptions, headings, and content structure for target keywords.
- **Local SEO & Google Business Profile** — Optimise Google Business Profile, local citations, and location-based content for local search visibility.
- **Content Strategy & Blog** — Publish high-quality, keyword-targeted content that answers real customer questions and builds topical authority over time.
- **Google Ads (Search)** — Launch targeted search campaigns to capture high-intent traffic immediately while organic rankings build.
- **Google Ads (Performance Max / Shopping)** — Performance Max campaigns for e-commerce or service-based lead generation with AI-optimised bidding.
- **Meta Ads (Facebook & Instagram)** — Paid social campaigns for brand awareness, retargeting, and lead generation across Meta platforms.
- **Link Building & Digital PR** — Build high-quality backlinks through outreach, partnerships, and digital PR to boost domain authority.
- **Email Marketing & Automation** — Set up automated email sequences for lead nurture, re-engagement, and customer retention.
- **Analytics & Tracking Setup** — Implement GA4, conversion tracking, and reporting dashboards to measure ROI and make data-driven decisions.

### CMS Field Design

New array field `flightPlanRecommendations` on `ClientProposals` in the "Post report input" tab:

```
flightPlanRecommendations: array
  - enabled: checkbox (default false)
  - title: text (required)
  - description: textarea
  - benefit: text (short outcome statement)
  - priority: number (display order, auto from array position)
```

### Display on Flight Plan Slide

Recommendations render ABOVE the existing flightPlan rich text content and mockup button. Each enabled recommendation shows as a numbered card with title, description, and benefit badge.

## Steps

1. Fix meta ads image bug in `src/app/(frontend)/proposals/[slug]/page.tsx` line 1525 — change `hasImageUrls` check to treat any URL starting with `http` or `/` or `data:` as an image URL, removing the `/media/` specific check
2. Add `flightPlanRecommendations` array field to `ClientProposals.ts` in the "Post report input" tab after the `flightPlan` field — each item has `enabled` (checkbox), `title` (text), `description` (textarea), `benefit` (text)
3. Read and render `flightPlanRecommendations` on the Flight Plan slide (Slide 16) in `src/app/(frontend)/proposals/[slug]/page.tsx` — show enabled items as numbered recommendation cards above the existing flight plan content
4. Add CSS for `.flight-plan-recs`, `.flight-plan-rec-card`, `.flight-plan-rec-number`, `.flight-plan-rec-title`, `.flight-plan-rec-desc`, `.flight-plan-rec-benefit` in `src/app/(frontend)/proposals/[slug]/report.css`
5. Run `npx tsc --noEmit` and `npm test` to verify no errors
