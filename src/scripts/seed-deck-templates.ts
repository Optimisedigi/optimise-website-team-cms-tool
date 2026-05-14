/**
 * One-shot seed: insert the google-ads-audit-15-slide deck-templates row
 * if it does not already exist. Safe to re-run.
 *
 * Usage:
 *   npx tsx src/scripts/seed-deck-templates.ts
 */
import { getPayload } from "payload";
import configPromise from "../payload.config";

async function main() {
  const payload = await getPayload({ config: configPromise });

  const existing = await payload.find({
    collection: "deck-templates" as any,
    where: { templateSlug: { equals: "google-ads-audit-15-slide" } },
    limit: 1,
  });

  if (existing.totalDocs > 0) {
    console.log("Already seeded: google-ads-audit-15-slide");
    process.exit(0);
  }

  const doc = await payload.create({
    collection: "deck-templates" as any,
    data: {
      templateSlug: "google-ads-audit-15-slide",
      name: "Google Ads Audit — 15-slide deck",
      description:
        "Full 15-slide Google Ads account audit deck. Cover, TL;DR, account-at-a-glance, audit score, category breakdown, non-brand trend, ad-group breakdown, search terms, landing pages, AI Overviews impact, recommendations, opportunity, how we work, working together, closing.",
      category: "google-ads-audit",
      isActive: true,
      isDefault: true,
    },
  });
  console.log("Seeded deck-template:", doc.id);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
