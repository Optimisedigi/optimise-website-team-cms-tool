/**
 * Create the AutoTrader client record and register its Google Ads audit deck
 * so the PIN gate on /partners/autotrader/google-ads-audit can resolve.
 *
 * The gate (src/app/(frontend)/api/audit-auth/route.ts) splits the slug into
 * `<clientSlug>/<deckSlug>`, finds the client by slug, checks the deck is
 * listed in `presentations[]`, then compares the submitted PIN against
 * `clientPin`. All three must exist or the deck cannot be unlocked.
 *
 * `clientPin` is `unique: true` on the Clients collection, so the PIN below
 * must not already belong to another client — Payload will reject the write
 * with a validation error if it does. That is intentional: two clients
 * sharing a PIN would let each unlock the other's decks.
 *
 * Idempotent: re-running updates the PIN and ensures the presentation entry
 * exists exactly once, rather than creating duplicates.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/add-autotrader-client.ts
 */
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";
import type { Client } from "../src/payload-types";

const CLIENT_SLUG = "autotrader";
const CLIENT_NAME = "AutoTrader";
const DECK_SLUG = "google-ads-audit";
const DECK_TITLE = "Google Ads Audit";

/**
 * Set to an unused 4-digit code. Must not collide with an existing client.
 * 1234 was the first choice but is already assigned to Berendsen.
 */
const CLIENT_PIN = "2244";

type Presentation = NonNullable<Client["presentations"]>[number];

const DECK_ENTRY: Presentation = {
  title: DECK_TITLE,
  deckSlug: DECK_SLUG,
  kind: "deck",
  isPublic: true,
};

async function main() {
  const payload = await getPayload({ config: await payloadConfig });

  const existing = await payload.find({
    collection: "clients",
    where: { slug: { equals: CLIENT_SLUG } },
    limit: 1,
    overrideAccess: true,
  });

  const current = existing.docs[0] as Client | undefined;

  if (current) {
    const presentations: Presentation[] = current.presentations ?? [];
    const hasDeck = presentations.some((p) => p?.deckSlug === DECK_SLUG);

    const updated = await payload.update({
      collection: "clients",
      id: current.id,
      overrideAccess: true,
      data: {
        clientPin: CLIENT_PIN,
        presentations: hasDeck ? presentations : [...presentations, DECK_ENTRY],
      },
    });

    console.log(
      `Updated client #${updated.id} (${updated.name}) — PIN set to ${CLIENT_PIN}, ` +
        `deck ${hasDeck ? "already registered" : "registered"}.`,
    );
    return;
  }

  const created = await payload.create({
    collection: "clients",
    overrideAccess: true,
    data: {
      name: CLIENT_NAME,
      slug: CLIENT_SLUG,
      clientPin: CLIENT_PIN,
      presentations: [DECK_ENTRY],
    },
  });

  console.log(
    `Created client #${created.id} (${CLIENT_NAME}, slug "${CLIENT_SLUG}") ` +
      `with PIN ${CLIENT_PIN} and deck "${DECK_SLUG}".`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
