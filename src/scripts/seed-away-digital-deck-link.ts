/**
 * One-shot: link Away Digital Teams' existing "google-ads-audit"
 * presentation row to the registered google-ads-audit-15-slide template.
 *
 * Idempotent: if the row already has templateSlug set, exits without
 * changing anything.
 *
 * Usage:
 *   npx tsx src/scripts/seed-away-digital-deck-link.ts
 */
import { getPayload } from "payload";
import configPromise from "../payload.config";
import { googleAdsAudit15SlideSamplePayload } from "../lib/decks/templates/google-ads-audit-15-slide/payload";

async function main() {
  const payload = await getPayload({ config: configPromise });

  // Find Away Digital client.
  const clients = await payload.find({
    collection: "clients",
    where: { slug: { equals: "away-digital" } },
    limit: 1,
    depth: 0,
  });
  const client = clients.docs[0];
  if (!client) {
    console.error("Client with slug 'away-digital' not found.");
    process.exit(1);
  }

  // Find the deck-template doc.
  const tmpl = await payload.find({
    collection: "deck-templates" as any,
    where: { templateSlug: { equals: "google-ads-audit-15-slide" } },
    limit: 1,
  });
  if (tmpl.totalDocs === 0) {
    console.error(
      "deck-templates row for google-ads-audit-15-slide not found. Run seed-deck-templates.ts first.",
    );
    process.exit(1);
  }
  const tmplId = tmpl.docs[0].id;

  const presentations = (client as any).presentations ?? [];
  const idx = presentations.findIndex((p: any) => p?.deckSlug === "google-ads-audit");
  if (idx === -1) {
    console.error("Away Digital has no presentation with deckSlug='google-ads-audit'.");
    process.exit(1);
  }
  if (presentations[idx].templateSlug) {
    console.log("Already linked.");
    process.exit(0);
  }
  presentations[idx] = {
    ...presentations[idx],
    templateSlug: tmplId,
    deckPayload: googleAdsAudit15SlideSamplePayload,
  };

  await payload.update({
    collection: "clients",
    id: (client as any).id,
    data: { presentations },
  });
  console.log("Linked Away Digital presentation to template", tmplId);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
