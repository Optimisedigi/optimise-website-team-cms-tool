/**
 * Two tweaks to the in-the-picture Commercial Model slide's Phase 01 card:
 *
 *   1. Drop the "plus retainer" wording from amountSub. The slide-level note
 *      already covers the retainer-vs-build-cost relationship; the card now
 *      reads simply "$16,000 one-time".
 *
 *   2. Make analytics + CMS being part of the platform explicit. Existing
 *      features mention both in passing; we promote them to a dedicated line
 *      so it's unmissable on the card.
 *
 * Idempotent.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/update-itp-commercial-build-launch.ts
 */
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

type Phase = {
  tier?: string | null;
  name?: string | null;
  amount?: string | null;
  amountSub?: string | null;
  featured?: boolean | null;
  features?: Array<{ item?: string | null }> | null;
};

const NEW_FEATURE = "Analytics & dashboards built into the CMS platform";

async function main(): Promise<void> {
  const payload = await getPayload({ config: payloadConfig });

  const res = await payload.find({
    collection: "client-proposals",
    where: { slug: { equals: "in-the-picture" } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  const proposal = res.docs[0] as unknown as {
    id: number;
    businessName: string;
    commercialPhases?: Phase[] | null;
  };
  if (!proposal) {
    console.error("Proposal 'in-the-picture' not found");
    process.exit(1);
  }

  const phases: Phase[] = Array.isArray(proposal.commercialPhases)
    ? proposal.commercialPhases
    : [];

  console.log(`Proposal id=${proposal.id} (${proposal.businessName})`);

  const updated = phases.map((phase) => {
    if (phase.tier !== "PHASE 01") return phase;

    const before = { ...phase };
    const features = Array.isArray(phase.features) ? [...phase.features] : [];

    // Append the new analytics/CMS line unless it's already there. Leave
    // every other existing feature in place — the user only asked to add a
    // line, not replace existing copy.
    const alreadyHas = features.some(
      (f) => (f.item ?? "").trim() === NEW_FEATURE,
    );
    const nextFeatures = alreadyHas ? features : [...features, { item: NEW_FEATURE }];

    const nextPhase: Phase = {
      ...phase,
      amountSub: "one-time",
      features: nextFeatures,
    };

    console.log("\nPHASE 01 changes:");
    console.log(
      `  amountSub: ${JSON.stringify(before.amountSub)} \u2192 ${JSON.stringify(nextPhase.amountSub)}`,
    );
    console.log(
      `  features: ${before.features?.length ?? 0} \u2192 ${nextFeatures.length}`,
    );
    for (const f of nextFeatures) console.log(`    - ${f.item}`);

    return nextPhase;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (payload as any).update({
    collection: "client-proposals",
    id: proposal.id,
    overrideAccess: true,
    data: { commercialPhases: updated },
  });

  console.log("\n\u2705 Phase 01 updated.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
