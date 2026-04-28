/**
 * Probe Growth Tools' Google Ads dashboard endpoint for a given client slug,
 * and inspect what conversion actions come back.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/probe-conversion-actions.ts <slug>
 *
 * What it does:
 *   1. Loads the client from the CMS database by slug.
 *   2. Logs the client's googleAdsCustomerId (the ID we expect Growth Tools to scope to).
 *   3. Calls Growth Tools `/api/google-ads/dashboard/<slug>` with that customerId
 *      (exactly the same way the CMS does in production).
 *   4. Prints `availableConversionActions` from the response.
 *
 * This isolates whether:
 *   - The CMS is sending the right customerId (it logs what it's about to send)
 *   - Growth Tools is honoring it (the response shows what came back)
 */

import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx scripts/probe-conversion-actions.ts <slug>");
    process.exit(1);
  }

  const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
  const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    console.error("Missing GROWTH_TOOLS_URL or INTERNAL_API_KEY in .env");
    process.exit(1);
  }

  console.log("─────────────────────────────────────────────────────────────");
  console.log("STEP 1 — Look up client by slug");
  console.log("─────────────────────────────────────────────────────────────");
  console.log("Slug:", slug);

  const payload = await getPayload({ config: payloadConfig });
  const result = await payload.find({
    collection: "clients",
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  });

  const client = result.docs[0] as any;
  if (!client) {
    console.error(`No client found with slug "${slug}"`);
    process.exit(1);
  }

  console.log("Client name:", client.name);
  console.log("Google Ads Customer ID (raw):", client.googleAdsCustomerId);

  if (!client.googleAdsCustomerId) {
    console.error("Client has no googleAdsCustomerId set.");
    process.exit(1);
  }

  const cleanCustomerId = client.googleAdsCustomerId.replace(/-/g, "");
  console.log("Google Ads Customer ID (dashless):", cleanCustomerId);
  console.log(
    "dashboardConversionActions (CMS override):",
    client.dashboardConversionActions || "(none — show all)",
  );
  console.log("brandKeywords:", client.brandKeywords || "(none)");

  console.log("");
  console.log("─────────────────────────────────────────────────────────────");
  console.log("STEP 2 — Call Growth Tools dashboard endpoint");
  console.log("─────────────────────────────────────────────────────────────");

  const params = new URLSearchParams({
    range: "this_month",
    customerId: cleanCustomerId,
    clientName: client.name,
  });
  if (client.brandKeywords) params.set("brandKeywords", client.brandKeywords);
  // Deliberately NOT sending conversionActions filter, so we see the raw
  // availableConversionActions Growth Tools returns for this customerId.

  const endpoint = `${GROWTH_TOOLS_URL}/api/google-ads/dashboard/${encodeURIComponent(slug)}?${params}`;
  console.log("Endpoint:", endpoint);
  console.log("Headers: x-internal-key: <set>");
  console.log("");

  const start = Date.now();
  const res = await fetch(endpoint, {
    headers: { "x-internal-key": INTERNAL_API_KEY },
    cache: "no-store",
  });
  const elapsed = Date.now() - start;

  console.log(`Response: ${res.status} ${res.statusText} (${elapsed}ms)`);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Body:", text.slice(0, 2000));
    process.exit(1);
  }

  const data = await res.json();

  console.log("");
  console.log("─────────────────────────────────────────────────────────────");
  console.log("STEP 3 — availableConversionActions from response");
  console.log("─────────────────────────────────────────────────────────────");
  const actions: string[] = data.availableConversionActions || [];
  if (actions.length === 0) {
    console.log("(none returned)");
  } else {
    console.log(`Returned ${actions.length} conversion action(s):`);
    for (const a of actions) {
      console.log("  •", a);
    }
  }

  console.log("");
  console.log("─────────────────────────────────────────────────────────────");
  console.log("STEP 4 — Other top-level fields in response (for context)");
  console.log("─────────────────────────────────────────────────────────────");
  const topKeys = Object.keys(data);
  console.log("Keys:", topKeys.join(", "));
  if (data.customerId) console.log("Echoed customerId in response:", data.customerId);
  if (data.totals) {
    console.log("Totals (this month):", {
      spend: data.totals.spend,
      conversions: data.totals.conversions,
      clicks: data.totals.clicks,
      impressions: data.totals.impressions,
    });
  }

  console.log("");
  console.log("─────────────────────────────────────────────────────────────");
  console.log("INTERPRETATION");
  console.log("─────────────────────────────────────────────────────────────");
  console.log(
    `If the actions above include conversion actions that DO NOT belong to`,
  );
  console.log(
    `customer ${cleanCustomerId} (e.g. actions from other MCC accounts), the bug`,
  );
  console.log(
    `is on the Growth Tools side — it's not scoping the conversion-actions`,
  );
  console.log(
    `query to the operating customerId we sent.`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("Probe failed:", err);
  process.exit(1);
});
