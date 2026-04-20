# Competitor GBP Enrichment from Google Maps URLs

## Problem

When CMS competitors have a Google Maps URL filled in, the Competitor Analysis slide still shows "—" for GBP (no rating/reviews). This is because:

1. **Growth tools** looks up GBP by searching Serper Places API with `q: domain` and matching by website field — this fails for most local businesses whose domain doesn't match their Google Maps listing.
2. **CMS override fields** (`gbpRating`, `gbpReviewCount`) exist but must be manually filled in — the user shouldn't have to do this when they've already provided the Google Maps URL.
3. **The Google Maps URL is never used** to fetch GBP data.

## Solution

Two-part fix across growth-tools and content-cms:

### Part A: Growth Tools — new GBP lookup endpoint

Add a new method `getBusinessProfileByName(businessName, location)` in `serp-service.ts` that searches Serper Places by **business name** (instead of domain). Then expose it via a new endpoint `/api/gbp-lookup` that the CMS can call.

**File:** `website-growth-tools/server/serp-service.ts`
- Add `getBusinessProfileByName(name: string, location: string)` method — searches Serper Places with `q: businessName`, returns the **first** result (no domain matching needed since we're searching by exact business name from a confirmed Google Maps listing).

**File:** `website-growth-tools/server/routes.ts`
- Add `POST /api/gbp-lookup` endpoint — accepts `{ name: string, location: string }`, calls `serpService.getBusinessProfileByName(name, location)` + `serpService.getReviewResponseRate(cid)`, returns the full GBP profile.

### Part B: Content CMS — GBP enrichment in run-audits

After the competitor analysis completes and screenshots/meta ads are processed, add a new enrichment step that:

1. Iterates CMS competitors that have a `googleMapsUrl` 
2. Checks if the matching competitor in `enrichedCompetitors` already has `googleBusinessProfile` data
3. If not, calls the new growth-tools `/api/gbp-lookup` endpoint with the competitor's `name` and proposal's `targetLocation`
4. Writes the GBP data back into the competitor in `enrichedCompetitors`
5. **Also** saves the GBP data back to the proposal's `competitors` array (`gbpRating`, `gbpReviewCount`, `gbpRespondsToReviews` fields) so it persists as an override for future renders without needing to re-run audits

**File:** `src/app/(frontend)/api/proposals/[id]/run-audits/route.ts`
- After the traffic backfill section (~line 626), add the GBP enrichment loop.

## Steps

1. In `website-growth-tools/server/serp-service.ts`, add a `getBusinessProfileByName(name: string, location: string)` method to the `SerpService` class — it should search Serper Places API with `q: name`, parse the location params, and return the first matching place's `{ name, rating, reviewCount, category, cid }` (no domain matching, just take the first result). Place it after the existing `getBusinessProfile` method (~line 440).

2. In `website-growth-tools/server/routes.ts`, add a `POST /api/gbp-lookup` endpoint (internal-only, rate-limited) that accepts `{ name: string, location?: string }`, calls `serpService.getBusinessProfileByName(name, location)`, and if a result is found with reviewCount > 0, calls `serpService.getReviewResponseRate(cid)`. Returns the full `{ name, rating, reviewCount, category, respondsToReviews, responseRate }` object. Add it near the other competitor-related endpoints (~line 2695).

3. In `src/app/(frontend)/api/proposals/[id]/run-audits/route.ts`, after the traffic backfill section (~line 626, before the final `payload.update` at line 651), add a GBP enrichment step: iterate the CMS competitors (from `proposal.competitors`) that have a `googleMapsUrl`, find their matching entry in `enrichedCompetitors` by domain, and if `googleBusinessProfile` is null/missing, call `POST ${GROWTH_TOOLS_URL}/api/gbp-lookup` with `{ name: competitor.name, location: targetLocation }`. If successful, set `comp.googleBusinessProfile` on the enriched competitor object. Run these lookups in parallel with `Promise.allSettled`.

4. In the same `run-audits/route.ts` file, after the GBP enrichment, also write the fetched GBP data back to the proposal's `competitors` array fields (`gbpRating`, `gbpReviewCount`, `gbpRespondsToReviews`) so the data persists as CMS overrides for future renders. Do this with a single `payload.update` call that updates the `competitors` array.

5. Run `npx tsc --noEmit` in both projects and `npm test` in content-cms to verify no type errors or test failures.
