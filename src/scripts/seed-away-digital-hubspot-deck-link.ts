/**
 * Register the "google-ads-hubspot-3m-analysis" presentation on the Away
 * Digital Teams client record so the deck's PIN gate resolves.
 *
 * The deck page gates on `away-digital-teams/google-ads-hubspot-3m-analysis`;
 * /api/audit-auth splits that into clientSlug + deckSlug and only accepts the
 * PIN if a `presentations[]` row with that deckSlug exists on the client (the
 * PIN itself is the client's own `clientPin`). This script adds that row.
 *
 * Idempotent + additive: it skips if the deckSlug is already present, and
 * otherwise appends a single row leaving every other field untouched.
 *
 * It writes to the DATABASE_URL configured in .env (production Turso). Run a
 * dry run first to confirm the target and current state before applying.
 *
 * Usage:
 *   node --env-file=.env --import tsx src/scripts/seed-away-digital-hubspot-deck-link.ts          # dry run
 *   node --env-file=.env --import tsx src/scripts/seed-away-digital-hubspot-deck-link.ts --apply  # write
 */
import { getPayload } from "payload";
import configPromise from "../payload.config";
import { AWAY_DIGITAL_SLUG } from "../lib/away-digital";

const DECK_SLUG = "google-ads-hubspot-3m-analysis";
const DECK_URL = `https://cms.optimisedigital.online/partners/away-digital/${DECK_SLUG}`;
const TITLE = "Google Ads + HubSpot 3-Month Analysis";

async function main() {
  const apply = process.argv.includes("--apply");
  const dbUrl = process.env.DATABASE_URL ?? "file:./content.db";
  let dbHost = dbUrl;
  try {
    dbHost = dbUrl.startsWith("file:") ? dbUrl : new URL(dbUrl).host;
  } catch {
    /* keep raw */
  }
  console.log(`Target DB: ${dbHost}${apply ? "" : "  (dry run — no writes)"}`);

  const payload = await getPayload({ config: configPromise });

  const clients = await payload.find({
    collection: "clients",
    where: { slug: { equals: AWAY_DIGITAL_SLUG } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const client = clients.docs[0] as
    | { id: number | string; presentations?: { deckSlug?: string | null; title?: string | null }[] }
    | undefined;
  if (!client) {
    console.error(`Client with slug '${AWAY_DIGITAL_SLUG}' not found.`);
    process.exit(1);
  }

  const presentations: Record<string, unknown>[] = Array.isArray(client.presentations)
    ? [...(client.presentations as Record<string, unknown>[])]
    : [];

  console.log(`Client ${client.id} (${AWAY_DIGITAL_SLUG}) has ${presentations.length} presentation(s):`);
  for (const p of presentations) {
    console.log(`  - ${String(p.deckSlug ?? "(no slug)")}  ·  ${String(p.title ?? "(untitled)")}`);
  }

  const idx = presentations.findIndex((p) => p?.deckSlug === DECK_SLUG);
  if (idx !== -1) {
    console.log(`Already registered: presentations[${idx}] has deckSlug '${DECK_SLUG}'. Nothing to do.`);
    process.exit(0);
  }

  presentations.push({
    title: TITLE,
    deckUrl: DECK_URL,
    deckSlug: DECK_SLUG,
    kind: "deck",
    isPublic: true,
  });

  if (!apply) {
    console.log(`[dry-run] Would append to client ${client.id} (${AWAY_DIGITAL_SLUG}):`);
    console.log(`[dry-run]   title:    ${TITLE}`);
    console.log(`[dry-run]   deckUrl:  ${DECK_URL}`);
    console.log(`[dry-run]   deckSlug: ${DECK_SLUG}  (also derived from deckUrl by the Clients hook)`);
    console.log(`[dry-run]   presentations count: ${presentations.length - 1} -> ${presentations.length}`);
    console.log(`[dry-run] Re-run with --apply to write.`);
    process.exit(0);
  }

  await payload.update({
    collection: "clients",
    id: client.id,
    data: { presentations },
    overrideAccess: true,
  });
  console.log(`Registered presentation '${DECK_SLUG}' on client ${client.id} (${AWAY_DIGITAL_SLUG}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
