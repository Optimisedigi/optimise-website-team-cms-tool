/**
 * Inspect proposal overrideMonthlyVisits, yourProfile traffic, and the
 * proposal-side competitors[] array so we can decide where to write the ad
 * flags + ITP's own visits.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/inspect-itp-overrides.ts
 */
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

async function main() {
  const payload = await getPayload({ config: payloadConfig });

  const proposalRes = await payload.find({
    collection: "client-proposals",
    where: { slug: { equals: "in-the-picture" } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = proposalRes.docs[0] as any;
  if (!p) {
    console.error("Proposal not found");
    process.exit(1);
  }

  console.log("overrideMonthlyVisits:", p.overrideMonthlyVisits);
  console.log("\nproposal.competitors:");
  console.log(JSON.stringify(p.competitors, null, 2));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ca = (await payload.findByID({
    collection: "competitor-analyses",
    id: p.competitorAnalysis,
    overrideAccess: true,
  })) as any;

  console.log("\nyourProfile.domain:", ca.yourProfile?.domain);
  console.log(
    "yourProfile.traffic.monthlyVisits:",
    ca.yourProfile?.traffic?.monthlyVisits,
  );
  console.log("\ncompetitors googleAds / metaAds flags:");
  for (const c of ca.competitors ?? []) {
    console.log(
      `  ${c.domain}  google=${c.googleAds?.isRunningAds}  meta=${c.metaAds?.isRunningAds}`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
