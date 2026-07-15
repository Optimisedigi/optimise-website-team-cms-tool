/**
 * Shared Meta Ad Library enrichment for proposal competitors.
 *
 * Extracted from the inline social-links → meta-ads → blob-upload block in
 * `POST /api/proposals/[id]/run-audits` so the same logic can be re-run in
 * isolation by `POST /api/proposals/[id]/refresh-meta-ads`.
 *
 * The Meta Ad Library scrape (via the Scrapling service against Facebook's Ad
 * Library) is the slowest and flakiest stage of the audit pipeline. It must
 * NEVER block proposal completion — callers treat a failure here as non-fatal
 * and surface it through a separate `metaAdsStatus` field instead.
 */

import { checkMetaAdsViaScrapling, extractSocialLinks } from "@/lib/scrapling-service";
import { uploadScreenshotToBlob } from "@/lib/blob-upload";

// A Meta Ad Library scrape (headless browser + clicking into individual ads)
// realistically takes ~15-25s, plus time queued behind the Scrapling service's
// browser-concurrency gate. Keep the per-item budget well above that so items
// aren't killed mid-flight or while waiting in the queue.
const DEFAULT_ITEM_TIMEOUT_MS = 50_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

function cleanDomain(domain: string): string {
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

export interface FetchMetaAdsResult {
  /** Competitors array with `metaAds`/`socialLinks` merged in (all other fields preserved). */
  updated: any[];
  /** How many competitor domains we attempted a fetch for. */
  attempted: number;
  /** How many competitors ended up flagged as running Meta ads. */
  withAds: number;
  /** How many fetches failed (threw or rejected). */
  failed: number;
  /** How many competitors were skipped because the deadline was exhausted. */
  skipped: number;
}

/**
 * Fetch Meta Ad Library data for each competitor and merge it back into a new
 * competitors array. Preserves every existing competitor field (screenshots,
 * traffic, GBP, etc.) — only `metaAds` and `socialLinks` are (re)written.
 *
 * @param competitors The competitor objects from a competitor-analyses record.
 * @param opts.timeoutMs Per-item timeout for each scrapling call.
 * @param opts.deadlineAt Absolute `Date.now()` budget; competitors processed
 *   after this point are skipped (their existing metaAds is left untouched).
 */
export async function fetchMetaAdsForCompetitors(
  competitors: any[],
  opts?: { timeoutMs?: number; deadlineAt?: number },
): Promise<FetchMetaAdsResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_ITEM_TIMEOUT_MS;
  const deadlineAt = opts?.deadlineAt;

  const source = Array.isArray(competitors) ? competitors : [];
  const workItems = source
    .map((competitor) => ({
      competitor,
      domain: competitor?.domain ? cleanDomain(String(competitor.domain)) : "",
    }))
    .filter(({ domain }) => Boolean(domain));

  if (workItems.length === 0) {
    return { updated: source, attempted: 0, withAds: 0, failed: 0, skipped: 0 };
  }

  let skipped = 0;

  const results = await Promise.allSettled(
    workItems.map(async ({ competitor, domain }) => {
      if (deadlineAt != null && Date.now() >= deadlineAt) {
        skipped++;
        throw new Error("Skipped — audit deadline reached");
      }

      // Reuse social links captured by the core competitor audit. Starting a
      // second browser job for the same homepage needlessly doubles Scrapling
      // load; extract them only when the audit did not save a Facebook link.
      const storedSocialLinks = competitor?.socialLinks;
      const storedFacebook = typeof storedSocialLinks?.facebook === "string"
        ? storedSocialLinks.facebook.trim()
        : "";
      const socialLinks = storedFacebook
        ? storedSocialLinks
        : await withTimeout(extractSocialLinks(domain), timeoutMs).catch(() => null);

      // Use the Facebook handle for Meta Ad Library (fall back to domain).
      const searchTerm = socialLinks?.facebook || domain;
      if (socialLinks?.facebook) {
        console.log(`[meta-ads] Using Facebook handle "${socialLinks.facebook}" for ${domain}`);
      }

      const result = await withTimeout(checkMetaAdsViaScrapling(searchTerm), timeoutMs);

      // Step 3: upload base64 ad screenshots to Vercel Blob
      if (result.adScreenshots.length > 0) {
        const uploadedUrls: string[] = [];
        for (const b64 of result.adScreenshots) {
          try {
            const buffer = Buffer.from(b64, "base64");
            const blobUrl = await uploadScreenshotToBlob(buffer, `meta-ad-${domain}`);
            if (blobUrl) uploadedUrls.push(blobUrl);
          } catch {
            // Skip failed uploads
          }
        }
        result.adScreenshots = uploadedUrls;
      }

      return { domain, metaAds: result, socialLinks };
    }),
  );

  // Build a lookup of successful results keyed by clean domain
  const byDomain = new Map<string, { metaAds: any; socialLinks: any }>();
  let failed = 0;
  let withAds = 0;
  for (const r of results) {
    if (r.status !== "fulfilled") {
      failed++;
      continue;
    }
    byDomain.set(r.value.domain, { metaAds: r.value.metaAds, socialLinks: r.value.socialLinks });
    if (r.value.metaAds?.isRunningAds) withAds++;
  }

  // `skipped` fetches also count as failed rejections above — de-duplicate so
  // callers can distinguish a real failure from a deadline skip.
  failed = Math.max(0, failed - skipped);

  const updated = source.map((comp) => {
    const key = comp?.domain ? cleanDomain(String(comp.domain)) : "";
    const hit = key ? byDomain.get(key) : undefined;
    if (!hit) return comp;
    const next = { ...comp, metaAds: hit.metaAds };
    if (hit.socialLinks) next.socialLinks = hit.socialLinks;
    return next;
  });

  return { updated, attempted: workItems.length, withAds, failed, skipped };
}
